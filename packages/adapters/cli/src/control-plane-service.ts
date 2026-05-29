import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliRemoteProjectOperationKey,
  performControlPlaneHandshake,
  requestRemoteProjectOperation,
} from "./control-plane-client.js";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneMode,
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
  type CliControlPlaneProfileView,
  defaultCliControlPlaneProfileStore,
  defaultPublicCloudBrowserLoginUrl,
  defaultPublicCloudControlPlaneUrl,
  deriveProfileName,
  isDefaultPublicCloudControlPlaneUrl,
  normalizeControlPlaneUrl,
  profileView,
  readControlPlaneAuthFromEnvironment,
} from "./control-plane-profile.js";

export interface CliControlPlaneDependencies {
  readonly env?: CliControlPlaneEnvironment;
  readonly fetch?: AppaloftSdkFetch;
  readonly now?: () => string;
  readonly store?: CliControlPlaneProfileStore;
}

export interface CliControlPlaneLoginInput {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly openBrowser?: boolean;
  readonly profile?: string;
}

export interface CliControlPlaneStatus {
  readonly activeProfile?: string;
  readonly profiles: readonly CliControlPlaneProfileView[];
}

function controlPlaneError(
  code: string,
  category: DomainError["category"],
  message: string,
  retryable: boolean,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category,
    message,
    retryable,
    ...(details ? { details } : {}),
  };
}

function dependencies(input?: CliControlPlaneDependencies): Required<CliControlPlaneDependencies> {
  const env = input?.env ?? process.env;
  return {
    env,
    fetch: input?.fetch ?? ((request: Request) => fetch(request)),
    now: input?.now ?? (() => new Date().toISOString()),
    store: input?.store ?? defaultCliControlPlaneProfileStore(env),
  };
}

function openBrowser(url: string, env: CliControlPlaneEnvironment): Result<boolean> {
  if (env.APPALOFT_CLI_OPEN_BROWSER === "false" || env.CI === "true") {
    return ok(false);
  }

  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];

  try {
    const subprocess = Bun.spawn(command, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    subprocess.unref();
    return ok(true);
  } catch (error) {
    return err(
      controlPlaneError(
        "control_plane_browser_open_failed",
        "infra",
        "Could not open the browser for Appaloft login",
        true,
        {
          phase: "control-plane-auth",
          message: error instanceof Error ? error.message : String(error),
        },
      ),
    );
  }
}

function loginAuthMissingError(input: {
  readonly browserLoginUrl: string;
  readonly defaultCloud: boolean;
  readonly openedBrowser: boolean;
}): DomainError {
  const credentialMessage = input.defaultCloud
    ? "Open the browser login URL, then provide a CLI product-session cookie through APPALOFT_AUTH_COOKIE after the Cloud CLI authorization exchange is available. For noninteractive automation, provide APPALOFT_TOKEN explicitly."
    : "Provide a trusted local product-session cookie through APPALOFT_AUTH_COOKIE or a bearer token through APPALOFT_TOKEN before logging in to this control plane.";

  return controlPlaneError(
    "control_plane_auth_missing",
    "user",
    input.defaultCloud
      ? `${input.openedBrowser ? "Appaloft Cloud login opened in the browser" : "Open Appaloft Cloud login in a browser"} at ${input.browserLoginUrl}, but the CLI does not yet have a local credential to verify`
      : "Control-plane login requires a local credential to verify",
    false,
    {
      phase: "control-plane-auth",
      browserLoginUrl: input.browserLoginUrl,
      credential: credentialMessage,
    },
  );
}

function validateProfileName(value: string): Result<string> {
  const name = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(name)) {
    return err(
      controlPlaneError(
        "validation_error",
        "user",
        "Profile name must be 1-63 characters and use letters, numbers, dots, underscores, or dashes",
        false,
        {
          phase: "control-plane-profile-write",
        },
      ),
    );
  }

  return ok(name);
}

