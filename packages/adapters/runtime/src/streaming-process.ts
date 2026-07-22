import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface StreamingProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
  timedOut?: boolean;
}

class LineBuffer {
  private pending = "";

  push(chunk: string): string[] {
    const combined = `${this.pending}${chunk}`;
    const parts = combined.split(/\r?\n/);
    this.pending = parts.pop() ?? "";
    return parts.map((line) => line.trim()).filter((line) => line.length > 0);
  }

  flush(): string[] {
    const line = this.pending.trim();
    this.pending = "";
    return line ? [line] : [];
  }
}

function classifyOutputLogLevel(line: string, fallback: LogLevel): LogLevel {
  const normalized = line.toLowerCase();
  if (/\b(error|failed|failure|fatal)\b/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning)\b/.test(normalized)) {
    return "warn";
  }

  return fallback === "error" ? "error" : fallback;
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

export async function runStreamingProcess(input: {
  command: string;
  args?: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
  stdin?: string | Uint8Array;
  shell?: boolean;
  timeoutMs?: number;
  timeoutMessage?: string;
  onOutput(line: string, level: LogLevel, stream: "stdout" | "stderr"): void;
}): Promise<StreamingProcessResult> {
  if (!existsSync(input.cwd) || !statSync(input.cwd).isDirectory()) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "",
      failed: true,
      reason: `working directory does not exist: ${input.cwd}`,
    };
  }

  return await new Promise((resolveCommand) => {
    const child = spawn(input.command, input.args ?? [], {
      cwd: input.cwd,
      env: input.env,
      shell: input.shell ?? false,
      stdio: [input.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      detached: true,
    });
    const stdout = new LineBuffer();
    const stderr = new LineBuffer();
    let stdoutText = "";
    let stderrText = "";
    let spawnReason: string | undefined;
    let timeoutReason: string | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let settled = false;

    const resolveOnce = (result: StreamingProcessResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      resolveCommand(result);
    };

    if (input.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        timeoutReason = input.timeoutMessage ?? "Process timed out";
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGTERM");
          } catch {
            child.kill("SIGTERM");
          }
        } else {
          child.kill("SIGTERM");
        }
      }, input.timeoutMs);
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    if (input.stdin !== undefined) {
      child.stdin?.on("error", () => {});
      child.stdin?.end(input.stdin);
    }

    child.stdout?.on("data", (chunk: string) => {
      stdoutText += chunk;
      for (const line of stdout.push(chunk)) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stdout");
      }
    });

    child.stderr?.on("data", (chunk: string) => {
      stderrText += chunk;
      for (const line of stderr.push(chunk)) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "warn"), "stderr");
      }
    });

    child.on("error", (error) => {
      spawnReason = error.message;
      resolveOnce({
        exitCode: 1,
        stdout: redactSecrets(stdoutText, input.redactions),
        stderr: redactSecrets(stderrText, input.redactions),
        failed: true,
        reason: spawnReason,
      });
    });

    child.on("close", (code, signal) => {
      for (const line of stdout.flush()) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "info"), "stdout");
      }
      for (const line of stderr.flush()) {
        const redactedLine = redactSecrets(line, input.redactions);
        input.onOutput(redactedLine, classifyOutputLogLevel(redactedLine, "warn"), "stderr");
      }

      const redactedStdout = redactSecrets(stdoutText, input.redactions);
      const stderrWithTimeout = timeoutReason
        ? [stderrText.trim(), timeoutReason].filter(Boolean).join("\n")
        : stderrText;
      const redactedStderr = redactSecrets(stderrWithTimeout, input.redactions);

      resolveOnce({
        exitCode: code ?? 1,
        stdout: redactedStdout,
        stderr: redactedStderr,
        failed: timeoutReason !== undefined || code !== 0,
        ...(signal && !timeoutReason ? { reason: `terminated by signal ${signal}` } : {}),
        ...(timeoutReason ? { reason: timeoutReason, timedOut: true } : {}),
        ...(spawnReason ? { reason: spawnReason } : {}),
      });
    });
  });
}
