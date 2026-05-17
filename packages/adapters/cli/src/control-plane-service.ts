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
  deriveProfileName,
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
  readonly url: string;
  readonly mode?: CliControlPlaneMode;
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
  const mode = input.mode ?? "self-hosted";

  const normalizedUrl = normalizeControlPlaneUrl(input.url);
  if (normalizedUrl.isErr()) {
    return err(normalizedUrl.error);
  }

  const auth = readControlPlaneAuthFromEnvironment(resolved.env);
  if (auth.isErr()) {
    return err(auth.error);
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
