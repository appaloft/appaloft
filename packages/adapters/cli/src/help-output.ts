import { Console, Effect } from "effect";

import { type DomainError } from "@appaloft/core";
import { unsupportedCliHelpOption } from "./code-help.js";
import { validateCliTopLevelCommand } from "./control-plane-target.js";
import { unsupportedSetupHelpArgument } from "./setup-help.js";

// eslint-disable-next-line no-control-regex -- ANSI escape bytes are the sequence being removed.
const ANSI_CONTROL_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const REPEATED_COLLABORATION_PATH =
  /\bcollaboration collaboration (?=(?:participant|lane|writer|handoff)\b)/g;

export function cliHelpInvocationError(argv: readonly string[]): DomainError | undefined {
  if (!argv.includes("--help") && !argv.includes("-h")) return undefined;

  const topLevel = validateCliTopLevelCommand(argv);
  if (topLevel.isErr()) {
    const command = topLevel.error.details?.command;
    return {
      ...topLevel.error,
      message:
        typeof command === "string"
          ? `${topLevel.error.message}: '${command}'`
          : topLevel.error.message,
    };
  }

  const unsupportedOption = unsupportedCliHelpOption(argv) ?? unsupportedSetupHelpArgument(argv);
  return unsupportedOption
    ? {
        code: "validation_error",
        category: "user" as const,
        message: `Received unknown argument: '${unsupportedOption}'`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
          option: unsupportedOption,
        },
      }
    : undefined;
}

export function renderCliHelpInvocationError(
  error: DomainError,
  stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr,
): void {
  stderr.write(`${error.message}\n`);
}

export function formatCliHelpOutput(text: string, env: NodeJS.ProcessEnv): string {
  const canonicalPaths = text.replace(REPEATED_COLLABORATION_PATH, "collaboration ");
  return env.NO_COLOR === undefined
    ? canonicalPaths
    : canonicalPaths.replace(ANSI_CONTROL_SEQUENCE, "");
}

export function withCliHelpOutputPolicy<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  env: NodeJS.ProcessEnv,
): Effect.Effect<A, E, R> {
  return Console.consoleWith((base) => {
    const formatArgs = (args: ReadonlyArray<unknown>) =>
      args.map((arg) => (typeof arg === "string" ? formatCliHelpOutput(arg, env) : arg));
    const outputConsole: Console.Console = {
      ...base,
      log: (...args) => base.log(...formatArgs(args)),
      error: (...args) => base.error(...formatArgs(args)),
      unsafe: {
        ...base.unsafe,
        log: (...args) => base.unsafe.log(...formatArgs(args)),
        error: (...args) => base.unsafe.error(...formatArgs(args)),
      },
    };
    return Console.withConsole(effect, outputConsole);
  });
}
