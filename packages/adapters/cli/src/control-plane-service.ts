import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliAuthSessionRequestedCredential,
  type CliRemoteProjectOperationKey,
  cancelCliAuthSession,
  createCliAuthSession,
  defaultControlPlaneFetch,
  exchangeCliAuthSession,
  performControlPlaneHandshake,
  pollCliAuthSession,
  requestRemoteProjectOperation,
} from "./control-plane-client.js";
import {
  type CliControlPlaneAuth,
  type CliControlPlaneEnvironment,
  type CliControlPlaneLoginProfileView,
  type CliControlPlaneLoginSessionView,
  type CliControlPlaneMode,
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
  type CliControlPlaneProfileView,
  defaultCliControlPlaneProfileStore,
  defaultPublicCloudControlPlaneUrl,
  deriveProfileName,
  isDefaultPublicCloudControlPlaneUrl,
  normalizeControlPlaneUrl,
  profileView,
  readControlPlaneAuthFromEnvironment,
  readControlPlaneBearerTokenFromEnvironment,
} from "./control-plane-profile.js";

export interface CliControlPlaneDependencies {
  readonly confirmOpenBrowser?: (
    session: CliControlPlaneLoginSessionView,
  ) => Promise<boolean> | boolean;
  readonly env?: CliControlPlaneEnvironment;
  readonly fetch?: AppaloftSdkFetch;
  readonly monotonicNow?: () => number;
  readonly now?: () => string;
  readonly onLoginSession?: (session: CliControlPlaneLoginSessionView) => Promise<void> | void;
  readonly openBrowser?: (url: string) => Promise<boolean> | boolean;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly store?: CliControlPlaneProfileStore;
}

export interface CliControlPlaneLoginInput {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly openBrowser?: boolean;
  readonly pollTimeoutMs?: number;
  readonly profile?: string;
  readonly requestedCredential?: CliAuthSessionRequestedCredential;
  readonly signal?: AbortSignal;
}

export interface CliControlPlaneTokenLoginInput {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly profile?: string;
  readonly token?: string;
}

export interface CliControlPlaneStatus {
  readonly activeProfile?: string;
  readonly profiles: readonly CliControlPlaneProfileView[];
}

type AcquiredControlPlaneAuth = {
  readonly auth: CliControlPlaneAuth;
  readonly output?: CliControlPlaneLoginSessionView;
};

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
    confirmOpenBrowser: input?.confirmOpenBrowser ?? (() => true),
    env,
    fetch: input?.fetch ?? defaultControlPlaneFetch,
    monotonicNow: input?.monotonicNow ?? (() => Date.now()),
    now: input?.now ?? (() => new Date().toISOString()),
    onLoginSession: input?.onLoginSession ?? (() => undefined),
    openBrowser: input?.openBrowser ?? ((url: string) => openBrowser(url, env)),
    sleep: input?.sleep ?? ((milliseconds: number) => Bun.sleep(milliseconds)),
    store: input?.store ?? defaultCliControlPlaneProfileStore(env),
  };
}

