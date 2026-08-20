import { spawn } from "node:child_process";

import { domainError } from "@appaloft/core";
import { occupancyBrowserLaunchAllowed } from "./occupancy-chrome.js";
import {
  createBoundedOperatePresentation,
  type OperatePresentation,
  type OperateRendererSession,
} from "./operate-presentation.js";
import {
  createBoundedWorkspaceControlPresentation,
  type WorkspaceControlPresentation,
  type WorkspaceControlRendererSession,
} from "./workspace-control-presentation.js";
import {
  consumeWarmedWorkspaceControlRenderer,
  openLoopbackWorkspaceControlRenderer,
  openWorkspaceControlRenderer,
  type RatatuiWorkspaceControlPresentationInput,
  resolveWorkspaceControlRendererBinary,
} from "./workspace-tui-launch.js";

export {
  buildWorkspaceControlRendererBinary,
  consumeWarmedWorkspaceControlRenderer,
  type EnsureWorkspaceControlRendererBinaryOptions,
  ensureWorkspaceControlRendererBinary,
  isWorkspaceRendererFailure,
  type OpenLoopbackWorkspaceControlRendererInput,
  openLoopbackWorkspaceControlRenderer,
  openWorkspaceControlRenderer,
  parseRustcRelease,
  type RatatuiWorkspaceControlPresentationInput,
  readRustcVersion,
  resetWorkspaceControlRendererWarmup,
  resolveCodeWorkspaceControlRendererBinary,
  resolveWorkspaceControlRendererBinary,
  restoreWorkspaceTuiScrollback,
  rustcTooOldForWorkspaceControlTui,
  sanitizeWorkspaceRendererFailureText,
  WORKSPACE_CONTROL_TUI_BINARY_NAME,
  WORKSPACE_CONTROL_TUI_BUILD_COMMAND,
  WORKSPACE_CONTROL_TUI_DEFAULT_TOOLCHAIN_COMMAND,
  WORKSPACE_CONTROL_TUI_MIN_RUSTC,
  WORKSPACE_CONTROL_TUI_TOOLCHAIN_COMMAND,
  WORKSPACE_TUI_DISABLE_MOUSE,
  WORKSPACE_TUI_LEAVE_ALT_SCREEN,
  type WorkspaceControlRendererLaunchInput,
  type WorkspaceControlRendererProcess,
  type WorkspaceTuiLaunchSession,
  warmupWorkspaceControlRenderer,
  workspaceControlRendererCrateDir,
  workspaceControlRendererSearchRoots,
  workspaceControlRendererSupportsCodeChrome,
  workspaceControlRendererUnavailableMessage,
} from "./workspace-tui-launch.js";

export function createRatatuiWorkspaceControlPresentation(
  input: RatatuiWorkspaceControlPresentationInput = {},
): WorkspaceControlPresentation {
  return createBoundedWorkspaceControlPresentation({
    openRenderer: async () => {
      const warmed = consumeWarmedWorkspaceControlRenderer();
      if (warmed) {
        return warmed as Promise<WorkspaceControlRendererSession>;
      }
      return openWorkspaceControlRenderer(input) as Promise<WorkspaceControlRendererSession>;
    },
    openUrl: async (url) => {
      const environment = input.environment ?? process.env;
      if (!occupancyBrowserLaunchAllowed(environment)) return false;
      const command =
        process.platform === "darwin"
          ? ["open", url]
          : process.platform === "win32"
            ? ["cmd", "/c", "start", "", url]
            : ["xdg-open", url];
      const [bin, ...argv] = command;
      if (!bin) return false;
      const child = spawn(bin, argv, {
        shell: false,
        stdio: "ignore",
      });
      child.unref();
      return true;
    },
  });
}

export function createRatatuiOperatePresentation(
  input: RatatuiWorkspaceControlPresentationInput = {},
): OperatePresentation {
  return createBoundedOperatePresentation({
    openRenderer: async () => {
      const environment = input.environment ?? process.env;
      const binaryPath = input.binaryPath ?? resolveWorkspaceControlRendererBinary(environment);
      if (!binaryPath) {
        throw domainError.infra("Operate renderer is unavailable", {
          phase: "workspace-control-renderer",
          reason: "binary-missing",
          platform: process.platform,
          architecture: process.arch,
        });
      }
      const renderer = await openLoopbackWorkspaceControlRenderer({
        launch: async ({ port, token }) => {
          const child = spawn(binaryPath, [], {
            shell: false,
            stdio: "inherit",
            env: {
              ...environment,
              APPALOFT_TUI_MODE: "operate",
              APPALOFT_WORKSPACE_TUI_PORT: String(port),
              APPALOFT_WORKSPACE_TUI_TOKEN: token,
            },
          });
          const exited = new Promise<void>((resolveExit, rejectExit) => {
            child.once("error", rejectExit);
            child.once("exit", () => resolveExit());
          });
          return { exited, terminate: () => child.kill("SIGTERM") };
        },
      });
      return renderer as unknown as OperateRendererSession;
    },
  });
}
