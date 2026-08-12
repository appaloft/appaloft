import { resolve } from "node:path";

import { type DevelopmentPlan, type DevelopmentSessionRuntime } from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

import { type DevelopmentPlanInput } from "./development-plan.js";
import { type DevelopmentControlPresentation } from "./development-presentation.js";

export interface DevelopmentCommandRuntime extends DevelopmentSessionRuntime {
  plan(input: DevelopmentPlanInput): Promise<Result<DevelopmentPlan>>;
}

export interface StandaloneDevelopmentCliInput {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  runtime: DevelopmentCommandRuntime;
  presentation?: DevelopmentControlPresentation;
  interactive?: boolean;
  writeStdout?: (value: string) => void;
  writeStderr?: (value: string) => void;
}

export interface StandaloneDevelopmentCliResult {
  handled: boolean;
  exitCode: number;
}

const operations = new Set(["plan", "start", "status", "logs", "stop", "reset"]);

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === flag && args[index + 1]) {
      values.push(args[index + 1] as string);
      index += 1;
    } else if (value?.startsWith(prefix)) {
      values.push(value.slice(prefix.length));
    }
  }
  return values;
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function positionalArgs(args: readonly string[]): string[] {
  const withValues = new Set(["--env-file", "--env", "--tail", "--config", "--server"]);
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (withValues.has(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    output.push(value);
  }
  return output;
}

function environmentOverlay(values: readonly string[]): Result<Record<string, string>> {
  const overlay: Record<string, string> = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    const key = separator > 0 ? value.slice(0, separator) : "";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return err({
        code: "development_plan_invalid",
        category: "user",
        message: `Invalid --env assignment: ${value}`,
        retryable: false,
        details: { phase: "development-plan" },
      });
    }
    overlay[key] = value.slice(separator + 1);
  }
  return ok(overlay);
}

function writeValue(write: (value: string) => void, value: unknown): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

function writeError(write: (value: string) => void, error: DomainError, json: boolean): void {
  if (json) {
    writeValue(write, {
      error: {
        code: error.code,
        category: error.category,
        message: error.message,
        retryable: error.retryable,
        details: error.details ?? null,
      },
    });
    return;
  }
  write(
    `${error.message}\ncode=${error.code} phase=${String(error.details?.phase ?? "unknown")}\n`,
  );
}

function usage(): string {
  return [
    "Usage: appaloft dev [start|plan|status|logs|stop|reset] [path] [options]",
    "",
    "Options:",
    "  --detach             Keep the development session running",
    "  --env-file <path>    Add an environment file (repeatable)",
    "  --env <KEY=value>    Add an explicit environment override (repeatable)",
    "  --follow             Follow development logs",
    "  --tail <count>       Number of log lines to return (default: 200)",
    "  --config <path>      Use an explicit Appaloft config file",
    "  --server <id>        Run through this Server's live outbound Worker",
    "  --https              Serve the local gateway with an owned certificate",
    "  --trust              Explicitly request local certificate trust",
    "  --no-tui             Run foreground without the native Development TUI",
    "  --json               Emit structured JSON",
  ].join("\n");
}

function logLines(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const lines = (value as { lines?: unknown }).lines;
  return Array.isArray(lines)
    ? lines.filter((line): line is string => typeof line === "string")
    : [];
}

function activeDevelopmentState(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const state = (value as { state?: unknown }).state;
  return state === "starting" || state === "running" || state === "degraded";
}