function selectProfile(
  profiles: Readonly<Record<string, CliControlPlaneProfile>>,
  activeProfile: string | undefined,
  requestedProfile: string | undefined,
): Result<CliControlPlaneProfile | null> {
  const name = requestedProfile ?? activeProfile;
  if (!name) {
    return ok(null);
  }

  const profile = profiles[name];
  if (!profile) {
    return err(
      controlPlaneError(
        "control_plane_profile_not_found",
        "user",
        "Control plane profile not found",
        false,
        {
          phase: "control-plane-profile-read",
          profile: name,
        },
      ),
    );
  }

  return ok(profile);
}

function sortedProfiles(
  profiles: Readonly<Record<string, CliControlPlaneProfile>>,
  activeProfile: string | undefined,
): CliControlPlaneProfileView[] {
  return Object.values(profiles)
    .map((profile) => profileView(profile, activeProfile))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function loginControlPlane(
  input: CliControlPlaneLoginInput,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneProfileView>> {
  const resolved = dependencies(deps);
  if (input.mode === "self-hosted" && !input.url) {
    return err(
      controlPlaneError(
        "validation_error",
        "user",
        "Self-hosted control-plane login requires --url",
        false,
        {
          phase: "control-plane-profile-write",
        },
      ),
    );
  }

  const rawUrl = input.url ?? defaultPublicCloudControlPlaneUrl;

  const normalizedUrl = normalizeControlPlaneUrl(rawUrl);
  if (normalizedUrl.isErr()) {
    return err(normalizedUrl.error);
  }
  if (input.mode === "self-hosted" && isDefaultPublicCloudControlPlaneUrl(normalizedUrl.value)) {
    return err(
      controlPlaneError(
        "validation_error",
        "user",
        "The default Appaloft Cloud endpoint requires cloud mode",
        false,
        {
          phase: "control-plane-profile-write",
        },
      ),
    );
  }
  const mode =
    input.mode ??
    (isDefaultPublicCloudControlPlaneUrl(normalizedUrl.value) ? "cloud" : "self-hosted");
  const shouldOpenBrowser = input.openBrowser ?? (!input.url || mode === "cloud");
  const browserLoginUrl = defaultPublicCloudBrowserLoginUrl(normalizedUrl.value);
  const defaultCloud = mode === "cloud" && isDefaultPublicCloudControlPlaneUrl(normalizedUrl.value);

  let openedBrowser = false;
  if (shouldOpenBrowser) {
    const opened = openBrowser(browserLoginUrl, resolved.env);
    if (opened.isErr()) {
      return err(opened.error);
    }
    openedBrowser = opened.value;
  }

  const auth = readControlPlaneAuthFromEnvironment(resolved.env);
  if (auth.isErr()) {
    return err(
      loginAuthMissingError({
        browserLoginUrl,
        defaultCloud,
        openedBrowser,
      }),
    );
  }

  const profileName = validateProfileName(
    input.profile ?? deriveProfileName(normalizedUrl.value, mode),
  );
  if (profileName.isErr()) {
    return err(profileName.error);
  }

  const checkedAt = resolved.now();
  const handshake = await performControlPlaneHandshake({
    baseUrl: normalizedUrl.value,
    auth: auth.value,
    checkedAt,
    fetch: resolved.fetch,
  });
  if (handshake.isErr()) {
    return err(handshake.error);
  }

  const storeData = await resolved.store.read();
  if (storeData.isErr()) {
    return err(storeData.error);
  }

  const existing = storeData.value.profiles[profileName.value];
  const profile: CliControlPlaneProfile = {
    name: profileName.value,
    mode,
    baseUrl: normalizedUrl.value,
    auth: auth.value,
    createdAt: existing?.createdAt ?? checkedAt,
    updatedAt: checkedAt,
    lastHandshake: handshake.value.handshake,
    ...(handshake.value.currentOrganization
      ? { currentOrganization: handshake.value.currentOrganization }
      : {}),
  };
  const nextData = {
    activeProfile: profile.name,
    profiles: {
      ...storeData.value.profiles,
      [profile.name]: profile,
    },
  };
  const written = await resolved.store.write(nextData);
  if (written.isErr()) {
    return err(written.error);
  }

  return ok(profileView(profile, nextData.activeProfile));
}

export async function logoutControlPlane(
  profileName?: string,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneStatus>> {
  const resolved = dependencies(deps);
  const data = await resolved.store.read();
  if (data.isErr()) {
    return err(data.error);
  }

  const targetProfile = profileName ?? data.value.activeProfile;
  if (!targetProfile) {
    return ok({
      profiles: sortedProfiles(data.value.profiles, data.value.activeProfile),
    });
  }

  const profiles = { ...data.value.profiles };
  delete profiles[targetProfile];
  const activeProfile =
    data.value.activeProfile === targetProfile
      ? Object.keys(profiles).sort()[0]
      : data.value.activeProfile;
  const nextData = {
    ...(activeProfile ? { activeProfile } : {}),
    profiles,
  };
  const written = await resolved.store.write(nextData);
  if (written.isErr()) {
    return err(written.error);
  }

  return ok({
    ...(nextData.activeProfile ? { activeProfile: nextData.activeProfile } : {}),
    profiles: sortedProfiles(nextData.profiles, nextData.activeProfile),
  });
}

export async function controlPlaneStatus(
  profileName?: string,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneStatus>> {
  const resolved = dependencies(deps);
  const data = await resolved.store.read();
  if (data.isErr()) {
    return err(data.error);
  }

  if (profileName) {
    const profile = selectProfile(data.value.profiles, data.value.activeProfile, profileName);
    if (profile.isErr()) {
      return err(profile.error);
    }
    return ok({
      ...(data.value.activeProfile ? { activeProfile: data.value.activeProfile } : {}),
      profiles: profile.value ? [profileView(profile.value, data.value.activeProfile)] : [],
    });
  }

  return ok({
    ...(data.value.activeProfile ? { activeProfile: data.value.activeProfile } : {}),
    profiles: sortedProfiles(data.value.profiles, data.value.activeProfile),
  });
}

export async function useControlPlaneProfile(
  profileName: string,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneProfileView>> {
  const resolved = dependencies(deps);
  const data = await resolved.store.read();
  if (data.isErr()) {
    return err(data.error);
  }

  const target = selectProfile(data.value.profiles, data.value.activeProfile, profileName);
  if (target.isErr()) {
    return err(target.error);
  }
  if (!target.value) {
    return err(
      controlPlaneError(
        "control_plane_profile_not_found",
        "user",
        "Control plane profile not found",
        false,
        {
          phase: "control-plane-profile-read",
          profile: profileName,
        },
      ),
    );
  }

  const written = await resolved.store.write({
    activeProfile: target.value.name,
    profiles: data.value.profiles,
  });
  if (written.isErr()) {
    return err(written.error);
  }

  return ok(profileView(target.value, target.value.name));
}

export async function activeControlPlaneProfile(
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneProfile | null>> {
  const resolved = dependencies(deps);
  const data = await resolved.store.read();
  if (data.isErr()) {
    return err(data.error);
  }
  return selectProfile(data.value.profiles, data.value.activeProfile, undefined);
}

export async function dispatchRemoteProjectOperation(input: {
  readonly operationKey: CliRemoteProjectOperationKey;
  readonly projectId?: string;
  readonly deps?: CliControlPlaneDependencies;
}): Promise<Result<unknown | null>> {
  const profile = await activeControlPlaneProfile(input.deps);
  if (profile.isErr()) {
    return err(profile.error);
  }
  if (!profile.value) {
    return ok(null);
  }

  return requestRemoteProjectOperation({
    profile: profile.value,
    operationKey: input.operationKey,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.deps?.fetch ? { fetch: input.deps.fetch } : {}),
  });
}

export function unsupportedRemoteProjectOperation(subcommand: string): DomainError {
  return controlPlaneError(
    "control_plane_unsupported",
    "user",
    "The selected control-plane profile does not support this project command in the current CLI slice",
    false,
    {
      phase: "remote-operation-dispatch",
      command: `project ${subcommand}`,
    },
  );
}
