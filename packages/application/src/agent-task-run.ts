import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { type ExecutionContext } from "./execution-context";
import {
  type SandboxExecResult,
  type SandboxPortExposure,
  type SandboxProcessDescriptor,
} from "./execution-sandbox";
import { type ControlPlaneSecretProtector, type IntegrationAuthPort } from "./ports";
import {
  type CandidatePreviewRecord,
  type SandboxAgentRunDescriptor,
  type SourceArtifactDescriptor,
} from "./sandbox-agent-runtime";

const taskOutputLimit = 32_000;
const taskPatchLimit = 256_000;
const taskGitPathspec = Object.freeze([
  ".",
  ":(exclude).appaloft/**",
  ":(exclude).appaloft-agent/**",
  ":(exclude).appaloft-process-*.pid",
  ":(exclude).config/**",
  ":(exclude).local/**",
]);
const secretLine =
  /(?:api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)\s*[:=]/iu;
const privateKeyLine = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u;

export interface AgentTaskCheckInput {
  name: string;
  argv: string[];
  required: boolean;
}

export interface AgentTaskPreviewInput {
  startArgv: string[];
  port: number;
  visibility: "private" | "organization" | "public";
  expiresAt: string;
}

export interface AgentTaskCheckResult {
  name: string;
  required: boolean;
  status: "passed" | "failed";
  exitCode: number;
  output: string;
  truncated: boolean;
  redacted: boolean;
}

export interface AgentTaskChanges {
  status: string;
  stat: string;
  patch: string;
  truncated: boolean;
  redacted: boolean;
}

export interface AgentTaskPullRequestInput {
  provider: "github";
  title: string;
  body?: string;
  base?: string;
}

export interface AgentTaskDeliveryInput {
  branch: string;
  commitMessage: string;
  remote: string;
  pullRequest?: AgentTaskPullRequestInput;
}

export interface AgentTaskDeliveryResult {
  remote: string;
  branch: string;
  commitSha: string;
  pullRequestUrl?: string;
}

export type AgentTaskRunStatus =
  | "running"
  | "finalizing"
  | "checks-failed"
  | "awaiting-approval"
  | "approved"
  | "delivering"
  | "delivered"
  | "failed"
  | "cancelled";

