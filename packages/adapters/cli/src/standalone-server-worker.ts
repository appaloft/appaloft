import { type DomainError, type Result } from "@appaloft/core";
import { type ServerWorkerSafeStatus } from "@appaloft/server-worker-relay";

export interface ServerWorkerCommandRuntime {
  enroll(input: {
    serverId: string;
    name: string;
    token?: string;
  }): Promise<Result<ServerWorkerSafeStatus>>;
  run(input?: { signal?: AbortSignal }): Promise<Result<ServerWorkerSafeStatus>>;
  status(): Promise<Result<ServerWorkerSafeStatus | { state: "not-enrolled" }>>;
  revoke(): Promise<Result<{ revoked: boolean; workerId?: string }>>;
  upgrade(input: {
    currentExecutable: string;
    candidateExecutable: string;
    signatureFile: string;
  }): Promise<Result<{ upgraded: boolean; rolledBack: boolean }>>;
}

export interface StandaloneServerWorkerCliInput {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  runtime: ServerWorkerCommandRuntime;
  stdinText?: string;
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}

export interface StandaloneServerWorkerCliResult {
  handled: boolean;
  exitCode: number;
}

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function option(args: readonly string[], name: string): string | undefined {
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) return args[index + 1];
    if (args[index]?.startsWith(prefix)) return args[index]?.slice(prefix.length);
  }
  return undefined;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function usage(): string {
  return [
    "Usage: appaloft server worker <command> [options]",
    "",
    "Commands:",
    "  enroll   Generate a device key and exchange a one-time enrollment token",
    "  run      Maintain the outbound mTLS Worker connection",
    "  status   Show bounded local Worker status",
    "  revoke   Revoke the attachment and remove the local credential",
    "  upgrade  Atomically install a signed Worker executable with rollback",
    "",
    "Enrollment options:",
    "  --server <id>          Existing public Server id",
    "  --name <name>          Device display name",
    "  --token-stdin          Read a transferred one-time token from stdin",
    "",
    "Upgrade options:",
    "  --candidate <path>     Candidate executable",
    "  --signature-file <p>   Detached signature file",
    "  --current <path>       Current executable (defaults to this CLI)",
    "  --json                 Emit structured JSON",
  ].join("\n");
}

function errorView(error: DomainError): object {
  return {
    error: {
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      details: error.details ?? null,
    },
  };
}

function inputError(message: string): DomainError {
  return {
    code: "server_worker_enrollment_invalid",
    category: "user",
    message,
    retryable: false,
    details: { phase: "server-worker-enrollment" },
  };
}

export async function runStandaloneServerWorkerCli(
  input: StandaloneServerWorkerCliInput,
): Promise<StandaloneServerWorkerCliResult> {
  const args = commandArgs(input.argv);
  if (args[0] !== "server" || args[1] !== "worker") return { handled: false, exitCode: 0 };
  const stdout = input.writeStdout ?? ((value: string) => process.stdout.write(value));
  const stderr = input.writeStderr ?? ((value: string) => process.stderr.write(value));
  const write = (value: unknown) => stdout(`${JSON.stringify(value, null, 2)}\n`);
  const fail = (error: DomainError): StandaloneServerWorkerCliResult => {
    stderr(`${JSON.stringify(errorView(error), null, 2)}\n`);
    return { handled: true, exitCode: 1 };
  };
  const operation = args[2];
  if (!operation || operation === "help" || hasFlag(args, "help") || args.includes("-h")) {
    stdout(`${usage()}\n`);
    return { handled: true, exitCode: 0 };
  }

  let result: Result<unknown>;
  if (operation === "enroll") {
    if (option(args, "token") !== undefined)
      return fail(inputError("Enrollment tokens are accepted only through --token-stdin"));
    const serverId = option(args, "server")?.trim();
    const name = option(args, "name")?.trim();
    const token = hasFlag(args, "token-stdin") ? input.stdinText?.trim() : undefined;
    if (!serverId || !name || (hasFlag(args, "token-stdin") && !token)) {
      return fail(
        inputError(
          "Worker enrollment requires --server and --name; --token-stdin must be non-empty when provided",
        ),
      );
    }
    result = await input.runtime.enroll({ serverId, name, ...(token ? { token } : {}) });
  } else if (operation === "status") {
    result = await input.runtime.status();
  } else if (operation === "revoke") {
    result = await input.runtime.revoke();
  } else if (operation === "run") {
    const abort = new AbortController();
    const interrupt = () => abort.abort();
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    try {
      result = await input.runtime.run({ signal: abort.signal });
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
  } else if (operation === "upgrade") {
    const candidateExecutable = option(args, "candidate")?.trim();
    const signatureFile = option(args, "signature-file")?.trim();
    if (!candidateExecutable || !signatureFile) {
      return fail(inputError("Worker upgrade requires --candidate and --signature-file"));
    }
    result = await input.runtime.upgrade({
      currentExecutable: option(args, "current")?.trim() || process.execPath,
      candidateExecutable,
      signatureFile,
    });
  } else {
    return fail(inputError(`Unknown Server Worker command: ${operation}`));
  }

  if (result.isErr()) return fail(result.error);
  write(result.value);
  return { handled: true, exitCode: 0 };
}
