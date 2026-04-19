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