export async function runStandaloneDevelopmentCli(
  input: StandaloneDevelopmentCliInput,
): Promise<StandaloneDevelopmentCliResult> {
  const args = commandArgs(input.argv);
  if (args[0] !== "dev") return { handled: false, exitCode: 0 };

  const stdout = input.writeStdout ?? ((value: string) => process.stdout.write(value));
  const stderr = input.writeStderr ?? ((value: string) => process.stderr.write(value));
  if (hasFlag(args, "help") || args.includes("-h")) {
    stdout(`${usage()}\n`);
    return { handled: true, exitCode: 0 };
  }

  if (args[1] === "__supervise") {
    const stateDirectory = optionValues(args, "state-dir")[0];
    if (!stateDirectory || !input.runtime.supervise) {
      stderr("Development supervisor invocation is invalid\n");
      return { handled: true, exitCode: 1 };
    }
    const supervised = await input.runtime.supervise({ stateDirectory });
    if (supervised.isErr()) {
      writeError(stderr, supervised.error, true);
      return { handled: true, exitCode: 1 };
    }
    return { handled: true, exitCode: 0 };
  }

  const positional = positionalArgs(args.slice(1));
  const explicitOperation = positional[0] && operations.has(positional[0]) ? positional[0] : null;
  const operation = explicitOperation ?? "start";
  const sourceRoot = resolve(explicitOperation ? (positional[1] ?? ".") : (positional[0] ?? "."));
  const json = hasFlag(args, "json");
  const configFilePath = optionValues(args, "config")[0];

  let result: Result<unknown>;
  if (operation === "plan") {
    result = await input.runtime.plan({
      sourceRoot,
      ...(configFilePath ? { configFilePath } : {}),
    });
  } else if (operation === "start") {
    const plan = await input.runtime.plan({
      sourceRoot,
      ...(configFilePath ? { configFilePath } : {}),
    });
    if (plan.isErr()) {
      writeError(stderr, plan.error, json);
      return { handled: true, exitCode: 1 };
    }
    const overlay = environmentOverlay(optionValues(args, "env"));
    if (overlay.isErr()) {
      writeError(stderr, overlay.error, json);
      return { handled: true, exitCode: 1 };
    }
    const interactive =
      input.interactive ??
      (input.writeStdout === undefined && Boolean(process.stdin.isTTY && process.stdout.isTTY));
    let useTui = interactive && !json && !hasFlag(args, "no-tui") && !hasFlag(args, "detach");
    if (useTui && !input.presentation) {
      stderr("Development TUI is unavailable; continuing in headless foreground mode\n");
      useTui = false;
    }
    if (useTui && input.presentation?.prepare) {
      const prepared = input.presentation.prepare();
      if (prepared.isErr()) {
        stderr(
          `Development TUI is unavailable; continuing in headless foreground mode (code=${prepared.error.code})\n`,
        );
        useTui = false;
      }
    }
    const startInput = {
      plan: plan.value,
      detach: hasFlag(args, "detach") || useTui,
      envFiles: optionValues(args, "env-file"),
      environmentOverlay: overlay.value,
      https: hasFlag(args, "https"),
      trust: hasFlag(args, "trust"),
    };
    const started = await input.runtime.start(startInput);
    result = started;
    if (started.isOk() && useTui && input.presentation) {
      result = await input.presentation.run({
        session: started.value,
        startInput: {
          plan: startInput.plan,
          envFiles: startInput.envFiles,
          environmentOverlay: startInput.environmentOverlay,
          https: startInput.https,
          trust: startInput.trust,
        },
        runtime: input.runtime,
      });
    }
  } else if (operation === "status") {
    result = await input.runtime.status({ sourceRoot });
  } else if (operation === "logs") {
    const rawTail = optionValues(args, "tail")[0];
    const tail = rawTail === undefined ? 200 : Number(rawTail);
    if (!Number.isInteger(tail) || tail < 1 || tail > 10_000) {
      writeError(
        stderr,
        {
          code: "development_plan_invalid",
          category: "user",
          message: "--tail must be an integer between 1 and 10000",
          retryable: false,
          details: { phase: "development-logs" },
        },
        json,
      );
      return { handled: true, exitCode: 1 };
    }
    const follow = hasFlag(args, "follow");
    if (follow) {
      let previous: string[] = [];
      let interrupted = false;
      const interrupt = () => {
        interrupted = true;
      };
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
      try {
        while (!interrupted) {
          const snapshot = await input.runtime.logs({ sourceRoot, follow: false, tail });
          if (snapshot.isErr()) {
            writeError(stderr, snapshot.error, json);
            return { handled: true, exitCode: 1 };
          }
          const lines = logLines(snapshot.value);
          const previousLast = previous.at(-1);
          const previousIndex = previousLast ? lines.lastIndexOf(previousLast) : -1;
          const fresh = previousIndex >= 0 ? lines.slice(previousIndex + 1) : lines;
          for (const line of fresh) {
            if (json) writeValue(stdout, { type: "development-log", line });
            else stdout(`${line}\n`);
          }
          previous = lines;
          const status = await input.runtime.status({ sourceRoot });
          if (status.isErr()) {
            writeError(stderr, status.error, json);
            return { handled: true, exitCode: 1 };
          }
          if (!activeDevelopmentState(status.value)) break;
          await new Promise((resolveTick) => setTimeout(resolveTick, 250));
        }
      } finally {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", interrupt);
      }
      return { handled: true, exitCode: 0 };
    }
    result = await input.runtime.logs({ sourceRoot, follow: false, tail });
  } else if (operation === "stop") {
    result = await input.runtime.stop({ sourceRoot });
  } else {
    if (!hasFlag(args, "yes")) {
      writeError(
        stderr,
        {
          code: "development_plan_invalid",
          category: "user",
          message: "dev reset requires --yes to confirm exact local state deletion",
          retryable: false,
          details: { phase: "development-cleanup" },
        },
        json,
      );
      return { handled: true, exitCode: 1 };
    }
    result = await input.runtime.reset({ sourceRoot });
  }

  if (result.isErr()) {
    writeError(stderr, result.error, json);
    return { handled: true, exitCode: 1 };
  }
  writeValue(stdout, result.value);
  return { handled: true, exitCode: 0 };
}