export interface AgentTaskRunDescriptor {
  schemaVersion: "agent-task-run/v1";
  taskRunId: string;
  runId: string;
  runtimeId: string;
  workspaceId: string;
  status: AgentTaskRunStatus;
  plan: {
    checks: AgentTaskCheckInput[];
    preview?: AgentTaskPreviewInput;
    immutableReview: boolean;
    sourceRoot: string;
  };
  agentRun: SandboxAgentRunDescriptor;
  checks: AgentTaskCheckResult[];
  changes?: AgentTaskChanges;
  developmentPreview?: SandboxPortExposure;
  previewProcessId?: string;
  sourceArtifact?: SourceArtifactDescriptor;
  candidatePreview?: CandidatePreviewRecord;
  approval?: {
    actorKind: string;
    actorId: string;
    approvedAt: string;
  };
  delivery?: AgentTaskDeliveryResult;
  failure?: {
    phase: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface ProtectedAgentTaskStateFile {
  schemaVersion: "agent-task-state-envelope/v1";
  keyId: string;
  envelope: string;
}

export interface AgentTaskRunDependencies {
  agents: {
    createRun(
      context: ExecutionContext,
      input: {
        sandboxId: string;
        runtimeId: string;
        task: string;
        context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
        idempotencyKey: string;
      },
    ): Promise<Result<SandboxAgentRunDescriptor>>;
    listRuns(
      context: ExecutionContext,
      runtimeId: string,
    ): Promise<Result<{ items: SandboxAgentRunDescriptor[] }>>;
    showRun(
      context: ExecutionContext,
      runtimeId: string,
      runId: string,
    ): Promise<Result<SandboxAgentRunDescriptor>>;
    cancelRun(
      context: ExecutionContext,
      runtimeId: string,
      runId: string,
    ): Promise<Result<SandboxAgentRunDescriptor>>;
    createSourceArtifact(
      context: ExecutionContext,
      input: { sandboxId: string; sourceRoot: string },
    ): Promise<Result<SourceArtifactDescriptor>>;
    createCandidatePreview(
      context: ExecutionContext,
      input: { artifactId: string },
    ): Promise<Result<CandidatePreviewRecord>>;
  };
  sandbox: {
    exec(
      context: ExecutionContext,
      sandboxId: string,
      input: {
        argv: string[];
        cwd?: string;
        background?: boolean;
        timeoutMs?: number;
        stdin?: Uint8Array;
      },
    ): Promise<Result<SandboxExecResult>>;
    readFile(
      context: ExecutionContext,
      sandboxId: string,
      input: { path: string },
    ): Promise<Result<Uint8Array>>;
    writeFile(
      context: ExecutionContext,
      sandboxId: string,
      input: { path: string; content: Uint8Array },
    ): Promise<Result<unknown>>;
    exposePort(
      context: ExecutionContext,
      sandboxId: string,
      input: {
        port: number;
        visibility?: "private" | "organization" | "public";
        expiresAt?: string;
      },
    ): Promise<Result<SandboxPortExposure>>;
    revokePort(
      context: ExecutionContext,
      sandboxId: string,
      exposureId: string,
    ): Promise<Result<void>>;
    terminateProcess(
      context: ExecutionContext,
      sandboxId: string,
      processId: string,
    ): Promise<Result<void>>;
    showProcess(
      context: ExecutionContext,
      sandboxId: string,
      processId: string,
    ): Promise<Result<SandboxProcessDescriptor>>;
  };
  workQueue: {
    enqueue(
      context: ExecutionContext,
      item: { kind: "agent-task-run"; id: string; workspaceId: string },
    ): Promise<void>;
  };
  integrationAuth: Pick<IntegrationAuthPort, "getProviderAccessToken">;
  stateProtector: Pick<ControlPlaneSecretProtector, "protect" | "unprotect">;
  clock: { now(): string };
}

interface CapturedExec {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function taskStatePath(taskRunId: string): string {
  return `.appaloft/tasks/${taskRunId}/state.json`;
}

function bounded(value: string, limit: number): { value: string; truncated: boolean } {
  if (value.length <= limit) return { value, truncated: false };
  return { value: `${value.slice(0, limit)}\n[TRUNCATED]`, truncated: true };
}

function redact(value: string): { value: string; redacted: boolean } {
  let inPrivateKey = false;
  let redacted = false;
  const lines = value.split("\n").map((line) => {
    if (privateKeyLine.test(line)) {
      inPrivateKey = true;
      redacted = true;
      return "[REDACTED PRIVATE KEY]";
    }
    if (inPrivateKey) {
      redacted = true;
      if (/-----END [A-Z0-9 ]*PRIVATE KEY-----/u.test(line)) inPrivateKey = false;
      return "[REDACTED]";
    }
    if (secretLine.test(line)) {
      redacted = true;
      return "[REDACTED SECRET-LIKE OUTPUT]";
    }
    return line;
  });
  return { value: lines.join("\n"), redacted };
}

function safeFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Agent Task operation failed";
  return bounded(redact(message).value, 1_024).value;
}

function captureExec(value: SandboxExecResult, label: string): Result<CapturedExec> {
  if (value.mode !== "foreground") {
    return err(domainError.invariant(`${label} did not return a foreground result`));
  }
  let stdout = "";
  let stderr = "";
  let exitCode: number | undefined;
  for (const frame of value.frames) {
    if (frame.kind === "stdout") stdout += frame.data;
    if (frame.kind === "stderr") stderr += frame.data;
    if (frame.kind === "exit") exitCode = frame.exitCode;
  }
  if (exitCode === undefined) {
    return err(domainError.invariant(`${label} returned no exit frame`));
  }
  return ok({ exitCode, stdout, stderr });
}

function requireArgv(argv: string[], label: string): Result<string[]> {
  if (
    argv.length === 0 ||
    argv.length > 256 ||
    argv.some((part) => part.length > 16_384 || part.includes("\0"))
  ) {
    return err(domainError.validation(`${label} argv is invalid`));
  }
  return ok([...argv]);
}

function updateTask(
  current: AgentTaskRunDescriptor,
  patch: {
    [Key in keyof AgentTaskRunDescriptor]?: AgentTaskRunDescriptor[Key] | undefined;
  },
  now: string,
): AgentTaskRunDescriptor {
  const updated = {
    ...current,
    ...patch,
    schemaVersion: "agent-task-run/v1",
    taskRunId: current.runId,
    runId: current.runId,
    updatedAt: now,
  } as AgentTaskRunDescriptor;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete (updated as unknown as Record<string, unknown>)[key];
    }
  }
  return updated;
}

