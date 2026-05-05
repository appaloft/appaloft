import {
  type ExecutionContext,
  type ScheduledTaskRuntimeExecutionRequest,
  type ScheduledTaskRuntimeExecutionResult,
  type ScheduledTaskRuntimePort,
} from "@appaloft/application";
import {
  type DomainError,
  domainError,
  err,
  ok,
  redactScheduledTaskSecretText,
  type Result,
} from "@appaloft/core";

export interface ScheduledTaskCommandRunnerInput {
  commandIntent: string;
  timeoutSeconds: number;
  environment: Record<string, string>;
}

export interface ScheduledTaskCommandRunnerResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export interface ScheduledTaskCommandRunner {
  run(input: ScheduledTaskCommandRunnerInput): Promise<ScheduledTaskCommandRunnerResult>;
}

export interface HermeticScheduledTaskRuntimeOptions {
  commandRunner?: ScheduledTaskCommandRunner;
  now?: () => string;
}

class DefaultHermeticScheduledTaskCommandRunner implements ScheduledTaskCommandRunner {
  async run(input: ScheduledTaskCommandRunnerInput): Promise<ScheduledTaskCommandRunnerResult> {
    if (/\bfail\b/i.test(input.commandIntent)) {
      return {
        exitCode: 1,
        stderr: "scheduled task command failed",
      };
    }

    return {
      exitCode: 0,
      stdout: "scheduled task command completed",
    };
  }
}

function safeMessage(message: string, redactions: readonly string[]): string {
  return redactScheduledTaskSecretText(message, redactions);
}

function logEntries(input: {
  text: string | undefined;
  stream: "stdout" | "stderr";
  timestamp: string;
  redactions: readonly string[];
}): ScheduledTaskRuntimeExecutionResult["logs"] {
  return (input.text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => ({
      timestamp: input.timestamp,
      stream: input.stream,
      message: safeMessage(line, input.redactions),
    }));
}

function failureSummary(stderr: string | undefined, exitCode: number): string {
  const firstLine = stderr
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? `Scheduled task command exited with code ${exitCode}`;
}

export class HermeticScheduledTaskRuntimePort implements ScheduledTaskRuntimePort {
  private readonly commandRunner: ScheduledTaskCommandRunner;
  private readonly now: () => string;

  constructor(options: HermeticScheduledTaskRuntimeOptions = {}) {
    this.commandRunner = options.commandRunner ?? new DefaultHermeticScheduledTaskCommandRunner();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(
    context: ExecutionContext,
    request: ScheduledTaskRuntimeExecutionRequest,
  ): Promise<Result<ScheduledTaskRuntimeExecutionResult, DomainError>> {
    void context;
    const startedAt = this.now();
    const redactions = Object.values(request.environment ?? {});

    try {
      const runnerResult = await this.commandRunner.run({
        commandIntent: request.commandIntent,
        timeoutSeconds: request.timeoutSeconds,
        environment: request.environment ?? {},
      });
      const finishedAt = this.now();
      const logs = [
        ...logEntries({
          text: runnerResult.stdout,
          stream: "stdout",
          timestamp: finishedAt,
          redactions,
        }),
        ...logEntries({
          text: runnerResult.stderr,
          stream: "stderr",
          timestamp: finishedAt,
          redactions,
        }),
      ];

      return ok({
        status: runnerResult.exitCode === 0 ? "succeeded" : "failed",
        exitCode: runnerResult.exitCode,
        startedAt,
        finishedAt,
        logs,
        ...(runnerResult.exitCode === 0
          ? {}
          : {
              failureSummary: safeMessage(
                failureSummary(runnerResult.stderr, runnerResult.exitCode),
                redactions,
              ),
            }),
      });
    } catch (error) {
      return err(
        domainError.infra("Scheduled task runtime execution failed", {
          phase: "scheduled-task-runtime-execution",
          runId: request.runId,
          taskId: request.taskId,
          resourceId: request.resourceId,
          error: error instanceof Error ? safeMessage(error.message, redactions) : "unknown",
        }),
      );
    }
  }
}
