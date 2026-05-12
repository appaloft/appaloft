import {
  buildSshRemoteStateDiagnosticsCommand,
  buildSshRemoteStateProcessArgs,
  type SshRemoteStateTarget,
} from "@appaloft/adapter-cli";
import {
  type RemoteStateWorkReadModel,
  type RemoteStateWorkSummary,
  type RepositoryContext,
} from "@appaloft/application";

export interface RemoteStateDiagnosticsRunnerInput {
  target: SshRemoteStateTarget;
  command: string;
  redactions?: readonly string[];
}

export interface RemoteStateDiagnosticsRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
}

export interface RemoteStateDiagnosticsRunner {
  run(
    input: RemoteStateDiagnosticsRunnerInput,
  ): RemoteStateDiagnosticsRunnerResult | Promise<RemoteStateDiagnosticsRunnerResult>;
}

export interface SshRemoteStateWorkReadModelOptions {
  dataRoot: string;
  target: SshRemoteStateTarget;
  serverId?: string;
  staleAfterSeconds?: number;
  runner?: RemoteStateDiagnosticsRunner;
}

type RemoteStatePhase = RemoteStateWorkSummary["phase"];

const remoteStatePhases = new Set<RemoteStatePhase>([
  "remote-state-lock",
  "remote-state-migration",
  "remote-state-backup",
  "remote-state-recovery",
]);

const unsafeDetailKeyPattern =
  /secret|password|passphrase|private[_-]?key|ssh[_-]?key|identity[_-]?file|token|credential|command[_-]?line|commandline/i;
const unsafeDetailValuePattern =
  /(BEGIN .*PRIVATE KEY|PRIVATE_KEY|SECRET_|PASSWORD=|TOKEN=|PASS=)/i;

function defaultRunner(): RemoteStateDiagnosticsRunner {
  return {
    run(input) {
      const result = Bun.spawnSync(
        ["ssh", ...buildSshRemoteStateProcessArgs(input.target), input.command],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stderr = result.stderr.toString();
      const redactedStderr = (input.redactions ?? []).reduce(
        (value, secret) => (secret.length > 0 ? value.replaceAll(secret, "[redacted]") : value),
        stderr,
      );

      return {
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: redactedStderr,
        failed: !result.success,
      };
    },
  };
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function phaseField(record: Record<string, unknown>): RemoteStatePhase | null {
  const phase = stringField(record, "phase");
  return phase && remoteStatePhases.has(phase as RemoteStatePhase)
    ? (phase as RemoteStatePhase)
    : null;
}

function statusField(record: Record<string, unknown>): RemoteStateWorkSummary["status"] {
  const status = stringField(record, "status");
  switch (status) {
    case "pending":
    case "running":
    case "retry-scheduled":
    case "succeeded":
    case "failed":
    case "canceled":
    case "dead-lettered":
    case "unknown":
      return status;
    default:
      return "unknown";
  }
}

function safeDetails(
  record: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
  const details: Record<string, string | number | boolean | null> = {};
  const excluded = new Set([
    "id",
    "status",
    "phase",
    "step",
    "updatedAt",
    "startedAt",
    "finishedAt",
    "errorCode",
    "errorCategory",
    "retriable",
    "nextAction",
  ]);

  for (const [key, value] of Object.entries(record)) {
    if (excluded.has(key) || unsafeDetailKeyPattern.test(key)) {
      continue;
    }

    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean" &&
      value !== null
    ) {
      continue;
    }

    if (typeof value === "string" && unsafeDetailValuePattern.test(value)) {
      continue;
    }

    details[key] = value;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

function redactSecrets(value: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (current, secret) => (secret.length > 0 ? current.replaceAll(secret, "[redacted]") : current),
    value,
  );
}

function parseRemoteStateLine(
  line: string,
  input: {
    serverId?: string;
    fallbackUpdatedAt: string;
  },
): RemoteStateWorkSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const phase = phaseField(record);
  const id = stringField(record, "id");
  if (!phase || !id) {
    return null;
  }

  const status = statusField(record);
  const nextAction = stringField(record, "nextAction");
  const details = safeDetails(record);
  const step = stringField(record, "step");
  const startedAt = stringField(record, "startedAt");
  const finishedAt = stringField(record, "finishedAt");
  const errorCode = stringField(record, "errorCode");
  const errorCategory = stringField(record, "errorCategory");
  const retriable = booleanField(record, "retriable");

  return {
    id,
    status,
    operationKey: "operator-work.list",
    phase,
    ...(step ? { step } : {}),
    ...(input.serverId ? { serverId: input.serverId } : {}),
    ...(startedAt ? { startedAt } : {}),
    updatedAt: stringField(record, "updatedAt") ?? input.fallbackUpdatedAt,
    ...(finishedAt ? { finishedAt } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorCategory ? { errorCategory } : {}),
    ...(retriable === undefined ? {} : { retriable }),
    nextActions:
      status === "failed" || nextAction === "manual-review"
        ? ["diagnostic", "manual-review"]
        : ["no-action"],
    ...(details ? { safeDetails: details } : {}),
  };
}

export class SshRemoteStateWorkReadModel implements RemoteStateWorkReadModel {
  private readonly runner: RemoteStateDiagnosticsRunner;

  constructor(private readonly options: SshRemoteStateWorkReadModelOptions) {
    this.runner = options.runner ?? defaultRunner();
  }

  async list(
    _context: RepositoryContext,
    input?: Parameters<RemoteStateWorkReadModel["list"]>[1],
  ): Promise<RemoteStateWorkSummary[]> {
    if (input?.serverId && this.options.serverId && input.serverId !== this.options.serverId) {
      return [];
    }
    if (input?.serverId && !this.options.serverId) {
      return [];
    }

    const limit = input?.limit ?? 50;
    const result = await this.runner.run({
      target: this.options.target,
      command: buildSshRemoteStateDiagnosticsCommand({
        dataRoot: this.options.dataRoot,
        limit,
        ...(this.options.staleAfterSeconds
          ? { staleAfterSeconds: this.options.staleAfterSeconds }
          : {}),
      }),
      ...(this.options.target.identityFile
        ? { redactions: [this.options.target.identityFile] }
        : {}),
    });
    const fallbackUpdatedAt = new Date().toISOString();

    if (result.failed) {
      const stderr = redactSecrets(
        result.stderr,
        this.options.target.identityFile ? [this.options.target.identityFile] : [],
      );
      return [
        {
          id: "diagnostics-read",
          status: "failed",
          operationKey: "operator-work.list",
          phase: "remote-state-recovery",
          step: "diagnostics-read",
          ...(this.options.serverId ? { serverId: this.options.serverId } : {}),
          updatedAt: fallbackUpdatedAt,
          errorCode: "remote_state_diagnostics_unavailable",
          errorCategory: "infra",
          retriable: true,
          nextActions: ["diagnostic", "manual-review"],
          safeDetails: {
            stateBackend: "ssh-pglite",
            host: this.options.target.host,
            port: this.options.target.port ?? 22,
            exitCode: result.exitCode,
            ...(stderr.trim() ? { stderr: stderr.trim().slice(0, 2_000) } : {}),
          },
        },
      ];
    }

    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) =>
        parseRemoteStateLine(line, {
          ...(this.options.serverId ? { serverId: this.options.serverId } : {}),
          fallbackUpdatedAt,
        }),
      )
      .filter((row): row is RemoteStateWorkSummary => row !== null)
      .slice(0, limit);
  }
}