function externalApprovalActor(
  context: ExecutionContext,
): Result<{ actorKind: string; actorId: string }> {
  const actorKind = context.principal?.kind ?? context.actor?.kind;
  const actorId = context.principal?.actorId ?? context.actor?.id;
  if (!actorKind || !actorId || actorKind === "deploy-token") {
    return err(
      domainError.operationAuthorizationDenied(
        "Agent Task approval and delivery require an external user or trusted CLI actor",
        { code: "agent_task_external_approval_required" },
      ),
    );
  }
  return ok({ actorKind, actorId });
}

export class AgentTaskRunService {
  constructor(private readonly dependencies: AgentTaskRunDependencies) {}

  private async persist(
    context: ExecutionContext,
    result: AgentTaskRunDescriptor,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const protectedState = await this.dependencies.stateProtector.protect(
      { purpose: "agent-task-state" },
      JSON.stringify(result),
    );
    if (protectedState.isErr()) return err(protectedState.error);
    const file: ProtectedAgentTaskStateFile = {
      schemaVersion: "agent-task-state-envelope/v1",
      keyId: protectedState.value.keyId,
      envelope: protectedState.value.envelope,
    };
    const written = await this.dependencies.sandbox.writeFile(context, result.workspaceId, {
      path: taskStatePath(result.taskRunId),
      content: new TextEncoder().encode(JSON.stringify(file)),
    });
    return written.isErr() ? err(written.error) : ok(result);
  }

  private async read(
    context: ExecutionContext,
    input: { workspaceId: string; taskRunId: string },
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const file = await this.dependencies.sandbox.readFile(context, input.workspaceId, {
      path: taskStatePath(input.taskRunId),
    });
    if (file.isErr()) return err(file.error);
    try {
      const parsed = JSON.parse(
        new TextDecoder().decode(file.value),
      ) as ProtectedAgentTaskStateFile;
      if (
        parsed.schemaVersion !== "agent-task-state-envelope/v1" ||
        typeof parsed.envelope !== "string"
      ) {
        return err(domainError.invariant("Agent Task state envelope is invalid"));
      }
      const unprotected = await this.dependencies.stateProtector.unprotect(
        { purpose: "agent-task-state" },
        parsed.envelope,
      );
      if (unprotected.isErr()) return err(unprotected.error);
      const result = JSON.parse(unprotected.value.plaintext) as AgentTaskRunDescriptor;
      if (
        result.schemaVersion !== "agent-task-run/v1" ||
        result.taskRunId !== input.taskRunId ||
        result.workspaceId !== input.workspaceId ||
        result.runId !== input.taskRunId
      ) {
        return err(domainError.invariant("Agent Task state identity is invalid"));
      }
      return ok(result);
    } catch (error) {
      return err(
        domainError.invariant("Agent Task state is unreadable", {
          cause: safeFailureMessage(error),
        }),
      );
    }
  }

