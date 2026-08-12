import { type DomainError, domainError } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { CliRuntime, optionalValue, print } from "../runtime.js";
import { classifyWorkspaceHostTerminal } from "../workspace-control-terminal.js";
import { cliCommandDescriptions } from "./docs-help.js";

const resourceId = Args.text({ name: "resourceId" }).pipe(Args.optional);
const deploymentId = Options.text("deployment").pipe(Options.optional);
const noTui = Options.boolean("no-tui").pipe(
  Options.withDescription("Print one bounded Operate snapshot without starting the TUI."),
  Options.withDefault(false),
);
const json = Options.boolean("json").pipe(
  Options.withDescription("Print the bounded Operate result as JSON."),
  Options.withDefault(false),
);

function operateCliError(error: unknown): DomainError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "category" in error &&
    "message" in error &&
    "retryable" in error
  ) {
    return error as DomainError;
  }
  return domainError.infra("Operate presentation failed", {
    phase: "operate-presentation",
  });
}

export const operateCommand = EffectCommand.make(
  "operate",
  { resourceId, deploymentId, noTui, json },
  ({ deploymentId, json, noTui, resourceId }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const presentation = cli.operatePresentation;
      if (!presentation) {
        return yield* Effect.fail({
          code: "operate_presentation_failed",
          category: "infra" as const,
          message: "Operate presentation is not composed",
          retryable: false,
          details: { phase: "operate-presentation" },
        });
      }
      const selectedResourceId = optionalValue(resourceId);
      const selectedDeploymentId = optionalValue(deploymentId);
      const input = {
        ...(selectedResourceId ? { resourceId: selectedResourceId } : {}),
        ...(selectedDeploymentId ? { deploymentId: selectedDeploymentId } : {}),
      };
      const interactive = Boolean(cli.terminalIO.stdin.isTTY && cli.terminalIO.stdout.isTTY);
      const terminalUnsupported = interactive
        ? classifyWorkspaceHostTerminal(cli.environment ?? process.env).reason
        : undefined;
      if (!interactive || noTui || json || terminalUnsupported) {
        const result = yield* Effect.tryPromise({
          try: () =>
            presentation.headless(
              { executeCommand: cli.executeCommand, executeQuery: cli.executeQuery },
              input,
            ),
          catch: operateCliError,
        });
        return yield* print(result);
      }
      yield* Effect.tryPromise({
        try: () =>
          presentation.start(
            { executeCommand: cli.executeCommand, executeQuery: cli.executeQuery },
            input,
          ),
        catch: operateCliError,
      });
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.operate));
