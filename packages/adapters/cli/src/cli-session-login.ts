import { type DomainError } from "@appaloft/core";
import {
  defaultCliControlPlaneProfileStore,
  isDefaultPublicCloudControlPlaneUrl,
} from "./control-plane-profile.js";
import { activeControlPlaneProfile } from "./control-plane-service.js";

export const CLI_LOGIN_GUIDANCE = "Run appaloft login";
export const CLI_LOGIN_REQUIRED_WORKSPACE_STATUS = "login-required" as const;

export interface LoginRequiredWorkspaceOccupancyTree {
  readonly schemaVersion: "appaloft.workspace-occupancy/v1";
  readonly status: typeof CLI_LOGIN_REQUIRED_WORKSPACE_STATUS;
  readonly reason: string;
  readonly nextAction: typeof CLI_LOGIN_GUIDANCE;
  readonly servers: readonly [];
  readonly occupancies: readonly [];
}

export async function hasCliControlPlaneLogin(
  env: NodeJS.ProcessEnv = process.env,
  readActiveProfile?: () => Promise<{ readonly auth?: unknown } | null>,
): Promise<boolean> {
  if (
    env.APPALOFT_TOKEN?.trim() ||
    env.APPALOFT_AUTHORIZATION?.trim() ||
    env.APPALOFT_AUTH_COOKIE?.trim()
  ) {
    return true;
  }
  const profile =
    readActiveProfile === undefined
      ? (
          await activeControlPlaneProfile({
            store: defaultCliControlPlaneProfileStore(env),
          })
        ).match(
          (value) => value,
          () => null,
        )
      : await readActiveProfile();
  return Boolean(profile?.auth);
}

export function workspaceRemoteLoginRequiredError(): DomainError {
  return {
    code: "workspace_remote_login_required",
    category: "user",
    message: "Sign in before opening a remote Agent session",
    retryable: false,
    details: {
      phase: "remote-code-login",
      guidance: "Run appaloft login, then retry. Use appaloft code --local for this-Mac scratch.",
    },
  };
}

export function deployLoginRequiredError(): DomainError {
  return {
    code: "product_auth_missing",
    category: "user",
    message: "Sign in before deploying",
    retryable: false,
    details: {
      phase: "control-plane-login",
      guidance:
        "Run appaloft login, then retry. Enroll this Mac or a VPS with appaloft server enroll if no Server is available.",
    },
  };
}

export function loginRequiredWorkspaceOccupancyTree(
  reason: string,
): LoginRequiredWorkspaceOccupancyTree {
  return {
    schemaVersion: "appaloft.workspace-occupancy/v1",
    status: CLI_LOGIN_REQUIRED_WORKSPACE_STATUS,
    reason,
    nextAction: CLI_LOGIN_GUIDANCE,
    servers: [],
    occupancies: [],
  };
}

export function isHeadlessWorkspaceInvocation(
  args: readonly string[],
  stdin: { readonly isTTY?: boolean } = process.stdin,
  stdout: { readonly isTTY?: boolean } = process.stdout,
): boolean {
  const subcommand = args[1];
  if (subcommand && !subcommand.startsWith("-")) {
    return false;
  }
  return args.includes("--json") || args.includes("--no-tui") || !stdin.isTTY || !stdout.isTTY;
}

export function hasExplicitLocalDeployIntent(args: readonly string[]): boolean {
  return args.some(
    (arg) =>
      arg === "--server-host" ||
      arg.startsWith("--server-host=") ||
      arg === "--state-backend" ||
      arg.startsWith("--state-backend="),
  );
}

export function requiresCloudDeployLogin(
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (hasExplicitLocalDeployIntent(args)) {
    return false;
  }
  const mode = env.APPALOFT_CONTROL_PLANE_MODE?.trim().toLowerCase();
  if (mode === "none") {
    return false;
  }
  if (mode === "cloud") {
    return true;
  }
  const url = env.APPALOFT_CONTROL_PLANE_URL?.trim();
  return Boolean(url && isDefaultPublicCloudControlPlaneUrl(url));
}