  async create(
    context: ExecutionContext,
    input: {
      workspaceId: string;
      runtimeId: string;
      task: string;
      runContext: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
      idempotencyKey: string;
      checks: AgentTaskCheckInput[];
      preview?: Omit<AgentTaskPreviewInput, "expiresAt"> & { expiresAt?: string };
      immutableReview: boolean;
      sourceRoot: string;
    },
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const run = await this.dependencies.agents.createRun(context, {
      sandboxId: input.workspaceId,
      runtimeId: input.runtimeId,
      task: input.task,
      context: input.runContext,
      idempotencyKey: input.idempotencyKey,
    });
    if (run.isErr()) return err(run.error);
    const existing = await this.read(context, {
      workspaceId: input.workspaceId,
      taskRunId: run.value.runId,
    });
    if (existing.isOk()) {
      await this.dependencies.workQueue.enqueue(context, {
        kind: "agent-task-run",
        id: run.value.runId,
        workspaceId: input.workspaceId,
      });
      return existing;
    }
    const now = this.dependencies.clock.now();
    const preview = input.preview
      ? {
          ...input.preview,
          startArgv: [...input.preview.startArgv],
          expiresAt:
            input.preview.expiresAt ??
            new Date(new Date(now).getTime() + 24 * 60 * 60_000).toISOString(),
        }
      : undefined;
    const result: AgentTaskRunDescriptor = {
      schemaVersion: "agent-task-run/v1",
      taskRunId: run.value.runId,
      runId: run.value.runId,
      runtimeId: input.runtimeId,
      workspaceId: input.workspaceId,
      status: "running",
      plan: {
        checks: input.checks.map((check) => ({ ...check, argv: [...check.argv] })),
        ...(preview ? { preview } : {}),
        immutableReview: input.immutableReview,
        sourceRoot: input.sourceRoot,
      },
      agentRun: run.value,
      checks: [],
      createdAt: now,
      updatedAt: now,
    };
    const persisted = await this.persist(context, result);
    if (persisted.isErr()) {
      await this.dependencies.agents.cancelRun(context, input.runtimeId, run.value.runId);
      return persisted;
    }
    try {
      await this.dependencies.workQueue.enqueue(context, {
        kind: "agent-task-run",
        id: result.taskRunId,
        workspaceId: input.workspaceId,
      });
    } catch (error) {
      return err(
        domainError.infra("Agent Task durable work enqueue failed", {
          cause: safeFailureMessage(error),
        }),
      );
    }
    return ok(result);
  }

  async show(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    return this.read(context, { workspaceId, taskRunId });
  }

  async list(
    context: ExecutionContext,
    input: { workspaceId: string; runtimeId: string },
  ): Promise<Result<{ items: AgentTaskRunDescriptor[] }>> {
    const runs = await this.dependencies.agents.listRuns(context, input.runtimeId);
    if (runs.isErr()) return err(runs.error);
    const items: AgentTaskRunDescriptor[] = [];
    for (const run of runs.value.items) {
      const task = await this.read(context, {
        workspaceId: input.workspaceId,
        taskRunId: run.runId,
      });
      if (task.isOk()) items.push(task.value);
    }
    return ok({ items });
  }

  async resume(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const task = await this.read(context, { workspaceId, taskRunId });
    if (task.isErr()) return task;
    if (["running", "finalizing"].includes(task.value.status)) {
      try {
        await this.dependencies.workQueue.enqueue(context, {
          kind: "agent-task-run",
          id: taskRunId,
          workspaceId,
        });
      } catch (error) {
        return err(
          domainError.infra("Agent Task durable work enqueue failed", {
            cause: safeFailureMessage(error),
          }),
        );
      }
    }
    return task;
  }

  async cancel(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const task = await this.read(context, { workspaceId, taskRunId });
    if (task.isErr()) return task;
    if (task.value.status === "cancelled") return task;
    if (!["running", "finalizing"].includes(task.value.status)) {
      return err(domainError.conflict(`Agent Task cannot be cancelled from ${task.value.status}`));
    }
    const run = await this.dependencies.agents.cancelRun(
      context,
      task.value.runtimeId,
      task.value.runId,
    );
    if (run.isErr()) return err(run.error);
    if (task.value.developmentPreview) {
      const revoked = await this.dependencies.sandbox.revokePort(
        context,
        workspaceId,
        task.value.developmentPreview.exposureId,
      );
      if (revoked.isErr()) return err(revoked.error);
    }
    if (task.value.previewProcessId) {
      const terminated = await this.dependencies.sandbox.terminateProcess(
        context,
        workspaceId,
        task.value.previewProcessId,
      );
      if (terminated.isErr()) return err(terminated.error);
    }
    return this.persist(
      context,
      updateTask(
        task.value,
        {
          agentRun: run.value,
          status: "cancelled",
          developmentPreview: undefined,
          previewProcessId: undefined,
        },
        this.dependencies.clock.now(),
      ),
    );
  }

