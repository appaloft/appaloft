import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

export type CliControlPlaneMode = "cloud" | "self-hosted";

export type CliControlPlaneAuth =
  | {
      readonly kind: "bearer";
      readonly token: string;
    }
  | {
      readonly kind: "product-session";
      readonly cookie: string;
    };

export interface CliControlPlaneHandshake {
  readonly checkedAt: string;
  readonly name?: string;
  readonly version?: string;
  readonly apiVersion?: string;
  readonly mode?: string;
}

export interface CliControlPlaneOrganizationContext {
  readonly organizationId: string;
  readonly name?: string;
  readonly slug?: string;
  readonly role?: string;
}

export interface CliControlPlaneProfile {
  readonly name: string;
  readonly mode: CliControlPlaneMode;
  readonly baseUrl: string;
  readonly auth: CliControlPlaneAuth;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastHandshake?: CliControlPlaneHandshake;
  readonly currentOrganization?: CliControlPlaneOrganizationContext;
}

export interface CliControlPlaneProfileView {
  readonly name: string;
  readonly mode: CliControlPlaneMode;
  readonly baseUrl: string;
  readonly active: boolean;
  readonly auth: {
    readonly kind: CliControlPlaneAuth["kind"];
    readonly redacted: string;
  };
  readonly lastHandshake?: CliControlPlaneHandshake;
  readonly currentOrganization?: CliControlPlaneOrganizationContext;
}

export interface CliControlPlaneProfileStoreData {
  readonly activeProfile?: string;
  readonly profiles: Readonly<Record<string, CliControlPlaneProfile>>;
}

export interface CliControlPlaneProfileStore {
  read(): Promise<Result<CliControlPlaneProfileStoreData>>;
  write(data: CliControlPlaneProfileStoreData): Promise<Result<void>>;
}

export type CliControlPlaneEnvironment = Readonly<Record<string, string | undefined>>;

const emptyStoreData: CliControlPlaneProfileStoreData = {
  profiles: {},
};

function controlPlaneProfileError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

function controlPlaneProfileInfraError(
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code: "control_plane_profile_store_unavailable",
    category: "infra",
    message,
    retryable: true,
    ...(details ? { details } : {}),
  };
}

function profileStorePath(env: CliControlPlaneEnvironment = process.env): string {
  const root = env.APPALOFT_HOME?.trim() || join(homedir(), ".appaloft");
  return join(root, "profiles.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseAuth(value: unknown): CliControlPlaneAuth | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readOptionalString(value, "kind");
  if (kind === "bearer") {
    const token = readOptionalString(value, "token");
    return token ? { kind, token } : null;
  }

  if (kind === "product-session") {
    const cookie = readOptionalString(value, "cookie");
    return cookie ? { kind, cookie } : null;
  }

  return null;
}

function parseHandshake(value: unknown): CliControlPlaneHandshake | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const checkedAt = readOptionalString(value, "checkedAt");
  if (!checkedAt) {
    return undefined;
  }

  const name = readOptionalString(value, "name");
  const version = readOptionalString(value, "version");
  const apiVersion = readOptionalString(value, "apiVersion");
  const mode = readOptionalString(value, "mode");

  return {
    checkedAt,
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    ...(apiVersion ? { apiVersion } : {}),
    ...(mode ? { mode } : {}),
  };
}

function parseOrganizationContext(value: unknown): CliControlPlaneOrganizationContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const organizationId = readOptionalString(value, "organizationId");
  if (!organizationId) {
    return undefined;
  }

  const name = readOptionalString(value, "name");
  const slug = readOptionalString(value, "slug");
  const role = readOptionalString(value, "role");

  return {
    organizationId,
    ...(name ? { name } : {}),
    ...(slug ? { slug } : {}),
    ...(role ? { role } : {}),
  };
}

function parseProfile(name: string, value: unknown): CliControlPlaneProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const mode = readOptionalString(value, "mode");
  const baseUrl = readOptionalString(value, "baseUrl");
  const auth = parseAuth(value.auth);
  const createdAt = readOptionalString(value, "createdAt");
  const updatedAt = readOptionalString(value, "updatedAt");

  if (
    (mode !== "cloud" && mode !== "self-hosted") ||
    !baseUrl ||
    !auth ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const lastHandshake = parseHandshake(value.lastHandshake);
  const currentOrganization = parseOrganizationContext(value.currentOrganization);

  return {
    name,
    mode,
    baseUrl,
    auth,
    createdAt,
    updatedAt,
    ...(lastHandshake ? { lastHandshake } : {}),
    ...(currentOrganization ? { currentOrganization } : {}),
  };
}

