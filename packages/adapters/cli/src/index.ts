import { Command as EffectCommand } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";

import { mainCommand } from "./commands/index.js";
import { type CliProgram, type CliProgramInput, CliRuntimeLive, printCliError } from "./runtime.js";

export {
  FileSystemServerAppliedRouteDesiredStateStore,
  FileSystemSourceLinkStore,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteDesiredStateStore,
  type ServerAppliedRouteDomainIntent,
  type ServerAppliedRouteTarget,
  type SourceLinkRecord,
  type SourceLinkTarget,
} from "./commands/deployment-remote-state.js";
export {
  buildSshRemoteStateProcessArgs,
  SshRemoteStateLifecycle,
  type SshRemoteStateTarget,
  sshRemoteStateTargetFromDecision,
} from "./commands/deployment-ssh-remote-state.js";

export function createCliProgram(input: CliProgramInput): CliProgram {
  const live = Layer.mergeAll(NodeContext.layer, CliRuntimeLive(input));

  return {
    parseAsync: (argv = process.argv) =>
      EffectCommand.run(mainCommand, {
        name: "appaloft",
        version: input.version,
      })(argv).pipe(
        Effect.provide(live),
        Effect.catchAll((error) => printCliError(error).pipe(Effect.zipRight(Effect.fail(error)))),
        Effect.runPromise,
      ),
  };
}
