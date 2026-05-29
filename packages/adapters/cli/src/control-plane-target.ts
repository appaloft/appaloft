import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import {
  appaloftDeploymentConfigFileNames,
  parseAppaloftDeploymentConfigText,
} from "@appaloft/deployment-config";
import {
  type CliControlPlaneAuth,
  type CliControlPlaneEnvironment,
  type CliControlPlaneMode,
  type CliControlPlaneProfile,
  type CliControlPlaneProfileStore,
  defaultCliControlPlaneProfileStore,
  defaultPublicCloudControlPlaneUrl,
  deriveProfileName,
  isDefaultPublicCloudControlPlaneUrl,
  normalizeControlPlaneUrl,
  readControlPlaneAuthFromEnvironment,
} from "./control-plane-profile.js";
import { activeControlPlaneProfile } from "./control-plane-service.js";

export type CliControlPlaneSelectionMode = "none" | "auto" | CliControlPlaneMode;

export interface CliControlPlaneGlobalOptions {
  readonly mode?: CliControlPlaneSelectionMode;
  readonly url?: string;
  readonly profile?: string;
}

export type CliExecutionTarget =
  | {
      readonly kind: "local";
      readonly argv: readonly string[];
      readonly diagnostics: CliExecutionTargetDiagnostics;
    }
  | {
      readonly kind: "remote";
      readonly argv: readonly string[];
      readonly profile: CliControlPlaneProfile;
      readonly diagnostics: CliExecutionTargetDiagnostics;
    };

export interface CliExecutionTargetDiagnostics {
  readonly command?: string;
  readonly source: "cli" | "env" | "config" | "profile" | "default";
  readonly requestedMode?: CliControlPlaneSelectionMode;
  readonly effectiveMode: CliControlPlaneSelectionMode;
  readonly reason: string;
  readonly configPath?: string;
}

export interface CliExecutionTargetResolverInput {
  readonly argv?: readonly string[];
  readonly cwd?: string;
  readonly env?: CliControlPlaneEnvironment;
  readonly now?: () => string;
  readonly store?: CliControlPlaneProfileStore;
}

interface ParsedGlobalOptions {
  readonly argv: readonly string[];
  readonly options: CliControlPlaneGlobalOptions;
}

interface ControlPlaneConfigSelection {
  readonly mode?: CliControlPlaneSelectionMode;
  readonly url?: string;
  readonly path?: string;
}

const remoteCapableTopLevelCommands = new Set([
  "auth",
  "audit-event",
  "certificate",
  "default-access",
  "dependency",
  "deploy-token",
  "deployments",
  "domain-binding",
  "domain-event",
  "env",
  "logs",
  "operator-work",
  "organization",
  "plugins",
  "preview",
  "project",
  "provider-job-log",
  "providers",
  "resource",
  "retention-default",
  "runtime-monitoring",
  "runtime-usage",
  "scheduled-task",
  "server",
  "source-event",
  "source-links",
  "static-artifacts",
  "storage",
  "terminal-session",
  "upgrade",
]);

const localOnlyTopLevelCommands = new Set(["db", "deploy", "init", "remote-state", "serve"]);

function localOnlyCommandLabel(argv: readonly string[]): string | null {
  const args = commandArgs(argv);
  const command = args[0];
  const subcommand = args[1];

  if (command === "server" && subcommand === "terminal") {
    return "server terminal";
  }

  if (command === "resource" && subcommand === "terminal") {
    return "resource terminal";
  }

  return command && localOnlyTopLevelCommands.has(command) ? command : null;
}

function controlPlaneResolutionError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "control-plane-resolution",
      ...(details ?? {}),
    },
  };
}

function configError(message: string, configPath: string): DomainError {
  return controlPlaneResolutionError("validation_error", message, {
    configPath,
  });
}

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function topLevelCommand(argv: readonly string[]): string | undefined {
  return commandArgs(argv)[0];
}