  async approve(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const actor = externalApprovalActor(context);
    if (actor.isErr()) return err(actor.error);
    const task = await this.read(context, { workspaceId, taskRunId });
    if (task.isErr()) return task;
    if (task.value.status === "approved" || task.value.status === "delivered") return task;
    if (task.value.status !== "awaiting-approval") {
      return err(domainError.conflict(`Agent Task cannot be approved from ${task.value.status}`));
    }
    if (task.value.checks.some((check) => check.required && check.status !== "passed")) {
      return err(domainError.conflict("Agent Task has failing required checks"));
    }
    const now = this.dependencies.clock.now();
    return this.persist(
      context,
      updateTask(
        task.value,
        {
          status: "approved",
          approval: {
            ...actor.value,
            approvedAt: now,
          },
        },
        now,
      ),
    );
  }

  async deliver(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
    input: AgentTaskDeliveryInput,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    const actor = externalApprovalActor(context);
    if (actor.isErr()) return err(actor.error);
    let task = await this.read(context, { workspaceId, taskRunId });
    if (task.isErr()) return task;
    if (task.value.status === "delivered") return task;
    if (task.value.status !== "approved" && task.value.status !== "delivering") {
      return err(domainError.conflict(`Agent Task cannot be delivered from ${task.value.status}`));
    }
    task = await this.persist(
      context,
      updateTask(
        task.value,
        { status: "delivering", failure: undefined },
        this.dependencies.clock.now(),
      ),
    );
    if (task.isErr()) return task;
    const delivered = await this.deliverChanges(context, task.value, input);
    if (delivered.isErr()) {
      await this.persist(
        context,
        updateTask(
          task.value,
          {
            status: "approved",
            failure: {
              phase: "delivery",
              message: delivered.error.message,
              retryable: true,
            },
          },
          this.dependencies.clock.now(),
        ),
      );
      return err(delivered.error);
    }
    return this.persist(
      context,
      updateTask(
        task.value,
        {
          status: "delivered",
          delivery: delivered.value,
          failure: undefined,
        },
        this.dependencies.clock.now(),
      ),
    );
  }

