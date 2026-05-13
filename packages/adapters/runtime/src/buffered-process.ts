export interface BufferedProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  failed: boolean;
  timedOut: boolean;
  error?: Error;
  reason?: string;
}

export interface BufferedProcessInput {
  command: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  redactions?: readonly string[];
  timeoutMessage?: string;
}

function redact(input: string, redactions: readonly string[] = []): string {
  return redactions.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

export async function runBufferedProcess(
  input: BufferedProcessInput,
): Promise<BufferedProcessResult> {
  const [executable] = input.command;
  if (!executable) {
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      failed: true,
      timedOut: false,
      error: new Error("Process command is empty"),
      reason: "Process command is empty",
    };
  }

  try {
    const subprocess = Bun.spawn([...input.command], {
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.env ? { env: input.env } : {}),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutPromise = new Response(subprocess.stdout).text();
    const stderrPromise = new Response(subprocess.stderr).text();
    let timeout: Timer | undefined;
    const timeoutPromise =
      input.timeoutMs === undefined
        ? undefined
        : new Promise<"timeout">((resolve) => {
            timeout = setTimeout(() => resolve("timeout"), input.timeoutMs);
          });

    const outcome = await (timeoutPromise
      ? Promise.race([subprocess.exited, timeoutPromise])
      : subprocess.exited);
    if (timeout) {
      clearTimeout(timeout);
    }

    if (outcome === "timeout") {
      subprocess.kill();
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      const reason = input.timeoutMessage ?? "Process timed out";
      return {
        exitCode: null,
        stdout: redact(stdout, input.redactions),
        stderr: redact(stderr || reason, input.redactions),
        failed: true,
        timedOut: true,
        reason,
      };
    }

    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    return {
      exitCode: outcome,
      stdout: redact(stdout, input.redactions),
      stderr: redact(stderr, input.redactions),
      failed: outcome !== 0,
      timedOut: false,
    };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error("Process failed");
    return {
      exitCode: null,
      stdout: "",
      stderr: "",
      failed: true,
      timedOut: false,
      error: normalized,
      reason: normalized.message,
    };
  }
}

export function shellCommand(command: string): readonly string[] {
  return ["sh", "-lc", command];
}