function isControlPlaneProfileCommand(
  command: string | undefined,
  argv: readonly string[],
): boolean {
  if (command === "login" || command === "logout" || command === "context") {
    return true;
  }

  if (command !== "auth") {
    return false;
  }

  const subcommand = commandArgs(argv)[1];
  return subcommand === "login" || subcommand === "logout" || subcommand === "status";
}

function readOptionValue(
  args: readonly string[],
  index: number,
  key: string,
): Result<{ readonly value: string; readonly consumed: number }> {
  const arg = args[index];
  const prefix = `--${key}=`;
  if (arg?.startsWith(prefix)) {
    return ok({ value: arg.slice(prefix.length), consumed: 1 });
  }

  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    return err(controlPlaneResolutionError("validation_error", `Option --${key} requires a value`));
  }

  return ok({ value, consumed: 2 });
}

function parseMode(value: string): Result<CliControlPlaneSelectionMode> {
  if (value === "none" || value === "auto" || value === "cloud" || value === "self-hosted") {
    return ok(value);
  }

  return err(
    controlPlaneResolutionError(
      "validation_error",
      "Control plane mode must be none, auto, cloud, or self-hosted",
    ),
  );
}

export function parseCliControlPlaneGlobalOptions(
  argv: readonly string[] = process.argv,
): Result<ParsedGlobalOptions> {
  const nextArgv = argv.slice(0, 2);
  const options: {
    mode?: CliControlPlaneSelectionMode;
    url?: string;
    profile?: string;
  } = {};

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--control-plane-mode" || arg?.startsWith("--control-plane-mode=")) {
      const read = readOptionValue(argv, index, "control-plane-mode");
      if (read.isErr()) {
        return err(read.error);
      }
      const mode = parseMode(read.value.value);
      if (mode.isErr()) {
        return err(mode.error);
      }
      options.mode = mode.value;
      index += read.value.consumed - 1;
      continue;
    }

    if (arg === "--control-plane-url" || arg?.startsWith("--control-plane-url=")) {
      const read = readOptionValue(argv, index, "control-plane-url");
      if (read.isErr()) {
        return err(read.error);
      }
      options.url = read.value.value;
      index += read.value.consumed - 1;
      continue;
    }

    if (arg === "--control-plane-profile" || arg?.startsWith("--control-plane-profile=")) {
      const read = readOptionValue(argv, index, "control-plane-profile");
      if (read.isErr()) {
        return err(read.error);
      }
      options.profile = read.value.value;
      index += read.value.consumed - 1;
      continue;
    }

    if (arg !== undefined) {
      nextArgv.push(arg);
    }
  }

  return ok({
    argv: nextArgv,
    options,
  });
}

function envSelection(env: CliControlPlaneEnvironment): CliControlPlaneGlobalOptions {
  const rawMode = env.APPALOFT_CONTROL_PLANE_MODE?.trim();
  const mode =
    rawMode === "none" || rawMode === "auto" || rawMode === "cloud" || rawMode === "self-hosted"
      ? rawMode
      : undefined;
  const url = env.APPALOFT_CONTROL_PLANE_URL?.trim();
  const profile =
    env.APPALOFT_CONTROL_PLANE_PROFILE?.trim() || env.APPALOFT_PROFILE?.trim() || undefined;

  return {
    ...(mode ? { mode } : {}),
    ...(url ? { url } : {}),
    ...(profile ? { profile } : {}),
  };
}

