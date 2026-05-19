import { type DomainError } from "@appaloft/core";

export type DeploymentStateBackendKind = "ssh-pglite" | "local-pglite" | "postgres-control-plane";

export type DeploymentStateStorageScope = "remote-ssh" | "local-process" | "control-plane";

export interface TrustedSshTargetInput {
  host: string;
  port?: number;
  providerKey?: string;
  username?: string;
  identityFile?: string;
}

export interface DeploymentStateBackendInput {
  explicitBackend?: DeploymentStateBackendKind;
  databaseUrl?: string;
  controlPlaneUrl?: string;
  trustedSshTarget?: TrustedSshTargetInput;
  localOnly?: boolean;
  entrypoint?: "cli" | "github-actions" | "local-web-agent";
}

export interface DeploymentStateBackendDecision {
  kind: DeploymentStateBackendKind;
  storageScope: DeploymentStateStorageScope;
  databaseUrlRequired: boolean;
  requiresRemoteStateLifecycle: boolean;
  reason: string;
  trustedSshTarget?: TrustedSshTargetInput;
}

export const serverStateBackendMarkerFile = "backend.json";
export const serverStateBackendMarkerSchemaVersion = "server-state-backend/v1";
export const serverStateBackendMismatchReason = "SERVER_STATE_BACKEND_MISMATCH";

export interface ServerStateBackendMarker {
  schemaVersion: typeof serverStateBackendMarkerSchemaVersion;
  stateBackend: DeploymentStateBackendKind;
  updatedAt?: string;
  owner?: string;
}

export function isDeploymentStateBackendKind(value: unknown): value is DeploymentStateBackendKind {
  return value === "ssh-pglite" || value === "local-pglite" || value === "postgres-control-plane";
}

export function parseServerStateBackendMarker(
  value: string | undefined,
): ServerStateBackendMarker | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as {
      schemaVersion?: unknown;
      stateBackend?: unknown;
      updatedAt?: unknown;
      owner?: unknown;
    };
    if (
      parsed.schemaVersion !== serverStateBackendMarkerSchemaVersion ||
      !isDeploymentStateBackendKind(parsed.stateBackend)
    ) {
      return null;
    }

    return {
      schemaVersion: serverStateBackendMarkerSchemaVersion,
      stateBackend: parsed.stateBackend,
      ...(typeof parsed.updatedAt === "string" ? { updatedAt: parsed.updatedAt } : {}),
      ...(typeof parsed.owner === "string" ? { owner: parsed.owner } : {}),
    };
  } catch {
    return null;
  }
}

export function createServerStateBackendMarker(input: {
  stateBackend: DeploymentStateBackendKind;
  updatedAt: string;
  owner?: string;
}): ServerStateBackendMarker {
  return {
    schemaVersion: serverStateBackendMarkerSchemaVersion,
    stateBackend: input.stateBackend,
    updatedAt: input.updatedAt,
    ...(input.owner ? { owner: input.owner } : {}),
  };
}

export function serverStateBackendMismatchError(input: {
  expectedStateBackend: DeploymentStateBackendKind;
  actualStateBackend: DeploymentStateBackendKind | "unknown";
  phase: string;
  host?: string;
  port?: string | number;
  dataRoot?: string;
}): DomainError {
  return {
    code: "server_state_backend_mismatch",
    category: "user",
    message:
      "Server state backend marker does not match the selected backend; use an explicit adopt or migrate workflow before switching backends.",
    retryable: false,
    details: {
      phase: input.phase,
      reason: serverStateBackendMismatchReason,
      expectedStateBackend: input.expectedStateBackend,
      actualStateBackend: input.actualStateBackend,
      stateBackend: input.actualStateBackend,
      ...(input.host ? { host: input.host } : {}),
      ...(input.port === undefined ? {} : { port: String(input.port) }),
      ...(input.dataRoot ? { dataRoot: input.dataRoot } : {}),
    },
  };
}

export type SourceFingerprintScope =
  | { kind: "default" }
  | { kind: "branch"; branch: string }
  | { kind: "preview"; pullRequestNumber?: number; branch?: string };

export interface SourceFingerprintInput {
  provider?: string;
  providerRepositoryId?: string;
  repositoryLocator: string;
  baseDirectory?: string;
  configPath?: string;
  workspaceRoot?: string;
  gitRef?: string;
  commitSha?: string;
  scope?: SourceFingerprintScope;
}

