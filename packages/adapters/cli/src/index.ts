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
export {
  type DevelopmentPlanInput,
  developmentPlanFromSource,
} from "./development-plan.js";
export {
  createRatatuiDevelopmentPresentation,
  type DevelopmentControlPresentation,
  type DevelopmentPresentationInput,
  type RatatuiDevelopmentPresentationOptions,
} from "./development-presentation.js";
export {
  type LocalGitWorkspaceContext,
  type NormalizedWorkspaceRepositoryRemote,
  normalizeWorkspaceRepositoryRemote,
  type RemoteGitWorkspaceRef,
  type ResolveGitWorkspaceProgress,
  resolveLocalGitWorkspaceContext,
  resolveRemoteGitWorkspaceRef,
  WORKSPACE_GIT_COMMAND_TIMEOUT_MS,
  type WorkspaceGitCommandInput,
  type WorkspaceGitCommandOutput,
  type WorkspaceGitCommandRunner,
} from "./local-git-workspace-context.js";
export {
  buildScratchHarness,
  launchScratchAgent,
  resolveAppaloftSkillPath,
  resolveDefaultScratchHarness,
  resolveLocalAppaloftCli,
  resolveNativeOpenCodeAttachEnv,
  resolveScratchPath,
  resolveScratchSession,
  SCRATCH_BANNER,
  type ScratchAgentLauncher,
  type ScratchHarnessName,
  type ScratchHarnessProbe,
  type ScratchHarnessResolution,
  type ScratchHarnessResolver,
  type ScratchSession,
} from "./local-scratch-session.js";
export {
  type MigrationSecretEnvironment,
  ProcessEnvironmentMigrationSecretResolver,
} from "./migration-secret-resolver.js";
export {
  createBoundedOperatePresentation,
  createOperateCoordinator,
  listOperateResources,
  type OperateAction,
  type OperateActionConfirmation,
  type OperateCoordinator,
  type OperateHeadlessResult,
  type OperatePresentation,
  type OperatePresentationContext,
  type OperateRendererEvent,
  type OperateRendererMessage,
  type OperateRendererSession,
  type OperateSection,
  type OperateSnapshot,
  resolveOperateTarget,
} from "./operate-presentation.js";
export { createRemoteCliProgram } from "./remote-cli-program.js";
export {
  createRemoteTerminalSessionAttachmentGateway,
  type RemoteTerminalWebSocketFactory,
} from "./remote-terminal-session-gateway.js";
export type { CliSourceLinkStore } from "./runtime.js";
export {
  formatHumanCliError,
  formatSafeCliError,
  type SafeCliErrorEvidence,
  safeCliErrorEvidence,
} from "./runtime.js";
export { runStandaloneControlPlaneCli } from "./standalone-control-plane.js";
export {
  type DevelopmentCommandRuntime,
  runStandaloneDevelopmentCli,
  type StandaloneDevelopmentCliInput,
  type StandaloneDevelopmentCliResult,
} from "./standalone-development.js";
export {
  runStandaloneServerWorkerCli,
  type ServerWorkerCommandRuntime,
  type StandaloneServerWorkerCliInput,
  type StandaloneServerWorkerCliResult,
} from "./standalone-server-worker.js";
export {
  type OpenedNativeWorkspaceTerminal,
  type OpenNativeWorkspaceTerminalInput,
  openBunNativeWorkspaceTerminal,
} from "./workspace-control-native-terminal.js";
export {
  createBoundedWorkspaceControlPresentation,
  type WorkspaceControlPresentation,
  type WorkspaceControlPresentationContext,
  type WorkspaceControlRendererEvent,
  type WorkspaceControlRendererMessage,
  type WorkspaceControlRendererSession,
} from "./workspace-control-presentation.js";
export {
  createRatatuiOperatePresentation,
  createRatatuiWorkspaceControlPresentation,
  openLoopbackWorkspaceControlRenderer,
  resolveWorkspaceControlRendererBinary,
  type WorkspaceControlRendererProcess,
} from "./workspace-control-renderer.js";

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
    openNativeWorkspaceTerminal: runtimeUnavailable,
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