function findConfigPath(cwd: string): string | null {
  let current = resolve(cwd);

  while (true) {
    for (const fileName of appaloftDeploymentConfigFileNames) {
      const candidate = join(current, fileName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function configSelection(cwd: string): Result<ControlPlaneConfigSelection> {
  const path = findConfigPath(cwd);
  if (!path) {
    return ok({});
  }

  const parsed = parseAppaloftDeploymentConfigText(readFileSync(path, "utf8"), path);
  if (!parsed.success) {
    return err(
      configError(parsed.error.issues[0]?.message ?? "Control-plane config is invalid", path),
    );
  }

  const controlPlane = parsed.data.controlPlane;
  if (!controlPlane) {
    return ok({ path });
  }

  return ok({
    mode: controlPlane.mode,
    ...(controlPlane.url ? { url: controlPlane.url } : {}),
    path,
  });
}

function selectionSource(input: {
  readonly cli: CliControlPlaneGlobalOptions;
  readonly env: CliControlPlaneGlobalOptions;
  readonly config: ControlPlaneConfigSelection;
}): "cli" | "env" | "config" | "default" {
  if (input.cli.mode || input.cli.url || input.cli.profile) {
    return "cli";
  }
  if (input.env.mode || input.env.url || input.env.profile) {
    return "env";
  }
  if (input.config.mode || input.config.url) {
    return "config";
  }
  return "default";
}

function selectedMode(input: {
  readonly cli: CliControlPlaneGlobalOptions;
  readonly env: CliControlPlaneGlobalOptions;
  readonly config: ControlPlaneConfigSelection;
}): CliControlPlaneSelectionMode | undefined {
  return input.cli.mode ?? input.env.mode ?? input.config.mode;
}

function selectedUrl(input: {
  readonly cli: CliControlPlaneGlobalOptions;
  readonly env: CliControlPlaneGlobalOptions;
  readonly config: ControlPlaneConfigSelection;
}): string | undefined {
  return input.cli.url ?? input.env.url ?? input.config.url;
}

function selectedProfile(input: {
  readonly cli: CliControlPlaneGlobalOptions;
  readonly env: CliControlPlaneGlobalOptions;
}): string | undefined {
  return input.cli.profile ?? input.env.profile;
}

function localTarget(input: {
  readonly argv: readonly string[];
  readonly command: string | undefined;
  readonly source: CliExecutionTargetDiagnostics["source"];
  readonly requestedMode?: CliControlPlaneSelectionMode | undefined;
  readonly effectiveMode?: CliControlPlaneSelectionMode | undefined;
  readonly reason: string;
  readonly configPath?: string | undefined;
}): CliExecutionTarget {
  return {
    kind: "local",
    argv: input.argv,
    diagnostics: {
      ...(input.command ? { command: input.command } : {}),
      source: input.source,
      ...(input.requestedMode ? { requestedMode: input.requestedMode } : {}),
      effectiveMode: input.effectiveMode ?? "none",
      reason: input.reason,
      ...(input.configPath ? { configPath: input.configPath } : {}),
    },
  };
}

function remoteTarget(input: {
  readonly argv: readonly string[];
  readonly command: string | undefined;
  readonly source: CliExecutionTargetDiagnostics["source"];
  readonly requestedMode: CliControlPlaneSelectionMode;
  readonly profile: CliControlPlaneProfile;
  readonly reason: string;
  readonly configPath?: string | undefined;
}): CliExecutionTarget {
  return {
    kind: "remote",
    argv: input.argv,
    profile: input.profile,
    diagnostics: {
      ...(input.command ? { command: input.command } : {}),
      source: input.source,
      requestedMode: input.requestedMode,
      effectiveMode: input.profile.mode,
      reason: input.reason,
      ...(input.configPath ? { configPath: input.configPath } : {}),
    },
  };
}

async function profileFromStore(input: {
  readonly store: CliControlPlaneProfileStore;
  readonly name?: string;
}): Promise<Result<CliControlPlaneProfile | null>> {
  if (!input.name) {
    return activeControlPlaneProfile({ store: input.store });
  }

  const data = await input.store.read();
  if (data.isErr()) {
    return err(data.error);
  }

  const profile = data.value.profiles[input.name];
  if (!profile) {
    return err(
      controlPlaneResolutionError(
        "control_plane_profile_not_found",
        "Control plane profile not found",
        {
          profile: input.name,
        },
      ),
    );
  }

  return ok(profile);
}

function profileFromExplicitUrl(input: {
  readonly auth: CliControlPlaneAuth;
  readonly mode: CliControlPlaneMode;
  readonly now: string;
  readonly url: string;
  readonly profileName?: string;
}): Result<CliControlPlaneProfile> {
  const normalized = normalizeControlPlaneUrl(input.url);
  if (normalized.isErr()) {
    return err(normalized.error);
  }

  const name = input.profileName ?? deriveProfileName(normalized.value, input.mode);
  return ok({
    name,
    mode: input.mode,
    baseUrl: normalized.value,
    auth: input.auth,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

function isExplicitRemoteSource(source: CliExecutionTargetDiagnostics["source"]): boolean {
  return source === "cli" || source === "env" || source === "config";
}

function ensureProfileMode(
  profile: CliControlPlaneProfile,
  requestedMode: CliControlPlaneMode,
): Result<void> {
  if (profile.mode === requestedMode) {
    return ok(undefined);
  }

  return err(
    controlPlaneResolutionError(
      "validation_error",
      "Selected control-plane profile mode does not match the requested mode",
      {
        profile: profile.name,
        profileMode: profile.mode,
        requestedMode,
      },
    ),
  );
}

export async function resolveCliExecutionTarget(
  input: CliExecutionTargetResolverInput = {},
): Promise<Result<CliExecutionTarget>> {
  const parsed = parseCliControlPlaneGlobalOptions(input.argv ?? process.argv);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const argv = parsed.value.argv;
  const command = topLevelCommand(argv);
  if (isControlPlaneProfileCommand(command, argv)) {
    return ok(
      localTarget({
        argv,
        command,
        source: "default",
        reason: "Control-plane profile commands are handled by the local profile client.",
      }),
    );
  }

  const env = input.env ?? process.env;
  const config = configSelection(input.cwd ?? process.cwd());
  if (config.isErr()) {
    return err(config.error);
  }

  const cliSelection = parsed.value.options;
  const environmentSelection = envSelection(env);
  const selection = {
    cli: cliSelection,
    env: environmentSelection,
    config: config.value,
  };
  const source = selectionSource(selection);
  const requestedMode = selectedMode(selection);
  const url = selectedUrl(selection);
  const profileName = selectedProfile(selection);
  const store = input.store ?? defaultCliControlPlaneProfileStore(env);
  const localOnlyCommand = localOnlyCommandLabel(argv);

  if (requestedMode === "none") {
    return ok(
      localTarget({
        argv,
        command,
        source,
        requestedMode,
        reason: "Control-plane mode none selects the local CLI runtime.",
        configPath: config.value.path,
      }),
    );
  }

  if (localOnlyCommand) {
    if (requestedMode && requestedMode !== "auto" && isExplicitRemoteSource(source)) {
      return err(
        controlPlaneResolutionError(
          "control_plane_unsupported",
          "This command remains local-only and cannot run through a remote control plane yet",
          {
            command: localOnlyCommand,
            requestedMode,
          },
        ),
      );
    }

    return ok(
      localTarget({
        argv,
        command,
        source,
        requestedMode,
        reason: "Command is local-only for this control-plane client round.",
        configPath: config.value.path,
      }),
    );
  }

  if (command && !remoteCapableTopLevelCommands.has(command)) {
    return ok(
      localTarget({
        argv,
        command,
        source,
        requestedMode,
        reason: "Command has no remote control-plane mapping.",
        configPath: config.value.path,
      }),
    );
  }

  if (url) {
    if (requestedMode === "auto") {
      return err(
        controlPlaneResolutionError(
          "validation_error",
          "Control-plane URL requires mode cloud or self-hosted",
          {
            requestedMode,
          },
        ),
      );
    }

    const normalized = normalizeControlPlaneUrl(url);
    if (normalized.isErr()) {
      return err(normalized.error);
    }
    if (requestedMode === "self-hosted" && isDefaultPublicCloudControlPlaneUrl(normalized.value)) {
      return err(
        controlPlaneResolutionError(
          "validation_error",
          "The default Appaloft Cloud endpoint requires cloud mode",
          {
            requestedMode,
          },
        ),
      );
    }
    const mode =
      requestedMode === "cloud" || isDefaultPublicCloudControlPlaneUrl(normalized.value)
        ? "cloud"
        : "self-hosted";

    const storedProfile = await profileFromStore({
      store,
      ...(profileName ? { name: profileName } : {}),
    });
    if (storedProfile.isErr()) {
      return err(storedProfile.error);
    }
    if (
      storedProfile.value &&
      storedProfile.value.baseUrl === normalized.value &&
      storedProfile.value.mode === mode
    ) {
      return ok(
        remoteTarget({
          argv,
          command,
          source,
          requestedMode: requestedMode ?? mode,
          profile: storedProfile.value,
          reason: "Control-plane URL matched the selected local profile.",
          configPath: config.value.path,
        }),
      );
    }

    const auth = readControlPlaneAuthFromEnvironment(env);
    if (auth.isErr()) {
      return err(auth.error);
    }
    const profile = profileFromExplicitUrl({
      auth: auth.value,
      mode,
      now: input.now?.() ?? new Date().toISOString(),
      url,
      ...(profileName ? { profileName } : {}),
    });
    if (profile.isErr()) {
      return err(profile.error);
    }

    return ok(
      remoteTarget({
        argv,
        command,
        source,
        requestedMode: requestedMode ?? mode,
        profile: profile.value,
        reason: "Explicit control-plane URL selects remote dispatch.",
        configPath: config.value.path,
      }),
    );
  }

  if (requestedMode === "cloud" || requestedMode === "self-hosted") {
    const profile = await profileFromStore({
      store,
      ...(profileName ? { name: profileName } : {}),
    });
    if (profile.isErr()) {
      return err(profile.error);
    }
    if (!profile.value) {
      if (requestedMode === "cloud") {
        const auth = readControlPlaneAuthFromEnvironment(env);
        if (auth.isErr()) {
          return err(auth.error);
        }
        const defaultCloudProfile = profileFromExplicitUrl({
          auth: auth.value,
          mode: "cloud",
          now: input.now?.() ?? new Date().toISOString(),
          url: defaultPublicCloudControlPlaneUrl,
          ...(profileName ? { profileName } : {}),
        });
        if (defaultCloudProfile.isErr()) {
          return err(defaultCloudProfile.error);
        }

        return ok(
          remoteTarget({
            argv,
            command,
            source,
            requestedMode,
            profile: defaultCloudProfile.value,
            reason: "Explicit Cloud mode selects the default Appaloft Cloud control plane.",
            configPath: config.value.path,
          }),
        );
      }

      return err(
        controlPlaneResolutionError(
          "control_plane_profile_not_found",
          "Remote control-plane mode requires a logged-in profile or explicit control-plane URL",
          {
            requestedMode,
          },
        ),
      );
    }
    const modeMatch = ensureProfileMode(profile.value, requestedMode);
    if (modeMatch.isErr()) {
      return err(modeMatch.error);
    }

    return ok(
      remoteTarget({
        argv,
        command,
        source,
        requestedMode,
        profile: profile.value,
        reason: "Explicit remote mode selects the active control-plane profile.",
        configPath: config.value.path,
      }),
    );
  }

  const activeProfile = await profileFromStore({
    store,
    ...(profileName ? { name: profileName } : {}),
  });
  if (activeProfile.isErr()) {
    return err(activeProfile.error);
  }

  if (requestedMode === "auto") {
    if (!activeProfile.value) {
      return ok(
        localTarget({
          argv,
          command,
          source,
          requestedMode,
          reason: "Auto mode found no trusted profile, endpoint, or adoption marker.",
          configPath: config.value.path,
        }),
      );
    }

    return ok(
      remoteTarget({
        argv,
        command,
        source: "profile",
        requestedMode,
        profile: activeProfile.value,
        reason: "Auto mode selected the active control-plane profile.",
        configPath: config.value.path,
      }),
    );
  }

  if (activeProfile.value && config.value.mode !== "none") {
    return ok(
      remoteTarget({
        argv,
        command,
        source: "profile",
        requestedMode: activeProfile.value.mode,
        profile: activeProfile.value,
        reason: "Active control-plane profile selects remote dispatch.",
        configPath: config.value.path,
      }),
    );
  }

  return ok(
    localTarget({
      argv,
      command,
      source: "default",
      reason: "No trusted control-plane profile or endpoint was selected.",
      configPath: config.value.path,
    }),
  );
}
