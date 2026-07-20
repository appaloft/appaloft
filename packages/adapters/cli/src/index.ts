import { Command as EffectCommand } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";

import { mainCommand } from "./commands/index.js";
import {
  type CliProgram,
  type CliProgramInput,
  CliRuntime,
  CliRuntimeLive,
  cliArgvRequestsStdinText,
  printCliError,
  readProcessStdinText,
} from "./runtime.js";

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
export {
  createServerStateBackendMarker,
  parseServerStateBackendMarker,
  type ServerStateBackendMarker,
  serverStateBackendMarkerFile,
  serverStateBackendMarkerSchemaVersion,
  serverStateBackendMismatchError,
  serverStateBackendMismatchReason,
} from "./commands/deployment-state.js";
export { buildSshRemoteStateDiagnosticsCommand } from "./commands/remote-state.js";
export {
  findControlPlaneOperation,
  requestControlPlaneOperation,
  requestRemoteProjectOperation,
} from "./control-plane-client.js";
export {
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
  defaultCliControlPlaneProfileStore,
  defaultPublicCloudBrowserLoginUrl,
  defaultPublicCloudControlPlaneUrl,
  FileSystemCliControlPlaneProfileStore,
  MemoryCliControlPlaneProfileStore,
  profileView,
} from "./control-plane-profile.js";
export {
  activeControlPlaneProfile,
  controlPlaneStatus,
  dispatchRemoteProjectOperation,
  loginControlPlane,
  logoutControlPlane,
  mcpLoginControlPlane,
  tokenLoginControlPlane,
  unsupportedRemoteProjectOperation,
  useControlPlaneProfile,
} from "./control-plane-service.js";
export {
  type CliControlPlaneGlobalOptions,
  type CliControlPlaneSelectionMode,
  type CliExecutionTarget,
  type CliExecutionTargetDiagnostics,
  parseCliControlPlaneGlobalOptions,
  resolveCliExecutionTarget,
} from "./control-plane-target.js";
export { createRemoteCliProgram } from "./remote-cli-program.js";
export type { CliSourceLinkStore } from "./runtime.js";
export {
  formatSafeCliError,
  type SafeCliErrorEvidence,
  safeCliErrorEvidence,
} from "./runtime.js";
export { runStandaloneControlPlaneCli } from "./standalone-control-plane.js";

export function createCliProgram(input: CliProgramInput): CliProgram {
  const sourceStdinReader = input.readStdinText ?? readProcessStdinText;
  let capturedStdinText: Promise<string> | undefined;
  const live = Layer.mergeAll(
    NodeContext.layer,
    CliRuntimeLive({
      ...input,
      readStdinText: () => capturedStdinText ?? sourceStdinReader(),
    }),
  );

  return {
    parseAsync: async (argv = process.argv) => {
      capturedStdinText = cliArgvRequestsStdinText(argv) ? sourceStdinReader() : undefined;
      if (capturedStdinText) {
        await capturedStdinText;
      }
      try {
        await EffectCommand.run(mainCommand, {
          name: "appaloft",
          version: input.version,
        })(argv).pipe(
          Effect.provide(live),
          Effect.catchAll((error) =>
            printCliError(error).pipe(Effect.zipRight(Effect.fail(error))),
          ),
          Effect.runPromise,
        );
      } finally {
        capturedStdinText = undefined;
      }
    },
  };
}

export function createCliHelpProgram(input: { readonly version: string }): CliProgram {
  const runtimeUnavailable = async (): Promise<never> => {
    throw new Error("CLI help attempted to execute a runtime operation");
  };
  const helpOnlyRuntime = Layer.succeed(CliRuntime, {
    version: input.version,
    startServer: runtimeUnavailable,
    executeCommand: runtimeUnavailable,
    executeQuery: runtimeUnavailable,
    terminalIO: {
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    },
    readStdinText: readProcessStdinText,
  });
  const live = Layer.mergeAll(NodeContext.layer, helpOnlyRuntime);

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