  async reconcile(
    context: ExecutionContext,
    workspaceId: string,
    taskRunId: string,
  ): Promise<Result<AgentTaskRunDescriptor>> {
    let task = await this.read(context, { workspaceId, taskRunId });
    if (task.isErr()) return task;
    if (
      [
        "checks-failed",
        "awaiting-approval",
        "approved",
        "delivering",
        "delivered",
        "failed",
        "cancelled",
      ].includes(task.value.status)
    ) {
      return task;
    }
    const run = await this.dependencies.agents.showRun(
      context,
      task.value.runtimeId,
      task.value.runId,
    );
    if (run.isErr()) return err(run.error);
    if (!["completed", "failed", "cancelled"].includes(run.value.status)) {
      task = await this.persist(
        context,
        updateTask(
          task.value,
          { agentRun: run.value, status: "running" },
          this.dependencies.clock.now(),
        ),
      );
      if (task.isErr()) return task;
      return err(
        domainError.conflict("Agent Task is waiting for its Agent Run", {
          code: "agent_task_run_pending",
          taskRunId,
          retryable: true,
        }),
      );
    }
    if (run.value.status === "cancelled") {
      return this.persist(
        context,
        updateTask(
          task.value,
          { agentRun: run.value, status: "cancelled" },
          this.dependencies.clock.now(),
        ),
      );
    }
    if (run.value.status !== "completed") {
      return this.persist(
        context,
        updateTask(
          task.value,
          {
            agentRun: run.value,
            status: "failed",
            failure: {
              phase: "agent-run",
              message: `Agent Run ended with ${run.value.status}`,
              retryable: false,
            },
          },
          this.dependencies.clock.now(),
        ),
      );
    }
    task = await this.persist(
      context,
      updateTask(
        task.value,
        { agentRun: run.value, status: "finalizing", failure: undefined },
        this.dependencies.clock.now(),
      ),
    );
    if (task.isErr()) return task;
    const failFinalization = async (
      failure: DomainError,
    ): Promise<Result<AgentTaskRunDescriptor>> => {
      const latest = await this.read(context, { workspaceId, taskRunId });
      if (latest.isErr()) return latest;
      const persisted = await this.persist(
        context,
        updateTask(
          latest.value,
          {
            status: "finalizing",
            failure: {
              phase: "finalization",
              message: safeFailureMessage(failure),
              retryable: true,
            },
          },
          this.dependencies.clock.now(),
        ),
      );
      return persisted.isErr() ? persisted : err(failure);
    };
    try {
      if (task.value.checks.length < task.value.plan.checks.length) {
        const checks = [...task.value.checks];
        for (const check of task.value.plan.checks.slice(checks.length)) {
          const argv = requireArgv(check.argv, `Agent Task check ${check.name}`);
          if (argv.isErr()) return failFinalization(argv.error);
          const executed = await this.dependencies.sandbox.exec(context, workspaceId, {
            argv: argv.value,
          });
          if (executed.isErr()) return failFinalization(executed.error);
          const captured = captureExec(executed.value, `Agent Task check ${check.name}`);
          if (captured.isErr()) return failFinalization(captured.error);
          const safe = redact(`${captured.value.stdout}${captured.value.stderr}`);
          const output = bounded(safe.value, taskOutputLimit);
          checks.push({
            name: check.name,
            required: check.required,
            status: captured.value.exitCode === 0 ? "passed" : "failed",
            exitCode: captured.value.exitCode,
            output: output.value,
            truncated: output.truncated,
            redacted: safe.redacted,
          });
          task = await this.persist(
            context,
            updateTask(task.value, { checks }, this.dependencies.clock.now()),
          );
          if (task.isErr()) return task;
        }
      }
      const requiredCheckFailed = task.value.checks.some(
        (check) => check.required && check.status === "failed",
      );
      if (!task.value.changes) {
        const changes = await this.captureChanges(context, workspaceId);
        if (changes.isErr()) return failFinalization(changes.error);
        task = await this.persist(
          context,
          updateTask(task.value, { changes: changes.value }, this.dependencies.clock.now()),
        );
        if (task.isErr()) return task;
      }
      if (!requiredCheckFailed && task.value.plan.preview && !task.value.developmentPreview) {
        const previewPlan = task.value.plan.preview;
        let startPreview = !task.value.previewProcessId;
        if (task.value.previewProcessId) {
          const process = await this.dependencies.sandbox.showProcess(
            context,
            workspaceId,
            task.value.previewProcessId,
          );
          startPreview = process.isErr() || process.value.status !== "running";
        }
        if (startPreview) {
          const started = await this.dependencies.sandbox.exec(context, workspaceId, {
            argv: [...previewPlan.startArgv],
            background: true,
          });
          if (started.isErr()) return failFinalization(started.error);
          if (started.value.mode !== "background") {
            return failFinalization(
              domainError.invariant("Agent Task preview did not start in background"),
            );
          }
          task = await this.persist(
            context,
            updateTask(
              task.value,
              {
                previewProcessId: started.value.processId,
                developmentPreview: undefined,
              },
              this.dependencies.clock.now(),
            ),
          );
          if (task.isErr()) return task;
        }
        const exposure = await this.dependencies.sandbox.exposePort(context, workspaceId, {
          port: previewPlan.port,
          visibility: previewPlan.visibility,
          expiresAt: previewPlan.expiresAt,
        });
        if (exposure.isErr()) return failFinalization(exposure.error);
        task = await this.persist(
          context,
          updateTask(
            task.value,
            { developmentPreview: exposure.value },
            this.dependencies.clock.now(),
          ),
        );
        if (task.isErr()) return task;
      }
      if (!requiredCheckFailed && task.value.plan.immutableReview && !task.value.sourceArtifact) {
        const artifact = await this.dependencies.agents.createSourceArtifact(context, {
          sandboxId: workspaceId,
          sourceRoot: task.value.plan.sourceRoot,
        });
        if (artifact.isErr()) return failFinalization(artifact.error);
        task = await this.persist(
          context,
          updateTask(task.value, { sourceArtifact: artifact.value }, this.dependencies.clock.now()),
        );
        if (task.isErr()) return task;
      }
      if (
        !requiredCheckFailed &&
        task.value.plan.immutableReview &&
        task.value.sourceArtifact &&
        !task.value.candidatePreview
      ) {
        const preview = await this.dependencies.agents.createCandidatePreview(context, {
          artifactId: task.value.sourceArtifact.artifactId,
        });
        if (preview.isErr()) return failFinalization(preview.error);
        task = await this.persist(
          context,
          updateTask(
            task.value,
            { candidatePreview: preview.value },
            this.dependencies.clock.now(),
          ),
        );
        if (task.isErr()) return task;
      }
      return this.persist(
        context,
        updateTask(
          task.value,
          {
            status: requiredCheckFailed ? "checks-failed" : "awaiting-approval",
            failure: undefined,
          },
          this.dependencies.clock.now(),
        ),
      );
    } catch (error) {
      return failFinalization(
        domainError.infra("Agent Task finalization failed", {
          cause: safeFailureMessage(error),
        }),
      );
    }
  }