function parseStoreData(value: unknown): Result<CliControlPlaneProfileStoreData> {
  if (!isRecord(value)) {
    return err(
      controlPlaneProfileError("control_plane_profile_store_invalid", "Profile store is invalid", {
        phase: "control-plane-profile-read",
      }),
    );
  }

  const rawProfiles = value.profiles;
  if (!isRecord(rawProfiles)) {
    return err(
      controlPlaneProfileError("control_plane_profile_store_invalid", "Profile store is invalid", {
        phase: "control-plane-profile-read",
      }),
    );
  }

  const profiles: Record<string, CliControlPlaneProfile> = {};
  for (const [name, profileValue] of Object.entries(rawProfiles)) {
    const profile = parseProfile(name, profileValue);
    if (!profile) {
      return err(
        controlPlaneProfileError(
          "control_plane_profile_store_invalid",
          `Profile ${name} is invalid`,
          {
            phase: "control-plane-profile-read",
            profile: name,
          },
        ),
      );
    }
    profiles[name] = profile;
  }

  const activeProfile = readOptionalString(value, "activeProfile");
  if (activeProfile && !profiles[activeProfile]) {
    return err(
      controlPlaneProfileError(
        "control_plane_profile_store_invalid",
        "Active profile does not exist",
        {
          phase: "control-plane-profile-read",
          profile: activeProfile,
        },
      ),
    );
  }

  return ok({
    ...(activeProfile ? { activeProfile } : {}),
    profiles,
  });
}

export class FileSystemCliControlPlaneProfileStore implements CliControlPlaneProfileStore {
  constructor(private readonly path: string = profileStorePath()) {}

  async read(): Promise<Result<CliControlPlaneProfileStoreData>> {
    if (!existsSync(this.path)) {
      return ok(emptyStoreData);
    }

    try {
      const text = await readFile(this.path, "utf8");
      return parseStoreData(JSON.parse(text) as unknown);
    } catch (error) {
      return err(
        controlPlaneProfileInfraError("Profile store could not be read", {
          phase: "control-plane-profile-read",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async write(data: CliControlPlaneProfileStoreData): Promise<Result<void>> {
    const directory = dirname(this.path);
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;

    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700).catch(() => undefined);
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600).catch(() => undefined);
      await rename(temporaryPath, this.path);
      await chmod(this.path, 0o600).catch(() => undefined);
      return ok(undefined);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      return err(
        controlPlaneProfileInfraError("Profile store could not be written", {
          phase: "control-plane-profile-write",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

export class MemoryCliControlPlaneProfileStore implements CliControlPlaneProfileStore {
  constructor(private data: CliControlPlaneProfileStoreData = emptyStoreData) {}

  async read(): Promise<Result<CliControlPlaneProfileStoreData>> {
    return ok(this.data);
  }

  async write(data: CliControlPlaneProfileStoreData): Promise<Result<void>> {
    this.data = data;
    return ok(undefined);
  }
}

export function defaultCliControlPlaneProfileStore(
  env: CliControlPlaneEnvironment = process.env,
): CliControlPlaneProfileStore {
  return new FileSystemCliControlPlaneProfileStore(profileStorePath(env));
}

export function normalizeControlPlaneUrl(url: string): Result<string> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return err(
        controlPlaneProfileError("validation_error", "Control plane URL must use http or https", {
          phase: "control-plane-profile-write",
        }),
      );
    }

    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return err(
        controlPlaneProfileError(
          "validation_error",
          "Control plane URL must not include credentials, query, or fragment",
          {
            phase: "control-plane-profile-write",
          },
        ),
      );
    }

    if (parsed.pathname !== "" && parsed.pathname !== "/") {
      return err(
        controlPlaneProfileError("validation_error", "Control plane URL must not include a path", {
          phase: "control-plane-profile-write",
        }),
      );
    }

    return ok(parsed.origin);
  } catch {
    return err(
      controlPlaneProfileError("validation_error", "Control plane URL must be a valid URL", {
        phase: "control-plane-profile-write",
      }),
    );
  }
}

export function deriveProfileName(url: string, mode: CliControlPlaneMode): string {
  if (mode === "cloud") {
    return "cloud";
  }

  const parsed = new URL(url);
  return parsed.host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function readControlPlaneAuthFromEnvironment(
  env: CliControlPlaneEnvironment = process.env,
): Result<CliControlPlaneAuth> {
  const cookie = env.APPALOFT_AUTH_COOKIE?.trim();
  if (cookie) {
    return ok({ kind: "product-session", cookie });
  }

  const authorization = env.APPALOFT_AUTHORIZATION?.trim();
  const token = env.APPALOFT_TOKEN?.trim() || authorization?.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    return ok({ kind: "bearer", token });
  }

  return err(
    controlPlaneProfileError(
      "control_plane_auth_missing",
      "Set APPALOFT_AUTH_COOKIE or APPALOFT_TOKEN before logging in to a self-hosted control plane",
      {
        phase: "control-plane-auth",
      },
    ),
  );
}

function secretPreview(secret: string): string {
  const suffix = secret.slice(-4);
  return suffix ? `***${suffix}` : "***";
}

export function profileView(
  profile: CliControlPlaneProfile,
  activeProfile?: string,
): CliControlPlaneProfileView {
  const secret = profile.auth.kind === "bearer" ? profile.auth.token : profile.auth.cookie;
  return {
    name: profile.name,
    mode: profile.mode,
    baseUrl: profile.baseUrl,
    active: activeProfile === profile.name,
    auth: {
      kind: profile.auth.kind,
      redacted: secretPreview(secret),
    },
    ...(profile.lastHandshake ? { lastHandshake: profile.lastHandshake } : {}),
    ...(profile.currentOrganization ? { currentOrganization: profile.currentOrganization } : {}),
  };
}