function openBrowser(url: string, env: CliControlPlaneEnvironment): boolean {
  if (env.APPALOFT_CLI_OPEN_BROWSER === "false" || env.CI === "true") {
    return false;
  }

  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];

  const subprocess = Bun.spawn(command, {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  subprocess.unref();
  return true;
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

function interruptedAuthError(): DomainError {
  return controlPlaneError(
    "control_plane_auth_interrupted",
    "user",
    "CLI browser auth polling was interrupted",
    true,
    {
      phase: "control-plane-auth",
    },
  );
}

function authStatusError(status: "denied" | "expired"): DomainError {
  return controlPlaneError(
    status === "denied" ? "control_plane_auth_denied" : "control_plane_auth_expired",
    "user",
    status === "denied" ? "CLI browser login was canceled" : "CLI browser login link expired",
    false,
    {
      phase: "control-plane-auth",
    },
  );
}

function authTimeoutError(): DomainError {
  return controlPlaneError(
    "control_plane_auth_timeout",
    "timeout",
    "CLI browser auth polling timed out",
    true,
    {
      phase: "control-plane-auth",
    },
  );
}

function authSessionOutput(input: {
  readonly browserOpenRequiresConfirmation: boolean;
  readonly openedBrowser: boolean;
  readonly openBrowserFailed: boolean;
  readonly userCode: string;
  readonly verificationUriComplete: string;
}): CliControlPlaneLoginSessionView {
  return {
    schemaVersion: "appaloft-cli-auth-session/v1" as const,
    verificationUriComplete: input.verificationUriComplete,
    userCode: input.userCode,
    browserOpenRequiresConfirmation: input.browserOpenRequiresConfirmation,
    openedBrowser: input.openedBrowser,
    openBrowserFailed: input.openBrowserFailed,
  };
}

async function tryCancelAuthSession(input: {
  readonly baseUrl: string;
  readonly deviceCode: string;
  readonly fetch: AppaloftSdkFetch;
}): Promise<void> {
  await cancelCliAuthSession(input).catch(() => undefined);
}

async function sleepUntilNextPoll(input: {
  readonly milliseconds: number;
  readonly signal?: AbortSignal;
  readonly sleep: (milliseconds: number) => Promise<void>;
}): Promise<"ready" | "interrupted"> {
  if (!input.signal) {
    await input.sleep(input.milliseconds);
    return "ready";
  }
  if (input.signal.aborted) {
    return "interrupted";
  }

  return new Promise((resolve, reject) => {
    const abort = () => resolve("interrupted");
    input.signal?.addEventListener("abort", abort, { once: true });
    input
      .sleep(input.milliseconds)
      .then(() => resolve("ready"), reject)
      .finally(() => {
        input.signal?.removeEventListener("abort", abort);
      });
  });
}

async function acquireBrowserAuth(input: {
  readonly baseUrl: string;
  readonly confirmOpenBrowser: (
    session: CliControlPlaneLoginSessionView,
  ) => Promise<boolean> | boolean;
  readonly fetch: AppaloftSdkFetch;
  readonly openBrowser: (url: string) => Promise<boolean> | boolean;
  readonly onLoginSession: (session: CliControlPlaneLoginSessionView) => Promise<void> | void;
  readonly monotonicNow: () => number;
  readonly requestedCredential?: CliAuthSessionRequestedCredential;
  readonly shouldOpenBrowser: boolean;
  readonly signal?: AbortSignal;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly timeoutMs: number;
}): Promise<
  Result<{ readonly auth: CliControlPlaneAuth; readonly output: CliControlPlaneLoginSessionView }>
> {
  const session = await createCliAuthSession({
    baseUrl: input.baseUrl,
    fetch: input.fetch,
    ...(input.requestedCredential ? { requestedCredential: input.requestedCredential } : {}),
  });
  if (session.isErr()) {
    return err(session.error);
  }

  if (input.signal?.aborted) {
    await tryCancelAuthSession({
      baseUrl: input.baseUrl,
      deviceCode: session.value.deviceCode,
      fetch: input.fetch,
    });
    return err(interruptedAuthError());
  }

  let openedBrowser = false;
  let openBrowserFailed = false;
  const initialOutput = authSessionOutput({
    browserOpenRequiresConfirmation: input.shouldOpenBrowser,
    openedBrowser,
    openBrowserFailed,
    userCode: session.value.userCode,
    verificationUriComplete: session.value.verificationUriComplete,
  });
  await input.onLoginSession(initialOutput);

  if (input.shouldOpenBrowser && (await input.confirmOpenBrowser(initialOutput))) {
    if (input.signal?.aborted) {
      await tryCancelAuthSession({
        baseUrl: input.baseUrl,
        deviceCode: session.value.deviceCode,
        fetch: input.fetch,
      });
      return err(interruptedAuthError());
    }
    try {
      openedBrowser = await input.openBrowser(session.value.verificationUriComplete);
    } catch {
      openBrowserFailed = true;
    }
  }

  const output = authSessionOutput({
    browserOpenRequiresConfirmation: false,
    openedBrowser,
    openBrowserFailed,
    userCode: session.value.userCode,
    verificationUriComplete: session.value.verificationUriComplete,
  });
  if (openBrowserFailed) {
    await input.onLoginSession(output);
  }
  const startedAt = input.monotonicNow();
  let intervalMs = Math.max(0, session.value.interval) * 1000;

  while (true) {
    if (input.signal?.aborted) {
      await tryCancelAuthSession({
        baseUrl: input.baseUrl,
        deviceCode: session.value.deviceCode,
        fetch: input.fetch,
      });
      return err(interruptedAuthError());
    }

    if (input.monotonicNow() - startedAt > input.timeoutMs) {
      return err(authTimeoutError());
    }

    const polled = await pollCliAuthSession({
      baseUrl: input.baseUrl,
      deviceCode: session.value.deviceCode,
      fetch: input.fetch,
    });
    if (polled.isErr()) {
      return err(polled.error);
    }

    if (polled.value.status === "authorized") {
      const exchanged = await exchangeCliAuthSession({
        baseUrl: input.baseUrl,
        deviceCode: session.value.deviceCode,
        fetch: input.fetch,
      });
      if (exchanged.isErr()) {
        return err(exchanged.error);
      }
      return ok({
        auth: exchanged.value.auth,
        output,
      });
    }

    if (polled.value.status === "denied" || polled.value.status === "expired") {
      return err(authStatusError(polled.value.status));
    }

    intervalMs = Math.max(0, polled.value.interval ?? session.value.interval) * 1000;
    const waitResult = await sleepUntilNextPoll({
      milliseconds: intervalMs,
      ...(input.signal ? { signal: input.signal } : {}),
      sleep: input.sleep,
    });
    if (waitResult === "interrupted") {
      await tryCancelAuthSession({
        baseUrl: input.baseUrl,
        deviceCode: session.value.deviceCode,
        fetch: input.fetch,
      });
      return err(interruptedAuthError());
    }
  }
}

function resolveLoginTarget(input: {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly profile?: string;
}): Result<{
  readonly mode: CliControlPlaneMode;
  readonly normalizedUrl: string;
  readonly profileName: string;
}> {
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
  const profileName = validateProfileName(
    input.profile ?? deriveProfileName(normalizedUrl.value, mode),
  );
  if (profileName.isErr()) {
    return err(profileName.error);
  }

  return ok({
    mode,
    normalizedUrl: normalizedUrl.value,
    profileName: profileName.value,
  });
}

async function writeVerifiedControlPlaneProfile(input: {
  readonly auth: CliControlPlaneAuth;
  readonly deps: Required<CliControlPlaneDependencies>;
  readonly login?: CliControlPlaneLoginSessionView;
  readonly mode: CliControlPlaneMode;
  readonly normalizedUrl: string;
  readonly profileName: string;
}): Promise<Result<CliControlPlaneLoginProfileView>> {
  const checkedAt = input.deps.now();
  const handshake = await performControlPlaneHandshake({
    baseUrl: input.normalizedUrl,
    auth: input.auth,
    checkedAt,
    fetch: input.deps.fetch,
  });
  if (handshake.isErr()) {
    return err(handshake.error);
  }

  const storeData = await input.deps.store.read();
  if (storeData.isErr()) {
    return err(storeData.error);
  }

  const existing = storeData.value.profiles[input.profileName];
  const profile: CliControlPlaneProfile = {
    name: input.profileName,
    mode: input.mode,
    baseUrl: input.normalizedUrl,
    auth: input.auth,
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
  const written = await input.deps.store.write(nextData);
  if (written.isErr()) {
    return err(written.error);
  }

  const view = profileView(profile, nextData.activeProfile);
  return ok(
    input.login
      ? {
          ...view,
          login: input.login,
        }
      : view,
  );
}

export async function loginControlPlane(
  input: CliControlPlaneLoginInput,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneLoginProfileView>> {
  const resolved = dependencies(deps);
  const target = resolveLoginTarget(input);
  if (target.isErr()) {
    return err(target.error);
  }

  const shouldOpenBrowser = input.openBrowser ?? (!input.url || target.value.mode === "cloud");
  const environmentAuth = readControlPlaneAuthFromEnvironment(resolved.env);
  const acquiredAuth: Result<AcquiredControlPlaneAuth> = environmentAuth.isOk()
    ? ok({
        auth: environmentAuth.value,
      })
    : await acquireBrowserAuth({
        baseUrl: target.value.normalizedUrl,
        confirmOpenBrowser: resolved.confirmOpenBrowser,
        fetch: resolved.fetch,
        monotonicNow: resolved.monotonicNow,
        onLoginSession: resolved.onLoginSession,
        openBrowser: resolved.openBrowser,
        ...(input.requestedCredential ? { requestedCredential: input.requestedCredential } : {}),
        shouldOpenBrowser,
        ...(input.signal ? { signal: input.signal } : {}),
        sleep: resolved.sleep,
        timeoutMs: input.pollTimeoutMs ?? 10 * 60 * 1000,
      });
  if (acquiredAuth.isErr()) {
    return err(acquiredAuth.error);
  }

  return writeVerifiedControlPlaneProfile({
    auth: acquiredAuth.value.auth,
    deps: resolved,
    ...(acquiredAuth.value.output ? { login: acquiredAuth.value.output } : {}),
    mode: target.value.mode,
    normalizedUrl: target.value.normalizedUrl,
    profileName: target.value.profileName,
  });
}

export function mcpLoginControlPlane(
  input: Omit<CliControlPlaneLoginInput, "requestedCredential">,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneLoginProfileView>> {
  return loginControlPlane(
    {
      ...input,
      profile: input.profile ?? "mcp",
      requestedCredential: "bearer",
    },
    deps,
  );
}

export async function tokenLoginControlPlane(
  input: CliControlPlaneTokenLoginInput,
  deps?: CliControlPlaneDependencies,
): Promise<Result<CliControlPlaneLoginProfileView>> {
  const resolved = dependencies(deps);
  const target = resolveLoginTarget(input);
  if (target.isErr()) {
    return err(target.error);
  }

  const explicitToken = input.token === undefined ? undefined : input.token.trim();
  if (input.token !== undefined && !explicitToken) {
    return err(
      controlPlaneError("validation_error", "user", "Token material is empty", false, {
        phase: "control-plane-auth",
      }),
    );
  }
  const bearer =
    explicitToken !== undefined
      ? ok({ kind: "bearer" as const, token: explicitToken })
      : readControlPlaneBearerTokenFromEnvironment(resolved.env);
  if (bearer.isErr()) {
    return err(bearer.error);
  }

  return writeVerifiedControlPlaneProfile({
    auth: bearer.value,
    deps: resolved,
    mode: target.value.mode,
    normalizedUrl: target.value.normalizedUrl,
    profileName: target.value.profileName,
  });
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