  private async captureChanges(
    context: ExecutionContext,
    workspaceId: string,
  ): Promise<Result<AgentTaskChanges>> {
    const intentToAdd = await this.dependencies.sandbox.exec(context, workspaceId, {
      argv: ["git", "add", "-N", "--", ...taskGitPathspec],
    });
    if (intentToAdd.isErr()) return err(intentToAdd.error);
    const intentCaptured = captureExec(intentToAdd.value, "Agent Task Git intent-to-add");
    if (intentCaptured.isErr()) return err(intentCaptured.error);
    if (intentCaptured.value.exitCode !== 0) {
      return err(domainError.conflict("Agent Task Git intent-to-add failed"));
    }
    const outputs: CapturedExec[] = [];
    for (const argv of [
      ["git", "status", "--short", "--", ...taskGitPathspec],
      ["git", "diff", "--stat", "--", ...taskGitPathspec],
      ["git", "diff", "--no-ext-diff", "--", ...taskGitPathspec],
    ]) {
      const result = await this.dependencies.sandbox.exec(context, workspaceId, { argv });
      if (result.isErr()) return err(result.error);
      const captured = captureExec(result.value, "Agent Task Git evidence");
      if (captured.isErr()) return err(captured.error);
      if (captured.value.exitCode !== 0) {
        return err(domainError.conflict("Agent Task Git evidence capture failed"));
      }
      outputs.push(captured.value);
    }
    const status = redact(outputs[0]?.stdout ?? "");
    const stat = redact(outputs[1]?.stdout ?? "");
    const patch = redact(outputs[2]?.stdout ?? "");
    const boundedStatus = bounded(status.value, taskOutputLimit);
    const boundedStat = bounded(stat.value, taskOutputLimit);
    const boundedPatch = bounded(patch.value, taskPatchLimit);
    return ok({
      status: boundedStatus.value,
      stat: boundedStat.value,
      patch: boundedPatch.value,
      truncated: boundedStatus.truncated || boundedStat.truncated || boundedPatch.truncated,
      redacted: status.redacted || stat.redacted || patch.redacted,
    });
  }