export interface SourceFingerprint {
  key: string;
  scopeKey: string;
  parts: {
    provider: string;
    repository: string;
    baseDirectory: string;
    configPath: string;
  };
  observed: {
    gitRef?: string;
    commitSha?: string;
  };
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function resolveDeploymentStateBackend(
  input: DeploymentStateBackendInput,
): DeploymentStateBackendDecision {
  if (input.explicitBackend === "local-pglite" || input.localOnly === true) {
    return {
      kind: "local-pglite",
      storageScope: "local-process",
      databaseUrlRequired: false,
      requiresRemoteStateLifecycle: false,
      reason: "Local PGlite was explicitly selected for local-only state.",
    };
  }

  if (input.explicitBackend === "ssh-pglite") {
    return {
      kind: "ssh-pglite",
      storageScope: "remote-ssh",
      databaseUrlRequired: false,
      requiresRemoteStateLifecycle: true,
      reason: "SSH-server PGlite was explicitly selected.",
      ...(input.trustedSshTarget ? { trustedSshTarget: input.trustedSshTarget } : {}),
    };
  }

  if (
    input.explicitBackend === "postgres-control-plane" ||
    trimmed(input.databaseUrl) ||
    trimmed(input.controlPlaneUrl)
  ) {
    return {
      kind: "postgres-control-plane",
      storageScope: "control-plane",
      databaseUrlRequired: true,
      requiresRemoteStateLifecycle: false,
      reason: "A PostgreSQL/control-plane state backend was selected.",
    };
  }

  if (input.trustedSshTarget) {
    return {
      kind: "ssh-pglite",
      storageScope: "remote-ssh",
      databaseUrlRequired: false,
      requiresRemoteStateLifecycle: true,
      reason: "A trusted SSH target is present and no control plane was selected.",
      trustedSshTarget: input.trustedSshTarget,
    };
  }

  return {
    kind: "local-pglite",
    storageScope: "local-process",
    databaseUrlRequired: false,
    requiresRemoteStateLifecycle: false,
    reason: "No SSH target or control plane was selected.",
  };
}

function normalizePathSeparators(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
}

function stripWorkspacePrefix(value: string, workspaceRoot?: string): string {
  const normalized = normalizePathSeparators(value);
  const root = workspaceRoot ? normalizePathSeparators(workspaceRoot).replace(/\/+$/, "") : "";

  if (root && normalized === root) {
    return ".";
  }

  if (root && normalized.startsWith(`${root}/`)) {
    return normalized.slice(root.length + 1);
  }

  return normalized;
}

function normalizeSafeRelativePath(
  value: string | undefined,
  fallback: string,
  workspaceRoot?: string,
): string {
  const stripped = stripWorkspacePrefix(value ?? fallback, workspaceRoot)
    .replace(/^\.\//, "")
    .replace(/\/+$/, "");

  if (!stripped || stripped === ".") {
    return fallback;
  }

  if (stripped.startsWith("/")) {
    return fallback;
  }

  return stripped;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, "");
}

function normalizeRepositoryLocator(locator: string): string {
  const raw = stripGitSuffix(locator.trim().replace(/\/+$/, ""));
  const sshMatch = /^git@([^:]+):(.+)$/.exec(raw);
  if (sshMatch) {
    const host = sshMatch[1]?.toLowerCase() ?? "unknown";
    const path = stripGitSuffix(sshMatch[2] ?? "").replace(/^\/+/, "");
    return `${host}/${path.toLowerCase()}`;
  }

  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase();
    const path = stripGitSuffix(url.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));
    return `${host}/${host === "github.com" ? path.toLowerCase() : path}`;
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeProvider(provider: string | undefined): string {
  return trimmed(provider)?.toLowerCase() ?? "unknown";
}

function normalizeBranch(branch: string): string {
  return branch.trim().replace(/^refs\/heads\//, "");
}

function scopeKey(scope: SourceFingerprintScope | undefined): string {
  if (!scope || scope.kind === "default") {
    return "default";
  }

  if (scope.kind === "branch") {
    return `branch:${normalizeBranch(scope.branch)}`;
  }

  if (scope.pullRequestNumber !== undefined) {
    return `preview:pr:${scope.pullRequestNumber}`;
  }

  return `preview:branch:${normalizeBranch(scope.branch ?? "unknown")}`;
}

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value);
}

export function createSourceFingerprint(input: SourceFingerprintInput): SourceFingerprint {
  const provider = normalizeProvider(input.provider);
  const providerRepositoryId = trimmed(input.providerRepositoryId);
  const repository = providerRepositoryId
    ? `provider-repository:${providerRepositoryId}`
    : normalizeRepositoryLocator(input.repositoryLocator);
  const baseDirectory = normalizeSafeRelativePath(input.baseDirectory, ".", input.workspaceRoot);
  const configPath = normalizeSafeRelativePath(
    input.configPath,
    "appaloft.yml",
    input.workspaceRoot,
  );
  const normalizedScopeKey = scopeKey(input.scope);
  const gitRef = trimmed(input.gitRef);
  const commitSha = trimmed(input.commitSha);
  const observed: SourceFingerprint["observed"] = {};
  if (gitRef) {
    observed.gitRef = gitRef;
  }
  if (commitSha) {
    observed.commitSha = commitSha;
  }
  const keyParts = [
    "source-fingerprint:v1",
    normalizedScopeKey,
    provider,
    repository,
    baseDirectory,
    configPath,
  ];

  return {
    key: keyParts.map(encodeKeyPart).join(":"),
    scopeKey: normalizedScopeKey,
    parts: {
      provider,
      repository,
      baseDirectory,
      configPath,
    },
    observed,
  };
}