  private async deliverChanges(
    context: ExecutionContext,
    task: AgentTaskRunDescriptor,
    input: AgentTaskDeliveryInput,
  ): Promise<Result<AgentTaskDeliveryResult>> {
    const run = async (
      argv: string[],
      label: string,
      options: { githubCredential?: boolean; allowNonZero?: boolean } = {},
    ): Promise<Result<CapturedExec>> => {
      let execution: { argv: string[]; stdin?: Uint8Array } = { argv };
      if (options.githubCredential) {
        const token = (
          await this.dependencies.integrationAuth.getProviderAccessToken(context, "github")
        )?.trim();
        if (!token || token.length > 4_096 || /[\r\n\0]/u.test(token)) {
          return err(
            domainError.conflict("Agent Task GitHub delivery credential is unavailable", {
              phase: "agent-task-delivery-credential",
              retryable: true,
            }),
          );
        }
        execution = {
          argv: [
            "sh",
            "-c",
            'IFS= read -r APPALOFT_GITHUB_TOKEN || exit 90; [ -n "$APPALOFT_GITHUB_TOKEN" ] || exit 90; export GH_TOKEN="$APPALOFT_GITHUB_TOKEN"; exec "$@"',
            "appaloft-github-delivery",
            ...argv,
          ],
          stdin: new TextEncoder().encode(`${token}\n`),
        };
      }
      const executed = await this.dependencies.sandbox.exec(context, task.workspaceId, execution);
      if (executed.isErr()) return err(executed.error);
      const captured = captureExec(executed.value, label);
      if (captured.isErr()) return captured;
      if (captured.value.exitCode !== 0 && !options.allowNonZero) {
        return err(
          domainError.conflict(`${label} failed`, {
            cause: bounded(redact(captured.value.stderr).value, 1_024).value,
          }),
        );
      }
      return captured;
    };
    const branchExists = await this.dependencies.sandbox.exec(context, task.workspaceId, {
      argv: ["git", "show-ref", "--verify", "--quiet", `refs/heads/${input.branch}`],
    });
    if (branchExists.isErr()) return err(branchExists.error);
    const branchCheck = captureExec(branchExists.value, "Agent Task branch lookup");
    if (branchCheck.isErr()) return err(branchCheck.error);
    const switched = await run(
      branchCheck.value.exitCode === 0
        ? ["git", "switch", input.branch]
        : ["git", "switch", "-c", input.branch],
      "Agent Task branch switch",
    );
    if (switched.isErr()) return err(switched.error);
    const added = await run(["git", "add", "-A", "--", ...taskGitPathspec], "Agent Task Git add");
    if (added.isErr()) return err(added.error);
    const staged = await this.dependencies.sandbox.exec(context, task.workspaceId, {
      argv: ["git", "diff", "--cached", "--quiet", "--", ...taskGitPathspec],
    });
    if (staged.isErr()) return err(staged.error);
    const stagedResult = captureExec(staged.value, "Agent Task staged change lookup");
    if (stagedResult.isErr()) return err(stagedResult.error);
    if (stagedResult.value.exitCode !== 0) {
      const committed = await run(
        [
          "git",
          "-c",
          "user.name=Appaloft Agent",
          "-c",
          "user.email=agent@appaloft.local",
          "commit",
          "-m",
          input.commitMessage,
          "--",
          ...taskGitPathspec,
        ],
        "Agent Task Git commit",
      );
      if (committed.isErr()) return err(committed.error);
    }
    const head = await run(["git", "rev-parse", "HEAD"], "Agent Task Git HEAD");
    if (head.isErr()) return err(head.error);
    const pushed = await run(
      [
        "git",
        "-c",
        "credential.helper=!gh auth git-credential",
        "push",
        "-u",
        input.remote,
        input.branch,
      ],
      "Agent Task Git push",
      { githubCredential: true },
    );
    if (pushed.isErr()) return err(pushed.error);
    let pullRequestUrl: string | undefined;
    if (input.pullRequest) {
      const existing = await run(
        ["gh", "pr", "view", input.branch, "--json", "url", "--jq", ".url"],
        "Agent Task pull request lookup",
        { githubCredential: true, allowNonZero: true },
      );
      if (existing.isErr()) return err(existing.error);
      if (existing.value.exitCode === 0 && /^https:\/\/\S+$/u.test(existing.value.stdout.trim())) {
        pullRequestUrl = existing.value.stdout.trim();
      } else {
        const created = await run(
          [
            "gh",
            "pr",
            "create",
            "--head",
            input.branch,
            "--title",
            input.pullRequest.title,
            ...(input.pullRequest.body ? ["--body", input.pullRequest.body] : []),
            ...(input.pullRequest.base ? ["--base", input.pullRequest.base] : []),
          ],
          "Agent Task pull request create",
          { githubCredential: true },
        );
        if (created.isErr()) return err(created.error);
        pullRequestUrl = created.value.stdout.match(/https:\/\/\S+/u)?.[0];
      }
    }
    return ok({
      remote: input.remote,
      branch: input.branch,
      commitSha: head.value.stdout.trim(),
      ...(pullRequestUrl ? { pullRequestUrl } : {}),
    });
  }
}
