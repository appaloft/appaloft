import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createDeploymentProgressEvent,
  deploymentProgressSteps,
  type AppLogger,
  type DeploymentExecutionGuard,
  type DeploymentProgressRecorder,
  type DeploymentProgressReporter,
  type DependencyResourceSecretStore,
  type EdgeProxyProviderRegistry,
  type ExecutionBackend,
  type ExecutionContext,
  type IntegrationAuthPort,
  type ResourceAccessFailureRendererTarget,
  type ServerRepository,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentTimelineJournalEntry,
  DeploymentTimelineSourceValue,
  DeploymentPhaseValue,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  domainError,
  err,
  ok,
  type AccessRoute,
  type Deployment,
  type DeploymentState,
  type Result,
  type RuntimeExecutionPlan,
  type RuntimeVerificationStep,
  type RollbackPlan,
} from "@appaloft/core";
import {
  createEdgeProxyEnsurePlan,
  createProxyReloadPlan,
  createProxyRouteRealizationPlan,
  proxyBootstrapOptionsFromEnv,
} from "./edge-proxy-plans";
import { classifyEdgeProxyStartFailure } from "./edge-proxy-failure-classification";
import { executeProxyReloadPlan } from "./proxy-reload-execution";
import {
  parseResolvedGitCommitSha,
  shortGitCommitSha,
  sourceCommitShaMetadataKey,
} from "./git-source-metadata";
import {
  gitSubmoduleUpdateArgs,
  githubHttpsSubmodulePrefix,
} from "./git-source-submodules";
import {
  dockerPublishedPortCommand,
  dockerRemoveConflictingRouteContainersCommand,
  parseDockerPublishedHostPort,
  appaloftDockerContainerLabelsForDeployment,
} from "./docker-container-commands";
import {
  requireServerBackedDeploymentState,
  requireServerBackedDeploymentStateFromState,
} from "./deployment-target";
import { deriveRuntimeInstanceNames } from "./runtime-instance-names";
import {
  RuntimeCommandBuilder,
  dockerLabelsFromAssignments,
  renderRuntimeCommandString,
} from "./runtime-commands";
import { runStreamingProcess } from "./streaming-process";
import {
  resolveDependencyRuntimeEnvironment,
  runtimeContainerEnvironmentVariables,
} from "./dependency-runtime-secrets";
import { normalizeGeneratedDockerBuildAssetPath } from "./generated-docker-build-assets";
import { generateStaticSiteDockerBuild, generateWorkspaceDockerBuild } from "./workspace-planners";
import { runBufferedProcess, shellCommand } from "./buffered-process";
import { renderComposeOwnershipLabelOverrideScript } from "./compose-label-overrides";
import {
  replicatedWorkloadComposeFileFromMetadata,
  replicatedWorkloadReplicasFromMetadata,
  replicatedWorkloadServiceNameFromMetadata,
  renderReplicatedWorkloadCompose,
  renderServiceGraphCompose,
  serviceGraphComposeFileFromMetadata,
  serviceGraphComposeServicesFromMetadata,
} from "./service-graph-compose";
import {
  runtimeTargetCapacityAwareFailureFields,
} from "./runtime-target-failure-classification";
import { remoteDockerPrepareCommand } from "./server-runtime-preparer";
import {
  renderRemotePrivateTextFileCommand,
  renderRuntimeEnvironmentShellFile,
  withOptionalRemoteRuntimeEnvironmentFile,
  withRemoteRuntimeEnvironmentFile,
} from "./ssh-runtime-env-file";
import { createPreviewRuntimeArtifactCleanupPlan } from "./preview-artifact-cleanup";
import {
  dockerStorageMountsFromRuntimeMetadata,
  dockerStorageVolumeRealizationsFromRuntimeMetadata,
  renderDockerVolumeRealizationScript,
} from "./storage-runtime-mounts";

type LogPhase = "detect" | "plan" | "package" | "deploy" | "verify" | "rollback";
type LogLevel = "debug" | "info" | "warn" | "error";
type LogSource = "appaloft" | "ssh" | "docker" | "application" | "provider" | "health" | "domain-event";

const defaultSshEdgeProxyCommandTimeoutMs = 120_000;

function composeScaleFromRuntimeMetadata(
  metadata: Record<string, string> | undefined,
): Array<{ serviceName: string; replicas: number }> {
  const serviceName = replicatedWorkloadServiceNameFromMetadata(metadata);
  const replicas = replicatedWorkloadReplicasFromMetadata(metadata);

  return serviceName && replicas ? [{ serviceName, replicas }] : [];
}

function classifyOutputLogLevel(line: string, fallback: LogLevel): LogLevel {
  const normalized = line.toLowerCase();
  if (/\b(error|failed|failure|fatal)\b/.test(normalized)) {
    return "error";
  }

  if (/\b(warn|warning)\b/.test(normalized)) {
    return "warn";
  }

  return fallback === "error" ? "error" : "info";
}

function phaseLog(
  phase: LogPhase,
  message: string,
  level: LogLevel = "info",
  source: LogSource = "appaloft",
): DeploymentTimelineJournalEntry {
  return DeploymentTimelineJournalEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentTimelineSourceValue.rehydrate(source),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function sanitizeName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function remoteGeneratedDockerBuildAssetPath(remoteWorkdir: string, relativePath: string): string {
  return `${remoteWorkdir.replace(/\/+$/, "")}/${normalizeGeneratedDockerBuildAssetPath(
    relativePath,
  )}`;
}

function remoteWriteTextFileCommand(path: string, contents: string): string {
  const encoded = Buffer.from(contents, "utf8").toString("base64");
  return [
    `mkdir -p ${shellQuote(dirname(path))}`,
    `printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(path)}`,
  ].join(" && ");
}

function remoteWriteTextFilesCommand(files: readonly { path: string; contents: string }[]): string {
  return files.map((file) => remoteWriteTextFileCommand(file.path, file.contents)).join(" && ");
}

function redactSecrets(input: string, secrets: readonly string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret.length > 0 ? text.replaceAll(secret, "[redacted]") : text),
    input,
  );
}

function normalizeWorkingDirectory(locator: string): string {
  const resolved = resolve(locator);
  if (existsSync(resolved)) {
    return resolved;
  }

  return dirname(resolved);
}

function normalizeDockerImage(locator: string): string {
  return locator.replace(/^docker:\/\//, "").replace(/^image:\/\//, "");
}

export function parseDockerRepoDigestFromInspect(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (Array.isArray(parsed)) {
        const digest = parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.match(/@(sha256:[0-9a-f]{64})$/i)?.[1])
          .find((candidate): candidate is string => Boolean(candidate));
        if (digest) {
          return digest;
        }
      }
    } catch {
      // Fall through to regex extraction below.
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.match(/@(sha256:[0-9a-f]{64})$/i)?.[1])
        .find((digest): digest is string => Boolean(digest));
    }
  } catch {
    const digest = trimmed.match(/@(sha256:[0-9a-f]{64})/i)?.[1];
    if (digest) {
      return digest;
    }
  }

  return trimmed.match(/\b(sha256:[0-9a-f]{64})\b/i)?.[1];
}

export function parseRemoteDockerImageVersionMetadataOutput(input: {
  stdout: string;
  stderr: string;
}): string | undefined {
  return (
    parseDockerRepoDigestFromInspect(input.stdout) ??
    parseDockerRepoDigestFromInspect(input.stderr)
  );
}

function dockerPullWithStderrCommand(image: string): string {
  return `docker pull ${shellQuote(image)} >&2`;
}

function dockerRepoDigestsInspectCommand(image: string): string {
  return `docker image inspect --format ${shellQuote("{{json .RepoDigests}}")} ${shellQuote(image)}`;
}

function dockerImageIdInspectCommand(image: string): string {
  return `docker image inspect --format ${shellQuote("{{.Id}}")} ${shellQuote(image)}`;
}

export function buildRemoteDockerImageVersionMetadataCommand(image: string): string {
  return [
    dockerPullWithStderrCommand(image),
    [dockerRepoDigestsInspectCommand(image), dockerImageIdInspectCommand(image)].join(" && "),
  ].join(" && ");
}

function requiresRemoteDockerImageDigest(state: DeploymentState): boolean {
  const source = state.runtimePlan.source;
  return source.kind === "docker-image" && (source.version?.isUnknown() ?? true);
}

function isGitHubHttpsLocator(locator: string): boolean {
  try {
    const parsed = new URL(locator);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "github.com";
  } catch {
    return false;
  }
}

function withGitHubAccessToken(locator: string, accessToken: string): string {
  const parsed = new URL(locator);
  parsed.username = "x-access-token";
  parsed.password = accessToken;
  return parsed.toString();
}

function hasUrlCredentials(locator: string): boolean {
  try {
    const parsed = new URL(locator);
    return Boolean(parsed.username || parsed.password);
  } catch {
    return false;
  }
}

function isRemoteGitSourceKind(kind: string): boolean {
  return (
    kind === "remote-git" ||
    kind === "git-public" ||
    kind === "git-github-app" ||
    kind === "git-deploy-key"
  );
}

function isForceRedeployDeployment(state: DeploymentState): boolean {
  return state.triggerKind.value === "force-redeploy";
}

function isLocalWorkspaceSourceKind(kind: string): boolean {
  return kind === "local-folder" || kind === "local-git" || kind === "compose";
}

const localWorkspaceUploadExcludePatterns = [
  ".git",
  ".turbo",
  "node_modules",
  ".svelte-kit",
  ".next/cache",
  "coverage",
] as const;

export function buildLocalWorkspaceUploadTarExcludeArgs(): string[] {
  return localWorkspaceUploadExcludePatterns.flatMap((pattern) => ["--exclude", pattern]);
}

export function buildLocalWorkspaceUploadCommand(input: {
  localWorkdir: string;
  remotePrepareCommand: string;
  sshArgs: readonly string[];
}): string {
  const fallbackTarCommand = [
    "tar",
    "-czf",
    "-",
    ...buildLocalWorkspaceUploadTarExcludeArgs().map((arg) => shellQuote(arg)),
    "-C",
    shellQuote(input.localWorkdir),
    ".",
  ].join(" ");
  const gitAwareTarCommand = [
    "if",
    "git",
    "-C",
    shellQuote(input.localWorkdir),
    "rev-parse",
    "--is-inside-work-tree",
    ">/dev/null",
    "2>&1;",
    "then",
    "{",
    "git",
    "-C",
    shellQuote(input.localWorkdir),
    "ls-files",
    "-z",
    "--cached",
    "--recurse-submodules",
    ";",
    "git",
    "-C",
    shellQuote(input.localWorkdir),
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
    ";",
    "}",
    "|",
    "tar",
    "--null",
    "-czf",
    "-",
    "-C",
    shellQuote(input.localWorkdir),
    "--files-from",
    "-;",
    "else",
    fallbackTarCommand,
    ";",
    "fi",
  ].join(" ");

  return [
    gitAwareTarCommand,
    "|",
    "ssh",
    ...input.sshArgs.map((arg) => shellQuote(arg)),
    shellQuote(input.remotePrepareCommand),
  ].join(" ");
}

function sourceBaseDirectory(metadata?: Record<string, string>): string | undefined {
  const baseDirectory = metadata?.baseDirectory?.replace(/^\/+/, "").replace(/\/+$/, "");
  return baseDirectory ? baseDirectory : undefined;
}

function localSourceWorkdir(root: string, metadata?: Record<string, string>): string {
  const baseDirectory = sourceBaseDirectory(metadata);
  return baseDirectory ? resolve(root, baseDirectory) : root;
}

function remoteSourceWorkdir(root: string, metadata?: Record<string, string>): string {
  const baseDirectory = sourceBaseDirectory(metadata);
  return baseDirectory ? `${root}/${baseDirectory}` : root;
}

const previewArtifactMarkerFileName = ".appaloft-preview-artifact.json";

function previewSourceFingerprintFromMetadata(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return metadata?.["access.sourceFingerprint"] ?? metadata?.["context.sourceFingerprint"];
}

function remotePreviewArtifactMarkerCommand(remoteRoot: string, state: DeploymentState): string {
  const serverBackedState = requireServerBackedDeploymentStateFromState(
    state,
    "ssh preview artifact marker",
  );
  const metadata = state.runtimePlan.execution.metadata ?? {};
  const sourceFingerprint = previewSourceFingerprintFromMetadata(metadata);
  if (!sourceFingerprint) {
    return `mkdir -p ${shellQuote(remoteRoot)}`;
  }

  const marker = {
    schemaVersion: "appaloft.preview-runtime-artifact/v1",
    deploymentId: state.id.value,
    sourceFingerprint,
    projectId: state.projectId.value,
    environmentId: state.environmentId.value,
    resourceId: state.resourceId.value,
    serverId: serverBackedState.serverId.value,
    destinationId: serverBackedState.destinationId.value,
    previewId: metadata["preview.id"],
    previewNumber: metadata["preview.number"],
    previewMode: metadata["preview.mode"],
  };
  const encoded = Buffer.from(JSON.stringify(marker, null, 2), "utf8").toString("base64");

  return [
    `mkdir -p ${shellQuote(remoteRoot)}`,
    `printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(
      `${remoteRoot}/${previewArtifactMarkerFileName}`,
    )}`,
  ].join(" && ");
}

export function buildRemotePreviewArtifactSweepCommand(input: {
  remoteRuntimeRoot: string;
  sourceFingerprint: string;
}): string {
  const deploymentsRoot = `${input.remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments`;
  const sourceFingerprintLabel = `label=appaloft.source-fingerprint=${input.sourceFingerprint}`;
  const markerSweepScript = [
    "fingerprint=$1",
    "shift",
    'for marker in "$@"; do',
    'if grep -Fq "$fingerprint" "$marker"; then',
    'root=$(dirname "$marker")',
    'rm -rf "$root"',
    'printf "preview-workspace:%s\\n" "$root"',
    "fi",
    "done",
  ].join("\n");

  return [
    `containers="$(docker ps -aq --filter ${shellQuote(sourceFingerprintLabel)} 2>/dev/null || true)"; if [ -n "$containers" ]; then printf '%s\\n' "$containers" | xargs -r docker rm -f >/dev/null 2>&1 || true; printf 'preview-containers\\n'; fi`,
    `images="$(docker image ls -q --filter ${shellQuote(sourceFingerprintLabel)} 2>/dev/null | sort -u || true)"; if [ -n "$images" ]; then printf '%s\\n' "$images" | xargs -r docker image rm -f >/dev/null 2>&1 || true; printf 'preview-images\\n'; fi`,
    `if [ -d ${shellQuote(deploymentsRoot)} ]; then find ${shellQuote(
      deploymentsRoot,
    )} -mindepth 2 -maxdepth 2 -name ${shellQuote(
      previewArtifactMarkerFileName,
    )} -type f -exec sh -c ${shellQuote(markerSweepScript)} sh ${shellQuote(
      input.sourceFingerprint,
    )} {} +; fi`,
  ].join(" && ");
}

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

export interface HttpHealthCheckOptions {
  method: string;
  expectedStatusCode: number;
  expectedResponseText?: string;
  intervalMs: number;
  timeoutMs: number;
  retries: number;
  startPeriodMs: number;
  tlsVerification?: "strict" | "allow-untrusted";
}

export type HealthFailureKind = "timeout" | "http-status" | "tls-certificate" | "fetch-error";

type HealthFetchInit = RequestInit & { tls?: { rejectUnauthorized?: boolean } };
export type HealthFetch = (url: string, init: HealthFetchInit) => Promise<Response>;

export type HealthCheckResult =
  | {
      ok: true;
      tlsVerification: "strict" | "untrusted";
      strictTlsFailureReason?: string;
    }
  | {
      ok: false;
      reason: string;
      failureKind: HealthFailureKind;
    };

function httpHealthCheckOptions(
  execution: RuntimeExecutionPlan,
): HttpHealthCheckOptions | null {
  const policy = execution.healthCheck;
  if (policy && !policy.enabled) {
    return null;
  }
  return {
    method: policy?.http?.method.value ?? "GET",
    expectedStatusCode: policy?.http?.expectedStatusCode.value ?? 200,
    ...(policy?.http?.expectedResponseText
      ? { expectedResponseText: policy.http.expectedResponseText.value }
      : {}),
    intervalMs: (policy?.intervalSeconds.value ?? 0.25) * 1000,
    timeoutMs: (policy?.timeoutSeconds.value ?? 5) * 1000,
    retries: policy?.retries.value ?? 40,
    startPeriodMs: (policy?.startPeriodSeconds.value ?? 0) * 1000,
  };
}

function classifyHealthFailureReason(reason: string): HealthFailureKind {
  const normalized = reason.toLowerCase();
  if (normalized.includes("abort")) {
    return "timeout";
  }
  if (
    normalized.includes("certificate") ||
    normalized.includes("self-signed") ||
    normalized.includes("local issuer") ||
    normalized.includes("unable to verify") ||
    normalized.includes("cert_")
  ) {
    return "tls-certificate";
  }
  return "fetch-error";
}

async function fetchHealthOnce(input: {
  url: string;
  options: HttpHealthCheckOptions;
  signal: AbortSignal;
  fetchImpl: HealthFetch;
  rejectUnauthorized?: boolean;
}): Promise<HealthCheckResult> {
  try {
    const response = await input.fetchImpl(input.url, {
      method: input.options.method,
      signal: input.signal,
      ...(input.rejectUnauthorized === false
        ? { tls: { rejectUnauthorized: false } }
        : {}),
    });
    const responseText = input.options.expectedResponseText ? await response.text() : "";
    if (
      response.status === input.options.expectedStatusCode &&
      (!input.options.expectedResponseText ||
        responseText.includes(input.options.expectedResponseText))
    ) {
      return {
        ok: true,
        tlsVerification: input.rejectUnauthorized === false ? "untrusted" : "strict",
      };
    }
    return {
      ok: false,
      failureKind: "http-status",
      reason: `last response was HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown fetch error";
    return {
      ok: false,
      failureKind: classifyHealthFailureReason(reason),
      reason,
    };
  }
}

export async function waitForHealth(
  url: string,
  options: HttpHealthCheckOptions,
  input: { fetchImpl?: HealthFetch } = {},
): Promise<HealthCheckResult> {
  let lastFailure = "health check timed out";
  let lastFailureKind: HealthFailureKind = "timeout";
  const fetchImpl: HealthFetch = input.fetchImpl ?? ((target, init) => fetch(target, init));

  if (options.startPeriodMs > 0) {
    await Bun.sleep(options.startPeriodMs);
  }

  for (let attempt = 0; attempt < options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const strictHealth = await fetchHealthOnce({
        url,
        options,
        signal: controller.signal,
        fetchImpl,
      });
      if (strictHealth.ok) {
        return strictHealth;
      }

      if (
        options.tlsVerification === "allow-untrusted" &&
        strictHealth.failureKind === "tls-certificate"
      ) {
        const untrustedTlsHealth = await fetchHealthOnce({
          url,
          options,
          signal: controller.signal,
          fetchImpl,
          rejectUnauthorized: false,
        });
        if (untrustedTlsHealth.ok) {
          return {
            ...untrustedTlsHealth,
            strictTlsFailureReason: strictHealth.reason,
          };
        }
        lastFailure = `${strictHealth.reason}; untrusted TLS retry failed: ${untrustedTlsHealth.reason}`;
        lastFailureKind = untrustedTlsHealth.failureKind;
      } else {
        lastFailure = strictHealth.reason;
        lastFailureKind = strictHealth.failureKind;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "unknown fetch error";
      lastFailureKind = classifyHealthFailureReason(lastFailure);
    } finally {
      clearTimeout(timeout);
    }

    await Bun.sleep(options.intervalMs);
  }

  return { ok: false, reason: lastFailure, failureKind: lastFailureKind };
}

function normalizeHealthCheckPath(path: string | undefined): string {
  if (!path || path === "/") {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function joinRouteAndHealthPath(pathPrefix: string, healthPath: string): string {
  const normalizedPrefix = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/, "");
  const normalizedHealthPath = normalizeHealthCheckPath(healthPath);

  if (!normalizedPrefix) {
    return normalizedHealthPath;
  }

  return normalizedHealthPath === "/" ? normalizedPrefix : `${normalizedPrefix}${normalizedHealthPath}`;
}

function publicHealthUrl(input: {
  route: AccessRoute;
  healthPath: string;
  publicHost: string;
  port: number;
}): string {
  if (input.route.proxyKind === "none") {
    const path = joinRouteAndHealthPath(input.route.pathPrefix, input.healthPath);
    return `http://${input.publicHost}:${input.route.targetPort ?? input.port}${path}`;
  }

  const scheme = input.route.tlsMode === "auto" ? "https" : "http";
  const domain = input.route.domains[0] ?? "localhost";
  const path = joinRouteAndHealthPath(input.route.pathPrefix, input.healthPath);

  return `${scheme}://${domain}${path}`;
}

function publicRouteHealthErrorCode(result: Extract<HealthCheckResult, { ok: false }>): string {
  if (result.failureKind === "tls-certificate") {
    return "ssh_public_route_tls_certificate_untrusted";
  }
  if (result.failureKind === "timeout") {
    return "ssh_public_route_health_check_timeout";
  }
  return "ssh_public_route_health_check_failed";
}

function defaultVerificationSteps(accessRoutes: AccessRoute[]): Array<RuntimeVerificationStep["kind"]> {
  return accessRoutes.length > 0 ? ["internal-http", "public-http"] : ["internal-http"];
}

export function dockerContainerNetworkIpCommand(input: {
  containerName: string;
  networkName: string;
}): string {
  const format = `{{with index .NetworkSettings.Networks ${JSON.stringify(input.networkName)}}}{{.IPAddress}}{{end}}`;
  return `docker inspect --format ${shellQuote(format)} ${shellQuote(input.containerName)}`;
}

export function parseDockerContainerNetworkIp(output: string): string | undefined {
  const ip = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!ip) {
    return undefined;
  }
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[a-f0-9:]+$/i.test(ip) ? ip : undefined;
}

function remoteInternalHealthCheckCommand(url: string, options: HttpHealthCheckOptions): string {
  const timeoutSeconds = Math.max(1, Math.ceil(options.timeoutMs / 1000));
  const curlScript = [
    "command -v curl >/dev/null 2>&1",
    "body_file=$(mktemp)",
    'trap \'rm -f "$body_file"\' EXIT',
    [
      "code=$(curl",
      `--request ${shellQuote(options.method)}`,
      "--silent --show-error",
      `--max-time ${timeoutSeconds}`,
      '--output "$body_file"',
      '--write-out "%{http_code}"',
      shellQuote(url),
      ")",
    ].join(" "),
    `test "$code" = ${shellQuote(String(options.expectedStatusCode))}`,
    ...(options.expectedResponseText
      ? [`grep -F -- ${shellQuote(options.expectedResponseText)} "$body_file" >/dev/null`]
      : []),
  ].join(" && ");
  const wgetFallback =
    options.method === "GET" &&
    options.expectedStatusCode === 200 &&
    !options.expectedResponseText
      ? ` || (command -v wget >/dev/null 2>&1 && wget -q --timeout=${timeoutSeconds} --tries=1 -O /dev/null ${shellQuote(url)})`
      : "";

  return `(sh -lc ${shellQuote(curlScript)})${wgetFallback}`;
}

async function runProcess(input: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}> {
  const result = await runBufferedProcess({
    command: [input.command, ...input.args],
    cwd: input.cwd,
    env: input.env,
    ...(input.redactions ? { redactions: input.redactions } : {}),
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

async function runShell(input: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  redactions?: readonly string[];
}): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  failed: boolean;
  reason?: string;
}> {
  const result = await runBufferedProcess({
    command: shellCommand(input.command),
    cwd: input.cwd,
    env: input.env,
    ...(input.redactions ? { redactions: input.redactions } : {}),
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
    failed: result.failed,
    ...(result.reason ? { reason: result.reason } : {}),
  };
}

function supersededDeploymentIdsForCleanup(input: {
  supersedesDeploymentId?: { value: string };
}): string[] {
  return input.supersedesDeploymentId ? [input.supersedesDeploymentId.value] : [];
}

function parseOptionalPort(value: string | undefined): number | undefined {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : undefined;
}

function positiveIntegerEnvMs(
  env: NodeJS.ProcessEnv,
  key: string,
  fallbackMs: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) {
    return fallbackMs;
  }

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallbackMs;
}

interface SshTarget {
  host: string;
  publicHost: string;
  port: string;
  identityFile?: string;
}

interface PreparedSshSource {
  kind: "workspace" | "image";
  metadata: Record<string, string>;
  remoteWorkdir?: string;
  image?: string;
}

export class SshExecutionBackend implements ExecutionBackend {
  constructor(
    private readonly runtimeRoot: string,
    private readonly logger: AppLogger,
    private readonly progressRecorder: DeploymentProgressRecorder,
    private readonly progressReporter: DeploymentProgressReporter,
    private readonly integrationAuthPort?: IntegrationAuthPort,
    private readonly serverRepository?: ServerRepository,
    private readonly edgeProxyProviderRegistry?: EdgeProxyProviderRegistry,
    private readonly remoteRuntimeRoot = "/var/lib/appaloft/runtime",
    private readonly resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined,
    private readonly deploymentExecutionGuard?: DeploymentExecutionGuard,
    private readonly dependencyResourceSecretStore?: DependencyResourceSecretStore,
  ) {}

  private async report(
    context: ExecutionContext,
    input: {
      deploymentId: string;
      phase: LogPhase;
      message: string;
      level?: LogLevel;
      source?: LogSource;
      status?: "running" | "succeeded" | "failed";
      stream?: "stdout" | "stderr";
    },
  ): Promise<void> {
    const event = createDeploymentProgressEvent({
      deploymentId: input.deploymentId,
      phase: input.phase,
      message: input.message,
      ...(input.level ? { level: input.level } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stream ? { stream: input.stream } : {}),
      step: deploymentProgressSteps[input.phase],
    });
    try {
      const result = await this.progressRecorder.record(context, event);
      if (result.isErr()) {
        this.logger.warn("Failed to persist deployment progress event", {
          deploymentId: input.deploymentId,
          phase: input.phase,
          errorCode: result.error.code,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to persist deployment progress event", {
        deploymentId: input.deploymentId,
        phase: input.phase,
        error,
      });
    }
    this.progressReporter.report(context, event);
  }

  private runtimeDirectory(deploymentId: string): string {
    return resolve(this.runtimeRoot, "ssh-deployments", deploymentId);
  }

  private remoteRuntimeDirectory(deploymentId: string): string {
    return `${this.remoteRuntimeRoot.replace(/\/+$/, "")}/ssh-deployments/${sanitizeName(deploymentId)}`;
  }

  private pushCommandOutput(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      output: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      redactions?: readonly string[];
      source?: LogSource;
    },
  ): void {
    for (const line of redactSecrets(input.output, input.redactions)
      .split(/\r?\n/)
      .map((outputLine) => outputLine.trim())
      .filter((outputLine) => outputLine.length > 0)
      .slice(0, 50)) {
      const level = classifyOutputLogLevel(line, input.level);
      void this.report(input.context, {
        deploymentId: input.deploymentId,
        phase: input.phase,
        source: input.source ?? "application",
        level,
        message: line,
        stream: input.stream,
      });
      timeline.push(phaseLog(input.phase, line, level, input.source ?? "application"));
    }
  }

  private pushStreamingCommandOutput(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      line: string;
      level: LogLevel;
      stream: "stdout" | "stderr";
      persistedCount: number;
      source?: LogSource;
    },
  ): number {
    if (input.persistedCount >= 50) {
      return input.persistedCount;
    }

    void this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: input.phase,
      source: input.source ?? "application",
      level: input.level,
      message: input.line,
      stream: input.stream,
    });
    timeline.push(phaseLog(input.phase, input.line, input.level, input.source ?? "application"));
    return input.persistedCount + 1;
  }

  private async ensureExecutionStillOwned(
    context: ExecutionContext,
    deployment: Deployment,
    input: { step: string },
  ): Promise<Result<void>> {
    if (!this.deploymentExecutionGuard) {
      return ok(undefined);
    }

    const decision = await this.deploymentExecutionGuard.shouldContinue(context, deployment);
    if (decision.isErr()) {
      return decision.map(() => undefined);
    }

    if (decision.value.allowed) {
      return ok(undefined);
    }

    return err(
      domainError.conflict("Deployment execution was superseded by a newer deployment", {
        phase: "runtime-execution",
        step: input.step,
        deploymentId: deployment.toState().id.value,
        ...(decision.value.supersededByDeploymentId
          ? { supersededByDeploymentId: decision.value.supersededByDeploymentId }
          : {}),
        causeCode: "deployment_execution_superseded",
      }),
    );
  }

  private createStreamingOutputSink(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      phase: LogPhase;
      source?: LogSource;
    },
  ): (line: string, level: LogLevel, stream: "stdout" | "stderr") => void {
    let stdoutCount = 0;
    let stderrCount = 0;

    return (line, level, stream) => {
      if (stream === "stdout") {
        stdoutCount = this.pushStreamingCommandOutput(timeline, {
          context: input.context,
          deploymentId: input.deploymentId,
          phase: input.phase,
          line,
          level,
          stream,
          persistedCount: stdoutCount,
          ...(input.source ? { source: input.source } : {}),
        });
        return;
      }

      stderrCount = this.pushStreamingCommandOutput(timeline, {
        context: input.context,
        deploymentId: input.deploymentId,
        phase: input.phase,
        line,
        level,
        stream,
        persistedCount: stderrCount,
        ...(input.source ? { source: input.source } : {}),
      });
    };
  }

  private applyFailure(
    deployment: Deployment,
    input: {
      timeline: DeploymentTimelineJournalEntry[];
      errorCode: string;
      retryable?: boolean;
      metadata?: Record<string, string>;
    },
  ): Deployment {
    const failureFields = runtimeTargetCapacityAwareFailureFields({
      timeline: input.timeline,
      errorCode: input.errorCode,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      serverId: requireServerBackedDeploymentState(
        deployment,
        "ssh execution capacity-aware failure fields",
      ).serverId.value,
    });
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(1),
        status: ExecutionStatusValue.rehydrate("failed"),
        timeline: input.timeline,
        retryable: input.retryable ?? false,
        errorCode: ErrorCodeText.rehydrate(failureFields.errorCode),
        ...(failureFields.metadata ? { metadata: failureFields.metadata } : {}),
      }),
    );
    return deployment;
  }

  private async pushRemoteDockerContainerDiagnostics(
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      context: ExecutionContext;
      deploymentId: string;
      target: SshTarget;
      runtimeDir: string;
      env: NodeJS.ProcessEnv;
      containerName: string;
    },
  ): Promise<void> {
    const format =
      "status={{.State.Status}} exitCode={{.State.ExitCode}} error={{.State.Error}} oomKilled={{.State.OOMKilled}} finishedAt={{.State.FinishedAt}}";
    const inspectMessage = `Inspect SSH Docker container ${input.containerName}`;
    timeline.push(phaseLog("verify", inspectMessage));
    await this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: inspectMessage,
    });

    const inspect = await this.runRemoteCommand({
      target: input.target,
      command: `docker inspect --format ${shellQuote(format)} ${shellQuote(input.containerName)}`,
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stdout,
      level: inspect.failed ? "warn" : "info",
      stream: "stdout",
      source: "docker",
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: inspect.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
    });

    const logsMessage = `Capture SSH Docker logs for ${input.containerName}`;
    timeline.push(phaseLog("verify", logsMessage));
    await this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "verify",
      status: "running",
      message: logsMessage,
    });

    const dockerLogs = await this.runRemoteCommand({
      target: input.target,
      command: `docker logs --tail 50 ${shellQuote(input.containerName)}`,
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stdout,
      level: "info",
      stream: "stdout",
    });
    this.pushCommandOutput(timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "verify",
      output: dockerLogs.stderr,
      level: dockerLogs.failed ? "warn" : "info",
      stream: "stderr",
    });

    if (inspect.failed && !inspect.stdout && !inspect.stderr) {
      timeline.push(
        phaseLog(
          "verify",
          `SSH Docker inspect did not return diagnostics for ${input.containerName}`,
          "warn",
        ),
      );
    }

    if (dockerLogs.failed && !dockerLogs.stdout && !dockerLogs.stderr) {
      timeline.push(
        phaseLog(
          "verify",
          `SSH Docker logs did not return application output for ${input.containerName}`,
          "warn",
        ),
      );
    }
  }

  private writePrivateKey(runtimeDir: string, privateKey: string): string {
    const sshDir = resolve(runtimeDir, "ssh");
    const identityFile = resolve(sshDir, "id_deployment_target");
    mkdirSync(sshDir, { recursive: true });
    writeFileSync(identityFile, privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`, {
      mode: 0o600,
    });
    chmodSync(identityFile, 0o600);
    return identityFile;
  }

  private cleanupPrivateKey(target: SshTarget): void {
    if (target.identityFile) {
      rmSync(dirname(target.identityFile), { recursive: true, force: true });
    }
  }

  private async targetFor(
    context: ExecutionContext,
    deployment: Deployment,
    runtimeDir: string,
  ): Promise<Result<SshTarget>> {
    const state = deployment.toState();
    const planTarget = state.runtimePlan.target;
    const metadata = planTarget.metadata ?? {};
    let host = metadata.serverHost;
    let port = metadata.serverPort ?? "22";
    let username: string | undefined;
    let identityFile: string | undefined;

    const serverId = planTarget.serverIds[0];
    if (this.serverRepository && serverId) {
      const server = await this.serverRepository.findOne(
        toRepositoryContext(context),
        DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(serverId)),
      );
      const serverState = server?.toState();

      if (serverState) {
        host = serverState.host.value;
        port = String(serverState.port.value);
        username = serverState.credential?.username?.value;
        if (
          serverState.credential?.kind.value === "ssh-private-key" &&
          serverState.credential.privateKey
        ) {
          identityFile = this.writePrivateKey(runtimeDir, serverState.credential.privateKey.value);
        }
      }
    }

    if (!host) {
      return err(domainError.validation("SSH deployment target is missing server host metadata"));
    }

    return ok({
      host: hostWithUsername(host, username),
      publicHost: host,
      port,
      ...(identityFile ? { identityFile } : {}),
    });
  }

  private sshArgs(target: SshTarget): string[] {
    return [
      "-p",
      target.port,
      ...(target.identityFile
        ? ["-i", target.identityFile, "-o", "IdentitiesOnly=yes"]
        : []),
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=20",
      target.host,
    ];
  }

  private async runRemoteCommand(input: {
    target: SshTarget;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    redactions?: readonly string[];
  }) {
    return await runProcess({
      command: "ssh",
      args: [...this.sshArgs(input.target), input.command],
      cwd: input.cwd,
      env: input.env,
      ...(input.redactions ? { redactions: input.redactions } : {}),
    });
  }

  private async runRemoteCommandStreaming(input: {
    target: SshTarget;
    command: string;
    cwd: string;
    env: NodeJS.ProcessEnv;
    redactions?: readonly string[];
    timeoutMs?: number;
    timeoutMessage?: string;
    onOutput(line: string, level: LogLevel, stream: "stdout" | "stderr"): void;
  }) {
    return await runStreamingProcess({
      command: "ssh",
      args: [...this.sshArgs(input.target), input.command],
      cwd: input.cwd,
      env: input.env,
      ...(input.redactions ? { redactions: input.redactions } : {}),
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.timeoutMessage ? { timeoutMessage: input.timeoutMessage } : {}),
      onOutput: input.onOutput,
    });
  }

  private async resolveRemoteDockerImageVersionMetadata(input: {
    context: ExecutionContext;
    deploymentId: string;
    state: DeploymentState;
    target: SshTarget;
    runtimeDir: string;
    env: NodeJS.ProcessEnv;
    redactions: readonly string[];
    image: string;
    timeline: DeploymentTimelineJournalEntry[];
  }): Promise<
    | { status: "not-required"; metadata: Record<string, string> }
    | { status: "resolved"; metadata: Record<string, string> }
    | { status: "failed"; message: string; retryable: boolean }
  > {
    if (!requiresRemoteDockerImageDigest(input.state) && !isForceRedeployDeployment(input.state)) {
      return { status: "not-required", metadata: {} };
    }

    const message = `Pull and resolve SSH Docker image digest for ${input.image}`;
    input.timeline.push(phaseLog("deploy", message));
    await this.report(input.context, {
      deploymentId: input.deploymentId,
      phase: "deploy",
      status: "running",
      message,
    });

    const inspect = await this.runRemoteCommand({
      target: input.target,
      command: buildRemoteDockerImageVersionMetadataCommand(input.image),
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(input.timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "deploy",
      output: inspect.stdout,
      level: inspect.failed ? "warn" : "info",
      stream: "stdout",
      source: "docker",
      redactions: input.redactions,
    });
    this.pushCommandOutput(input.timeline, {
      context: input.context,
      deploymentId: input.deploymentId,
      phase: "deploy",
      output: inspect.stderr,
      level: "warn",
      stream: "stderr",
      source: "docker",
      redactions: input.redactions,
    });

    if (inspect.failed) {
      return {
        status: "failed",
        message: `SSH Docker image digest could not be resolved for ${input.image}`,
        retryable: true,
      };
    }

    const digest = parseRemoteDockerImageVersionMetadataOutput({
      stdout: inspect.stdout,
      stderr: inspect.stderr,
    });
    if (!digest) {
      return {
        status: "failed",
        message: `SSH Docker image digest was not available for ${input.image}`,
        retryable: false,
      };
    }

    input.timeline.push(phaseLog("deploy", `Resolved SSH Docker image digest ${digest}`));
    return {
      status: "resolved",
      metadata: {
        imageDigest: digest,
        sourceVersion: digest,
        sourceVersionKind: "image-digest",
      },
    };
  }

  private async waitForRemoteInternalHealth(input: {
    target: SshTarget;
    url: string;
    options: HttpHealthCheckOptions;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): Promise<{ ok: boolean; reason?: string; stdout: string; stderr: string }> {
    let lastFailure = "health check timed out";
    let lastStdout = "";
    let lastStderr = "";

    if (input.options.startPeriodMs > 0) {
      await Bun.sleep(input.options.startPeriodMs);
    }

    for (let attempt = 0; attempt < input.options.retries; attempt += 1) {
      const result = await this.runRemoteCommand({
        target: input.target,
        command: remoteInternalHealthCheckCommand(input.url, input.options),
        cwd: input.cwd,
        env: input.env,
      });
      lastStdout = result.stdout;
      lastStderr = result.stderr;

      if (!result.failed) {
        return { ok: true, stdout: result.stdout, stderr: result.stderr };
      }

      lastFailure =
        result.stderr.trim() ||
        result.stdout.trim() ||
        result.reason ||
        `remote command exited with ${result.exitCode}`;

      if (attempt < input.options.retries - 1) {
        await Bun.sleep(input.options.intervalMs);
      }
    }

    return {
      ok: false,
      reason: lastFailure,
      stdout: lastStdout,
      stderr: lastStderr,
    };
  }

  private async prepareSshSource(
    context: ExecutionContext,
    deployment: Deployment,
    timeline: DeploymentTimelineJournalEntry[],
    input: {
      runtimeDir: string;
      remoteRoot: string;
      target: SshTarget;
      env: NodeJS.ProcessEnv;
    },
  ): Promise<
    | { prepared: true; source: PreparedSshSource }
    | { prepared: false; deployment: Deployment }
  > {
    const state = deployment.toState();
    const source = state.runtimePlan.source;

    if (state.runtimePlan.buildStrategy === "prebuilt-image" || source.kind === "docker-image") {
      return {
        prepared: true,
        source: {
          kind: "image",
          image: state.runtimePlan.execution.image ?? normalizeDockerImage(source.locator),
          metadata: {
            sourceStrategy: "prebuilt-image",
          },
        },
      };
    }

    const remoteSourceRoot = `${input.remoteRoot}/source`;
    const remoteWorkdir = remoteSourceWorkdir(remoteSourceRoot, source.metadata);
    const previewArtifactMarkerCommand = remotePreviewArtifactMarkerCommand(input.remoteRoot, state);

    if (isRemoteGitSourceKind(source.kind)) {
      if (source.kind === "git-public" && hasUrlCredentials(source.locator)) {
        const message = "Public git source cannot include embedded credentials";
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "git_public_credentials_not_allowed",
            retryable: false,
            metadata: {
              source: source.locator,
            },
          }),
        };
      }

      let cloneLocator = source.locator;
      const redactions: string[] = [];
      let setupCommand = "";
      let cloneEnv = "";
      let tokenizedGithubHttpsPrefix: string | undefined;

      if (source.kind === "git-github-app") {
        if (!isGitHubHttpsLocator(source.locator)) {
          const message = "GitHub App source requires a GitHub HTTPS repository URL";
          timeline.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              timeline,
              errorCode: "github_app_source_requires_github_https",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        const accessToken = await this.integrationAuthPort?.getProviderAccessToken(
          context,
          "github",
        );
        if (!accessToken) {
          const message = "GitHub App source requires a connected GitHub access token";
          timeline.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              timeline,
              errorCode: "github_app_access_token_missing",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        cloneLocator = withGitHubAccessToken(source.locator, accessToken);
        tokenizedGithubHttpsPrefix = withGitHubAccessToken(
          githubHttpsSubmodulePrefix,
          accessToken,
        );
        redactions.push(accessToken, cloneLocator, tokenizedGithubHttpsPrefix);
      }

      if (source.kind === "git-deploy-key") {
        const deployKeyPath = source.metadata?.deployKeyPath;
        if (!deployKeyPath) {
          const message = "Deploy key source requires deployKeyPath metadata";
          timeline.push(phaseLog("package", message, "error"));
          return {
            prepared: false,
            deployment: this.applyFailure(deployment, {
              timeline,
              errorCode: "git_deploy_key_missing",
              retryable: false,
              metadata: {
                source: source.locator,
              },
            }),
          };
        }

        const deployKeyPrivateKey = readFileSync(deployKeyPath, "utf8");
        const remoteDeployKeyPath = `${input.remoteRoot}/.ssh/git_deploy_key`;
        const normalizedKey = deployKeyPrivateKey.endsWith("\n")
          ? deployKeyPrivateKey
          : `${deployKeyPrivateKey}\n`;
        const encodedKey = Buffer.from(normalizedKey, "utf8").toString("base64");
        setupCommand = [
          `mkdir -p ${shellQuote(`${input.remoteRoot}/.ssh`)}`,
          `install -m 600 /dev/null ${shellQuote(remoteDeployKeyPath)}`,
          `printf %s ${shellQuote(encodedKey)} | base64 -d > ${shellQuote(remoteDeployKeyPath)}`,
          `chmod 600 ${shellQuote(remoteDeployKeyPath)}`,
        ].join(" && ");
        cloneEnv = `GIT_SSH_COMMAND=${shellQuote(
          `ssh -i ${remoteDeployKeyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`,
        )}`;
        redactions.push(deployKeyPrivateKey, normalizedKey, encodedKey);
      }

      timeline.push(
        phaseLog("package", `Clone git source on ${input.target.host}:${remoteSourceRoot}`),
      );
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Clone git source ${source.displayName} on target`,
      });
      const branchOption = source.metadata?.gitRef
        ? `--branch ${shellQuote(source.metadata.gitRef)} `
        : "";
      const cloneCommand = [
        previewArtifactMarkerCommand,
        `rm -rf ${shellQuote(remoteSourceRoot)}`,
        `mkdir -p ${shellQuote(remoteSourceRoot)}`,
        ...(setupCommand ? [setupCommand] : []),
        `${cloneEnv} git clone --depth 1 ${branchOption}${shellQuote(cloneLocator)} ${shellQuote(remoteSourceRoot)}`.trim(),
      ].join(" && ");
      let cloneStdoutCount = 0;
      let cloneStderrCount = 0;
      const clone = await this.runRemoteCommandStreaming({
        target: input.target,
        command: cloneCommand,
        cwd: input.runtimeDir,
        env: input.env,
        redactions,
        onOutput: (line, level, stream) => {
          if (stream === "stdout") {
            cloneStdoutCount = this.pushStreamingCommandOutput(timeline, {
              context,
              deploymentId: state.id.value,
              phase: "package",
              line,
              level,
              stream,
              persistedCount: cloneStdoutCount,
            });
            return;
          }

          cloneStderrCount = this.pushStreamingCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "package",
            line,
            level,
            stream,
            persistedCount: cloneStderrCount,
          });
        },
      });

      if (clone.failed) {
        const message = clone.reason
          ? `Remote git clone failed: ${clone.reason}`
          : `Remote git clone failed with exit code ${clone.exitCode}`;
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "remote_git_clone_failed",
            retryable: true,
            metadata: {
              source: source.locator,
              remoteWorkdir: remoteSourceRoot,
            },
          }),
        };
      }

      const submoduleArgs = gitSubmoduleUpdateArgs({
        workdir: remoteSourceRoot,
        tokenizedGithubHttpsPrefix,
      });
      timeline.push(phaseLog("package", `Initialize git submodules on ${input.target.host}`));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: "Initialize git submodules on target",
      });
      let submoduleStdoutCount = 0;
      let submoduleStderrCount = 0;
      const submodule = await this.runRemoteCommandStreaming({
        target: input.target,
        command: `${cloneEnv} git ${submoduleArgs.map((arg) => shellQuote(arg)).join(" ")}`.trim(),
        cwd: input.runtimeDir,
        env: input.env,
        redactions,
        onOutput: (line, level, stream) => {
          if (stream === "stdout") {
            submoduleStdoutCount = this.pushStreamingCommandOutput(timeline, {
              context,
              deploymentId: state.id.value,
              phase: "package",
              line,
              level,
              stream,
              persistedCount: submoduleStdoutCount,
            });
            return;
          }

          submoduleStderrCount = this.pushStreamingCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "package",
            line,
            level,
            stream,
            persistedCount: submoduleStderrCount,
          });
        },
      });

      if (submodule.failed) {
        const message = submodule.reason
          ? `Remote git submodule update failed: ${submodule.reason}`
          : `Remote git submodule update failed with exit code ${submodule.exitCode}`;
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "remote_git_submodule_update_failed",
            retryable: true,
            metadata: {
              source: source.locator,
              remoteWorkdir: remoteSourceRoot,
            },
          }),
        };
      }

      const commit = await this.runRemoteCommand({
        target: input.target,
        command: `git -C ${shellQuote(remoteSourceRoot)} rev-parse --verify HEAD`,
        cwd: input.runtimeDir,
        env: input.env,
      });
      const commitSha = parseResolvedGitCommitSha(commit.stdout);

      if (commit.failed || !commitSha) {
        const message = commit.failed
          ? commit.reason
            ? `Remote git commit resolution failed: ${commit.reason}`
            : `Remote git commit resolution failed with exit code ${commit.exitCode}`
          : "Remote git commit resolution returned an invalid object id";
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "remote_git_commit_resolution_failed",
            retryable: true,
            metadata: {
              phase: "package",
              source: source.locator,
              remoteWorkdir: remoteSourceRoot,
            },
          }),
        };
      }

      const commitMessage = `Resolved git commit ${shortGitCommitSha(commitSha)}`;
      timeline.push(phaseLog("package", commitMessage));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: commitMessage,
      });

      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: `Target git source workspace is ready at ${shortGitCommitSha(commitSha)}`,
      });

      return {
        prepared: true,
        source: {
          kind: "workspace",
          remoteWorkdir,
          metadata: {
            sourceStrategy: source.kind,
            remoteWorkdir,
            [sourceCommitShaMetadataKey]: commitSha,
            ...(source.metadata?.gitRef ? { gitRef: source.metadata.gitRef } : {}),
            ...(source.metadata?.baseDirectory
              ? { baseDirectory: source.metadata.baseDirectory }
              : {}),
          },
        },
      };
    }

    if (source.kind === "dockerfile-inline" || source.kind === "docker-compose-inline") {
      const content = source.metadata?.content;
      if (!content) {
        const message = `${source.kind} source requires inline content metadata`;
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "inline_source_content_missing",
            retryable: false,
            metadata: {
              source: source.locator,
              sourceKind: source.kind,
            },
          }),
        };
      }

      const targetFile =
        source.kind === "dockerfile-inline"
          ? (source.metadata?.dockerfilePath ?? "Dockerfile")
          : (source.metadata?.composeFilePath ?? "docker-compose.yml");
      const remoteTargetFile = `${remoteSourceRoot}/${targetFile}`;
      timeline.push(phaseLog("package", `Write ${source.kind} source to ${remoteTargetFile}`));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "running",
        message: `Write ${source.kind} source on target`,
      });
      const writeInlineSource = await this.runRemoteCommand({
        target: input.target,
        command: [
          previewArtifactMarkerCommand,
          `rm -rf ${shellQuote(remoteSourceRoot)}`,
          `mkdir -p ${shellQuote(remoteSourceRoot)}`,
          `mkdir -p "$(dirname ${shellQuote(remoteTargetFile)})"`,
          `printf %s ${shellQuote(
            Buffer.from(content.endsWith("\n") ? content : `${content}\n`, "utf8").toString(
              "base64",
            ),
          )} | base64 -d > ${shellQuote(remoteTargetFile)}`,
        ].join(" && "),
        cwd: input.runtimeDir,
        env: input.env,
      });

      if (writeInlineSource.failed) {
        const message = writeInlineSource.reason
          ? `Inline source write failed: ${writeInlineSource.reason}`
          : `Inline source write failed with exit code ${writeInlineSource.exitCode}`;
        timeline.push(phaseLog("package", message, "error"));
        return {
          prepared: false,
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "inline_source_write_failed",
            retryable: true,
            metadata: {
            remoteWorkdir: remoteSourceRoot,
              remoteTargetFile,
            },
          }),
        };
      }

      await this.report(context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "Target inline source workspace is ready",
      });

      return {
        prepared: true,
        source: {
          kind: "workspace",
          remoteWorkdir,
          metadata: {
            sourceStrategy: source.kind,
            remoteWorkdir,
            remoteTargetFile,
          },
        },
      };
    }

    if (!isLocalWorkspaceSourceKind(source.kind)) {
      const message = `SSH source kind is not supported: ${source.kind}`;
      timeline.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "ssh_source_kind_unsupported",
          retryable: false,
          metadata: {
            source: source.locator,
            sourceKind: source.kind,
          },
        }),
      };
    }

    const localWorkdir = localSourceWorkdir(
      normalizeWorkingDirectory(state.runtimePlan.execution.workingDirectory ?? source.locator),
      source.metadata,
    );

    if (!existsSync(localWorkdir)) {
      const message = `Source working directory does not exist: ${localWorkdir}`;
      timeline.push(phaseLog("package", message, "error"));
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "source_workdir_missing",
          retryable: false,
          metadata: {
            localWorkdir,
          },
        }),
      };
    }

    timeline.push(
      phaseLog("package", `Upload source workspace to ${input.target.host}:${remoteWorkdir}`),
    );
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "running",
      message: "Upload source workspace over SSH",
    });
    const remotePrepareCommand = `${previewArtifactMarkerCommand} && rm -rf ${shellQuote(
      remoteWorkdir,
    )} && mkdir -p ${shellQuote(remoteWorkdir)} && tar -xzf - -C ${shellQuote(remoteWorkdir)}`;
    const uploadCommand = buildLocalWorkspaceUploadCommand({
      localWorkdir,
      remotePrepareCommand,
      sshArgs: this.sshArgs(input.target),
    });
    const upload = await runShell({
      command: uploadCommand,
      cwd: input.runtimeDir,
      env: input.env,
    });
    this.pushCommandOutput(timeline, {
      context,
      deploymentId: state.id.value,
      phase: "package",
      output: upload.stderr,
      level: "warn",
      stream: "stderr",
    });

    if (upload.failed) {
      const message = upload.reason
        ? `Source upload failed: ${upload.reason}`
        : `Source upload failed with exit code ${upload.exitCode}`;
      timeline.push(phaseLog("package", message, "error"));
      await this.runRemoteCommand({
        target: input.target,
        command: `rm -rf ${shellQuote(remoteWorkdir)}`,
        cwd: input.runtimeDir,
        env: input.env,
      });
      return {
        prepared: false,
        deployment: this.applyFailure(deployment, {
          timeline,
          errorCode: "ssh_source_upload_failed",
          retryable: true,
          metadata: {
            localWorkdir,
            remoteWorkdir,
          },
        }),
      };
    }

    await this.report(context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Remote source workspace is ready",
    });

    return {
      prepared: true,
      source: {
        kind: "workspace",
        remoteWorkdir,
        metadata: {
          sourceStrategy: source.kind === "remote-git" ? "remote-git" : "local-workspace",
          remoteWorkdir,
          ...(source.metadata?.baseDirectory
            ? { baseDirectory: source.metadata.baseDirectory }
            : {}),
        },
      },
    };
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();

    if (state.runtimePlan.execution.kind === "docker-compose-stack") {
      return this.executeDockerCompose(context, deployment);
    }

    if (state.runtimePlan.execution.kind !== "docker-container") {
      return err(
        domainError.validation(
          `SSH execution currently supports docker-container plans only, got ${state.runtimePlan.execution.kind}`,
        ),
      );
    }

    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }
    const target = targetResult._unsafeUnwrap();
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);

    const port = state.runtimePlan.execution.port ?? 3000;
    const packageEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      port,
      includeDependencyRuntimeSecrets: false,
    });
    if (packageEnv.isErr()) {
      return err(packageEnv.error);
    }
    const { env, redactions } = packageEnv.value;
    const timeline: DeploymentTimelineJournalEntry[] = [
      phaseLog("plan", `Using SSH docker-container execution on ${target.host}:${target.port}`),
    ];

    try {
      const prepared = await this.prepareSshSource(context, deployment, timeline, {
        runtimeDir,
        remoteRoot,
        target,
        env,
      });

      if (!prepared.prepared) {
        return ok({ deployment: prepared.deployment });
      }

      const dockerVersion = await this.runRemoteCommand({
        target,
        command: "docker version --format '{{.Server.Version}}'",
        cwd: runtimeDir,
        env,
        redactions,
      });

      if (dockerVersion.failed) {
        const message = "Docker is not available on the SSH target";
        timeline.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const runtimeInstanceNames = deriveRuntimeInstanceNames({
        deploymentId: state.id.value,
        metadata: state.runtimePlan.execution.metadata,
      });
      let image = prepared.source.image ?? state.runtimePlan.execution.image;
      const containerName = runtimeInstanceNames.containerName;

      const shouldBuildImage =
        state.runtimePlan.buildStrategy === "dockerfile" ||
        state.runtimePlan.buildStrategy === "workspace-commands" ||
        state.runtimePlan.buildStrategy === "static-artifact";
      const forceRedeploy = isForceRedeployDeployment(state);

      if (shouldBuildImage) {
        image = runtimeInstanceNames.imageName;
        const remoteWorkdir = prepared.source.remoteWorkdir;
        if (!remoteWorkdir) {
          return err(domainError.validation("Dockerfile SSH deployment requires a remote workdir"));
        }

        const dockerfilePath =
          state.runtimePlan.buildStrategy === "dockerfile"
            ? (state.runtimePlan.execution.dockerfilePath ?? "Dockerfile")
            : `${remoteRoot}/${
                state.runtimePlan.execution.dockerfilePath ??
                (state.runtimePlan.buildStrategy === "static-artifact"
                  ? "Dockerfile.appaloft-static"
                  : "Dockerfile.appaloft")
              }`;
        const generatedRemoteContextAssetPaths: string[] = [];

        try {
          if (state.runtimePlan.buildStrategy === "workspace-commands") {
            const dockerBuild = generateWorkspaceDockerBuild({
              execution: state.runtimePlan.execution,
              ...(state.runtimePlan.source.inspection
                ? { sourceInspection: state.runtimePlan.source.inspection }
                : {}),
            });
            if (!dockerBuild) {
              const message = "Start command is required for workspace image generation";
              timeline.push(phaseLog("package", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  timeline,
                  errorCode: "workspace_start_command_missing",
                  retryable: false,
                  metadata: {
                    host: target.host,
                    remoteWorkdir,
                  },
                }),
              });
            }

            const generatedFiles = [
              {
                path: dockerfilePath,
                contents: dockerBuild.dockerfile,
              },
              ...dockerBuild.contextAssets.map((asset) => ({
                path: remoteGeneratedDockerBuildAssetPath(remoteWorkdir, asset.relativePath),
                contents: asset.contents,
              })),
            ];
            generatedRemoteContextAssetPaths.push(
              ...generatedFiles.slice(1).map((file) => file.path),
            );

            const writeDockerBuildAssets = await this.runRemoteCommand({
              target,
              command: remoteWriteTextFilesCommand(generatedFiles),
              cwd: runtimeDir,
              env,
            });

            if (writeDockerBuildAssets.failed) {
              const message = "SSH workspace Docker build asset write failed";
              timeline.push(phaseLog("package", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  timeline,
                  errorCode: "ssh_workspace_dockerfile_write_failed",
                  retryable: true,
                  metadata: {
                    host: target.host,
                    remoteWorkdir,
                  },
                }),
              });
            }

            timeline.push(phaseLog("package", `Generated workspace Dockerfile at ${dockerfilePath}`));
          }

          if (state.runtimePlan.buildStrategy === "static-artifact") {
            const dockerBuild = generateStaticSiteDockerBuild({
              execution: state.runtimePlan.execution,
              ...(state.runtimePlan.source.inspection
                ? { sourceInspection: state.runtimePlan.source.inspection }
                : {}),
            });
            if (!dockerBuild) {
              const message = "Static publish directory is required for static image generation";
              timeline.push(phaseLog("package", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  timeline,
                  errorCode: "static_dockerfile_generation_failed",
                  retryable: false,
                  metadata: {
                    host: target.host,
                    remoteWorkdir,
                  },
                }),
              });
            }

            const generatedFiles = [
              {
                path: dockerfilePath,
                contents: dockerBuild.dockerfile,
              },
              ...dockerBuild.contextAssets.map((asset) => ({
                path: remoteGeneratedDockerBuildAssetPath(remoteWorkdir, asset.relativePath),
                contents: asset.contents,
              })),
            ];
            generatedRemoteContextAssetPaths.push(
              ...generatedFiles.slice(1).map((file) => file.path),
            );

            const writeDockerBuildAssets = await this.runRemoteCommand({
              target,
              command: remoteWriteTextFilesCommand(generatedFiles),
              cwd: runtimeDir,
              env,
            });

            if (writeDockerBuildAssets.failed) {
              const message = "SSH static Docker build asset write failed";
              timeline.push(phaseLog("package", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  timeline,
                  errorCode: "ssh_static_dockerfile_write_failed",
                  retryable: true,
                  metadata: {
                    host: target.host,
                    remoteWorkdir,
                  },
                }),
              });
            }

            timeline.push(
              phaseLog("package", `Generated static site Dockerfile at ${dockerfilePath}`),
            );
          }

          const buildCommand = renderRuntimeCommandString(
            RuntimeCommandBuilder.docker().buildImage({
              image,
              dockerfilePath,
              contextPath: ".",
              workingDirectory: remoteWorkdir,
              labels: dockerLabelsFromAssignments(
                appaloftDockerContainerLabelsForDeployment(state),
              ),
              pull: forceRedeploy,
              noCache: forceRedeploy,
            }),
            { quote: shellQuote },
          );
          timeline.push(phaseLog("package", `Build Docker image ${image} on SSH target`));
          await this.report(context, {
            deploymentId: state.id.value,
            phase: "package",
            status: "running",
            message: `Build image ${image}`,
          });
          let buildStdoutCount = 0;
          let buildStderrCount = 0;
          const build = await this.runRemoteCommandStreaming({
            target,
            command: buildCommand,
            cwd: runtimeDir,
            env,
            onOutput: (line, level, stream) => {
              if (stream === "stdout") {
                buildStdoutCount = this.pushStreamingCommandOutput(timeline, {
                  context,
                  deploymentId: state.id.value,
                  phase: "package",
                  line,
                  level,
                  stream,
                  persistedCount: buildStdoutCount,
                });
                return;
              }

              buildStderrCount = this.pushStreamingCommandOutput(timeline, {
                context,
                deploymentId: state.id.value,
                phase: "package",
                line,
                level,
                stream,
                persistedCount: buildStderrCount,
              });
            },
          });

          if (build.failed) {
            const message = "SSH Docker image build failed";
            timeline.push(phaseLog("package", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline,
                errorCode: "ssh_docker_build_failed",
                retryable: true,
                metadata: {
                  host: target.host,
                  remoteWorkdir,
                },
              }),
            });
          }
        } finally {
          if (generatedRemoteContextAssetPaths.length > 0) {
            await this.runRemoteCommand({
              target,
              command: `rm -f ${generatedRemoteContextAssetPaths.map(shellQuote).join(" ")}`,
              cwd: runtimeDir,
              env,
            });
          }
        }
      }

      if (!image) {
        return err(domainError.validation("Docker image is required for SSH docker execution"));
      }

      const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
        step: "before-deploy",
      });
      if (deployOwnershipResult.isErr()) {
        return deployOwnershipResult.map(() => ({ deployment }));
      }

      const accessRoutes = state.runtimePlan.execution.accessRoutes ?? [];
      const proxyBootstrapResult = this.edgeProxyProviderRegistry
        ? await createEdgeProxyEnsurePlan({
            providerRegistry: this.edgeProxyProviderRegistry,
            context: {
              correlationId: context.requestId,
            },
            accessRoutes,
            options: proxyBootstrapOptionsFromEnv(env),
          })
        : ok(null);
      if (proxyBootstrapResult.isErr()) {
        const message = "Edge proxy provider could not render an ensure plan";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: proxyBootstrapResult.error.code,
            retryable: proxyBootstrapResult.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: proxyBootstrapResult.error.message,
            },
          }),
        });
      }

      const proxyBootstrap = proxyBootstrapResult.value;
      if (proxyBootstrap) {
        const proxyCommandTimeoutMs = positiveIntegerEnvMs(
          env,
          "APPALOFT_SSH_EDGE_PROXY_COMMAND_TIMEOUT_MS",
          defaultSshEdgeProxyCommandTimeoutMs,
        );
        const proxyMessage = `Ensure ${proxyBootstrap.displayName} edge proxy on Docker network ${proxyBootstrap.networkName}`;
        timeline.push(phaseLog("deploy", proxyMessage));
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "running",
          message: proxyMessage,
        });

        const network = await this.runRemoteCommandStreaming({
          target,
          command: proxyBootstrap.networkCommand,
          cwd: runtimeDir,
          env,
          timeoutMs: proxyCommandTimeoutMs,
          timeoutMessage: `${proxyBootstrap.displayName} edge proxy network command timed out after ${proxyCommandTimeoutMs}ms`,
          onOutput: this.createStreamingOutputSink(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
            source: "docker",
          }),
        });

        const proxy = await this.runRemoteCommandStreaming({
          target,
          command: proxyBootstrap.containerCommand,
          cwd: runtimeDir,
          env,
          timeoutMs: proxyCommandTimeoutMs,
          timeoutMessage: `${proxyBootstrap.displayName} edge proxy container command timed out after ${proxyCommandTimeoutMs}ms`,
          onOutput: this.createStreamingOutputSink(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
          }),
        });

        if (network.failed || proxy.failed) {
          const failure = classifyEdgeProxyStartFailure({
            containerName: proxyBootstrap.containerName,
            defaultErrorCode: "ssh_edge_proxy_start_failed",
            defaultMessage: `${proxyBootstrap.displayName} edge proxy failed to start`,
            networkName: proxyBootstrap.networkName,
            output: `${network.stdout}\n${network.stderr}\n${proxy.stdout}\n${proxy.stderr}`,
            providerKey: proxyBootstrap.providerKey,
            proxyKind: proxyBootstrap.proxyKind,
          });
          const message = failure.message;
          timeline.push(phaseLog("deploy", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              timeline,
              errorCode: failure.errorCode,
              retryable: failure.retryable,
              metadata: {
                host: target.host,
                ...prepared.source.metadata,
                ...failure.metadata,
              },
            }),
          });
        }

        const readyMessage = `${proxyBootstrap.displayName} edge proxy is ready`;
        timeline.push(phaseLog("deploy", readyMessage));
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "succeeded",
          message: readyMessage,
        });
      }

      const resourceAccessFailureRenderer = this.resourceAccessFailureRenderer?.();
      const proxyRoutePlanResult = this.edgeProxyProviderRegistry
        ? await createProxyRouteRealizationPlan({
            providerRegistry: this.edgeProxyProviderRegistry,
            context: {
              correlationId: context.requestId,
            },
            deploymentId: state.id.value,
            port,
            accessRoutes,
            ...(resourceAccessFailureRenderer ? { resourceAccessFailureRenderer } : {}),
          })
        : ok(null);
      if (proxyRoutePlanResult.isErr()) {
        const message = "Edge proxy route configuration could not be rendered";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: proxyRoutePlanResult.error.code,
            retryable: proxyRoutePlanResult.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: proxyRoutePlanResult.error.message,
              phase: "proxy-route-realization",
            },
          }),
        });
      }

      const runtimeEnv = await resolveDependencyRuntimeEnvironment({
        context,
        deployment,
        dependencyResourceSecretStore: this.dependencyResourceSecretStore,
        port,
      });
      if (runtimeEnv.isErr()) {
        return err(runtimeEnv.error);
      }
      const {
        env: runtimeExecutionEnv,
        redactions: runtimeRedactions,
        dependencyTargetNames,
      } = runtimeEnv.value;
      const dockerCommandBuilder = RuntimeCommandBuilder.docker();
      const dockerEnvVariables = runtimeContainerEnvironmentVariables({
        env: runtimeExecutionEnv,
        state,
        dependencyTargetNames,
      });
      const labels = dockerLabelsFromAssignments([
        ...appaloftDockerContainerLabelsForDeployment(state),
        ...(proxyRoutePlanResult.value?.labels ?? []),
      ]);
      const storageMounts = dockerStorageMountsFromRuntimeMetadata(state.runtimePlan.execution.metadata);
      if (storageMounts.isErr()) {
        const message = "Storage mounts could not be rendered for SSH Docker";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: storageMounts.error.code,
            retryable: storageMounts.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: storageMounts.error.message,
              phase: "storage-runtime-realization",
            },
          }),
        });
      }
      const storageVolumeRealizations = dockerStorageVolumeRealizationsFromRuntimeMetadata(
        state.runtimePlan.execution.metadata,
      );
      if (storageVolumeRealizations.isErr()) {
        const message = "Storage volume realization could not be rendered for SSH Docker";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: storageVolumeRealizations.error.code,
            retryable: storageVolumeRealizations.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: storageVolumeRealizations.error.message,
              phase: "storage-runtime-realization",
            },
          }),
        });
      }
      const realizeStorageVolumesCommand = renderDockerVolumeRealizationScript({
        realizations: storageVolumeRealizations.value,
        quote: shellQuote,
      });
      if (realizeStorageVolumesCommand.length > 0) {
        timeline.push(phaseLog("deploy", "Realize SSH Docker storage volumes with Appaloft ownership labels"));
        const realizeStorageVolumes = await this.runRemoteCommandStreaming({
          target,
          command: realizeStorageVolumesCommand,
          cwd: runtimeDir,
          env: runtimeExecutionEnv,
          redactions: runtimeRedactions,
          onOutput: this.createStreamingOutputSink(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
          }),
        });
        if (realizeStorageVolumes.failed) {
          const message = "SSH Docker storage volumes could not be realized";
          timeline.push(phaseLog("deploy", message, "error"));
          return ok({
            deployment: this.applyFailure(deployment, {
              timeline,
              errorCode: "ssh_docker_storage_volume_realization_failed",
              retryable: true,
              metadata: {
                host: target.host,
                ...prepared.source.metadata,
                message,
                phase: "storage-runtime-realization",
              },
            }),
          });
        }
      }
      const usesDirectHostPort =
        state.runtimePlan.execution.metadata?.["resource.exposureMode"] === "direct-port";
      const directHostPort = parseOptionalPort(
        state.runtimePlan.execution.metadata?.["resource.hostPort"],
      );
      const supersededDeploymentIds = supersededDeploymentIdsForCleanup(state);
      const removeSupersededResourceContainersSpec =
        dockerCommandBuilder.removeResourceContainers({
          resourceId: state.resourceId.value,
          deploymentIds: supersededDeploymentIds,
        });
      const runCommandSpec = RuntimeCommandBuilder.sequence([
        dockerCommandBuilder.removeContainer({
          containerName,
          ignoreMissing: true,
        }),
        ...(usesDirectHostPort && supersededDeploymentIds.length > 0
          ? [removeSupersededResourceContainersSpec]
          : []),
        dockerCommandBuilder.runContainer({
          image,
          containerName,
          restartPolicy: "unless-stopped",
          env: dockerEnvVariables,
          labels,
          mounts: storageMounts.value,
          ...(proxyRoutePlanResult.value?.networkName
            ? { networkName: proxyRoutePlanResult.value.networkName }
            : {}),
          publishedPorts: [
            dockerCommandBuilder.publishPort({
              containerPort: port,
              mode: usesDirectHostPort ? "host-same-port" : "loopback-ephemeral",
              ...(usesDirectHostPort && directHostPort ? { hostPort: directHostPort } : {}),
            }),
          ],
        }),
      ]);
      const runCommand = renderRuntimeCommandString(runCommandSpec, { quote: shellQuote });
      const imageVersionMetadataResult = await this.resolveRemoteDockerImageVersionMetadata({
        context,
        deploymentId: state.id.value,
        state,
        target,
        runtimeDir,
        env: runtimeExecutionEnv,
        redactions: runtimeRedactions,
        image,
        timeline,
      });
      if (imageVersionMetadataResult.status === "failed") {
        timeline.push(phaseLog("deploy", imageVersionMetadataResult.message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_image_digest_resolution_failed",
            retryable: imageVersionMetadataResult.retryable,
            metadata: {
              host: target.host,
              image,
              containerName,
              message: imageVersionMetadataResult.message,
              phase: "docker-image-version-resolution",
              ...prepared.source.metadata,
            },
          }),
        });
      }
      const dockerImageVersionMetadata = imageVersionMetadataResult.metadata;
      if (usesDirectHostPort && supersededDeploymentIds.length > 0) {
        timeline.push(
          phaseLog(
            "deploy",
            `Release existing SSH containers for resource ${state.resourceId.value}`,
          ),
        );
      }
      timeline.push(phaseLog("deploy", `Start SSH container ${containerName}`));
      const run = await this.runRemoteCommandStreaming({
        target,
        command: runCommand,
        cwd: runtimeDir,
        env: runtimeExecutionEnv,
        redactions: runtimeRedactions,
        onOutput: this.createStreamingOutputSink(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
          source: "docker",
        }),
      });

      if (run.failed) {
        const message = "SSH Docker container failed to start";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_run_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
              ...prepared.source.metadata,
              ...dockerImageVersionMetadata,
            },
          }),
        });
      }

      const proxyReloadPlanResult = this.edgeProxyProviderRegistry
        ? await createProxyReloadPlan({
            providerRegistry: this.edgeProxyProviderRegistry,
            context: {
              correlationId: context.requestId,
            },
            deploymentId: state.id.value,
            accessRoutes,
            routePlan: proxyRoutePlanResult.value,
            reason: "route-realization",
          })
        : ok(null);
      if (proxyReloadPlanResult.isErr()) {
        const message = "SSH edge proxy reload plan could not be rendered";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: proxyReloadPlanResult.error.code,
            retryable: proxyReloadPlanResult.error.retryable,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
              message: proxyReloadPlanResult.error.message,
              phase: "proxy-reload",
              ...dockerImageVersionMetadata,
            },
          }),
        });
      }

      const proxyReloadPlan = proxyReloadPlanResult.value;
      if (proxyReloadPlan?.required) {
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "running",
          message: `Reload ${proxyReloadPlan.displayName} edge proxy`,
        });
        const reload = await executeProxyReloadPlan({
          plan: proxyReloadPlan,
          runCommand: async (step) =>
            await this.runRemoteCommand({
              target,
              command: step.command ?? "",
              cwd: runtimeDir,
              env,
            }),
        });

        for (const entry of reload.timeline) {
          timeline.push(phaseLog("deploy", entry.message, entry.stderr ? "warn" : "info"));
          this.pushCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
            output: entry.stdout ?? "",
            level: "info",
            stream: "stdout",
            source: "docker",
          });
          this.pushCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "deploy",
            output: entry.stderr ?? "",
            level: "warn",
            stream: "stderr",
            source: "docker",
          });
        }

        if (reload.status === "failed") {
          await this.report(context, {
            deploymentId: state.id.value,
            phase: "deploy",
            status: "failed",
            level: "error",
            message: reload.message,
          });
          return ok({
            deployment: this.applyFailure(deployment, {
              timeline: [
                ...timeline,
                phaseLog("deploy", reload.message, "error"),
              ],
              errorCode: reload.errorCode,
              retryable: reload.retryable,
              metadata: {
                host: target.host,
                ...prepared.source.metadata,
                providerKey: proxyReloadPlan.providerKey,
                proxyKind: proxyReloadPlan.proxyKind,
                stepName: reload.stepName,
                phase: "proxy-reload",
                ...dockerImageVersionMetadata,
              },
            }),
          });
        }

        await this.report(context, {
          deploymentId: state.id.value,
          phase: "deploy",
          status: "succeeded",
          message: `${proxyReloadPlan.displayName} edge proxy reload is complete`,
        });
      }

      const publishedPortResult = await this.runRemoteCommand({
        target,
        command: dockerPublishedPortCommand({
          containerName,
          containerPort: port,
          quote: shellQuote,
        }),
        cwd: runtimeDir,
        env,
      });
      const publishedHostPort = parseDockerPublishedHostPort(publishedPortResult.stdout);

      if (publishedPortResult.failed || publishedHostPort === undefined) {
        await this.pushRemoteDockerContainerDiagnostics(timeline, {
          context,
          deploymentId: state.id.value,
          target,
          runtimeDir,
          env,
          containerName,
        });
        await this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(containerName)}`,
          cwd: runtimeDir,
          env,
        });
        const message = `SSH Docker published port could not be resolved for ${containerName}`;
        timeline.push(phaseLog("verify", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_published_port_resolution_failed",
            retryable: true,
            metadata: {
              host: target.host,
              image,
              containerName,
              port: String(port),
              ...prepared.source.metadata,
              ...dockerImageVersionMetadata,
            },
          }),
        });
      }

      const healthPath = normalizeHealthCheckPath(
        state.runtimePlan.execution.healthCheck?.http?.path.value ??
          state.runtimePlan.execution.healthCheckPath,
      );
      const verificationSteps =
        state.runtimePlan.execution.verificationSteps.length > 0
          ? state.runtimePlan.execution.verificationSteps.map((step) => step.kind)
          : defaultVerificationSteps(accessRoutes);
      const proxyNetworkName = proxyRoutePlanResult.value?.networkName;
      let internalUrl = `http://127.0.0.1:${publishedHostPort}${healthPath}`;
      if (proxyNetworkName) {
        const networkIp = await this.runRemoteCommand({
          target,
          command: dockerContainerNetworkIpCommand({
            containerName,
            networkName: proxyNetworkName,
          }),
          cwd: runtimeDir,
          env,
        });
        const containerNetworkIp = parseDockerContainerNetworkIp(networkIp.stdout);
        if (!networkIp.failed && containerNetworkIp) {
          internalUrl = `http://${containerNetworkIp}:${port}${healthPath}`;
          timeline.push(
            phaseLog(
              "verify",
              `Use SSH Docker network ${proxyNetworkName} address for internal health check`,
            ),
          );
        } else {
          timeline.push(
            phaseLog(
              "verify",
              `SSH Docker network address was not available; falling back to published port ${publishedHostPort}`,
              "warn",
            ),
          );
        }
      }
      const publicRouteHealthChecks = accessRoutes.map((route) => ({
        route,
        url: publicHealthUrl({ route, healthPath, publicHost: target.publicHost, port }),
      }));
      const routeConflictCleanupCommand = !usesDirectHostPort
        ? dockerRemoveConflictingRouteContainersCommand({
            deploymentId: state.id.value,
            accessRoutes: accessRoutes.flatMap((route) =>
              route.domains.map((host) => ({
                host,
                pathPrefix: route.pathPrefix,
              })),
            ),
            quote: shellQuote,
          })
        : "";
      let routeConflictCleanupAttempted = false;
      const healthOptions = httpHealthCheckOptions(state.runtimePlan.execution);
      if (!healthOptions) {
        await this.report(context, {
          deploymentId: state.id.value,
          phase: "verify",
          status: "succeeded",
          message: "Health check disabled for resource",
        });
        timeline.push(phaseLog("verify", "Health check disabled for resource"));
        deployment.applyExecutionResult(
          FinishedAt.rehydrate(new Date().toISOString()),
          ExecutionResult.rehydrate({
            exitCode: ExitCode.rehydrate(0),
            status: ExecutionStatusValue.rehydrate("succeeded"),
            retryable: false,
            timeline,
            metadata: {
              host: target.host,
              image,
              containerName,
              port: String(port),
              publishedPort: String(publishedHostPort),
              ...prepared.source.metadata,
              ...dockerImageVersionMetadata,
            },
          }),
        );
        return ok({ deployment });
      }

      for (const step of verificationSteps) {
        if (step === "internal-http") {
          await this.report(context, {
            deploymentId: state.id.value,
            phase: "verify",
            status: "running",
            message: `Checking remote internal container health at ${internalUrl}`,
          });
          const internalHealth = await this.waitForRemoteInternalHealth({
            target,
            url: internalUrl,
            options: healthOptions,
            cwd: runtimeDir,
            env,
          });
          this.pushCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "verify",
            output: internalHealth.stdout,
            level: internalHealth.ok ? "info" : "warn",
            stream: "stdout",
          });
          this.pushCommandOutput(timeline, {
            context,
            deploymentId: state.id.value,
            phase: "verify",
            output: internalHealth.stderr,
            level: "warn",
            stream: "stderr",
          });

          if (!internalHealth.ok) {
            await this.pushRemoteDockerContainerDiagnostics(timeline, {
              context,
              deploymentId: state.id.value,
              target,
              runtimeDir,
              env,
              containerName,
            });
            await this.runRemoteCommand({
              target,
              command: `docker rm -f ${shellQuote(containerName)}`,
              cwd: runtimeDir,
              env,
            });
            const message = `SSH internal container health check failed for ${internalUrl}${
              internalHealth.reason ? `: ${internalHealth.reason}` : ""
            }`;
            timeline.push(phaseLog("verify", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline,
                errorCode: "ssh_internal_health_check_failed",
                retryable: true,
                metadata: {
                  host: target.host,
                  image,
                  containerName,
                  port: String(port),
                  publishedPort: String(publishedHostPort),
                  url: internalUrl,
                  ...prepared.source.metadata,
                  ...dockerImageVersionMetadata,
                },
              }),
            });
          }

          timeline.push(
            phaseLog("verify", `SSH container is reachable internally at ${internalUrl}`),
          );
          continue;
        }

        if (step === "public-http") {
          if (routeConflictCleanupCommand.length > 0 && !routeConflictCleanupAttempted) {
            routeConflictCleanupAttempted = true;
            const cleanup = await this.runRemoteCommand({
              target,
              command: routeConflictCleanupCommand,
              cwd: runtimeDir,
              env,
            });
            timeline.push(
              phaseLog(
                "deploy",
                cleanup.failed
                  ? "Failed to release SSH containers with conflicting access routes"
                  : "Released SSH containers with conflicting access routes",
                cleanup.failed ? "warn" : "info",
              ),
            );
          }

          if (publicRouteHealthChecks.length === 0) {
            const message = "SSH public route health check requested without access routes";
            timeline.push(phaseLog("verify", message, "error"));
            return ok({
              deployment: this.applyFailure(deployment, {
                timeline,
                errorCode: "ssh_public_route_missing",
                retryable: false,
                metadata: {
                  host: target.host,
                  image,
                  containerName,
                  port: String(port),
                  publishedPort: String(publishedHostPort),
                  internalUrl,
                  phase: "public-route-verification",
                  ...prepared.source.metadata,
                  ...dockerImageVersionMetadata,
                },
              }),
            });
          }

          for (const publicRouteHealthCheck of publicRouteHealthChecks) {
            const { route, url: publicUrl } = publicRouteHealthCheck;
            await this.report(context, {
              deploymentId: state.id.value,
              phase: "verify",
              status: "running",
              message: `Checking public access route ${publicUrl}`,
            });
            const publicHealth = await waitForHealth(publicUrl, {
              ...healthOptions,
              tlsVerification:
                route.proxyKind !== "none" && route.tlsMode === "auto"
                  ? "allow-untrusted"
                  : "strict",
            });

            if (!publicHealth.ok) {
              await this.pushRemoteDockerContainerDiagnostics(timeline, {
                context,
                deploymentId: state.id.value,
                target,
                runtimeDir,
                env,
                containerName,
              });
              await this.runRemoteCommand({
                target,
                command: `docker rm -f ${shellQuote(containerName)}`,
                cwd: runtimeDir,
                env,
              });
              const message = `SSH public route health check failed for ${publicUrl}${
                publicHealth.reason ? `: ${publicHealth.reason}` : ""
              }`;
              const errorCode = publicRouteHealthErrorCode(publicHealth);
              timeline.push(phaseLog("verify", message, "error"));
              return ok({
                deployment: this.applyFailure(deployment, {
                  timeline,
                  errorCode,
                  retryable: true,
                  metadata: {
                    host: target.host,
                    image,
                    containerName,
                    port: String(port),
                    publishedPort: String(publishedHostPort),
                    internalUrl,
                    url: publicUrl,
                    phase: "public-route-verification",
                    message,
                    publicRouteFailureKind: publicHealth.failureKind,
                    ...prepared.source.metadata,
                    ...dockerImageVersionMetadata,
                  },
                }),
              });
            }

            if (publicHealth.tlsVerification === "untrusted") {
              timeline.push(
                phaseLog(
                  "verify",
                  `SSH public route is reachable at ${publicUrl} with untrusted TLS; certificate readiness remains separate`,
                  "warn",
                ),
              );
            } else {
              timeline.push(phaseLog("verify", `SSH public route is reachable at ${publicUrl}`));
            }
          }
        }
      }

      if (!usesDirectHostPort && supersededDeploymentIds.length > 0) {
        const cleanupCommand = renderRuntimeCommandString(removeSupersededResourceContainersSpec, {
          quote: shellQuote,
        });
        const cleanup = await this.runRemoteCommand({
          target,
          command: cleanupCommand,
          cwd: runtimeDir,
          env,
        });
        timeline.push(
          phaseLog(
            "deploy",
            cleanup.failed
              ? `Failed to release superseded SSH containers for resource ${state.resourceId.value}`
              : `Released superseded SSH containers for resource ${state.resourceId.value}`,
            cleanup.failed ? "warn" : "info",
          ),
        );
      }

      const firstPublicUrl = publicRouteHealthChecks[0]?.url;
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          timeline,
          metadata: {
            host: target.host,
            image,
            containerName,
            port: String(port),
            publishedPort: String(publishedHostPort),
            url: firstPublicUrl ?? internalUrl,
            internalUrl,
            ...(firstPublicUrl ? { publicUrl: firstPublicUrl } : {}),
            ...prepared.source.metadata,
            ...dockerImageVersionMetadata,
          },
        }),
      );

      return ok({ deployment });
    } catch (error) {
      if (context.entrypoint !== "cli") {
        this.logger.error("ssh_execution_backend.execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown SSH execution error",
              "error",
            ),
          ],
          errorCode: "ssh_execution_failed",
          retryable: true,
        }),
      });
    } finally {
      this.cleanupPrivateKey(target);
    }
  }

  private async prepareRemoteGeneratedServiceGraphCompose(input: {
    context: ExecutionContext;
    deployment: Deployment;
    timeline: DeploymentTimelineJournalEntry[];
    runtimeDir: string;
    target: SshTarget;
    env: NodeJS.ProcessEnv;
    remoteWorkdir: string;
    image: string;
    environment?: Record<string, string>;
  }): Promise<
    Result<{ prepared: true; composeFile?: string } | { prepared: false; deployment: Deployment }>
  > {
    const state = input.deployment.toState();
    const replicatedComposeFile = replicatedWorkloadComposeFileFromMetadata(
      state.runtimePlan.execution.metadata,
    );
    if (replicatedComposeFile) {
      const serviceName = replicatedWorkloadServiceNameFromMetadata(
        state.runtimePlan.execution.metadata,
      );
      const replicas = replicatedWorkloadReplicasFromMetadata(state.runtimePlan.execution.metadata);
      if (!serviceName || !replicas) {
        const message = "Replicated workload metadata is incomplete";
        input.timeline.push(phaseLog("package", message, "error"));
        return ok({
          prepared: false,
          deployment: this.applyFailure(input.deployment, {
            timeline: input.timeline,
            errorCode: "ssh_replicated_workload_metadata_missing",
            retryable: false,
            metadata: {
              host: input.target.host,
              remoteWorkdir: input.remoteWorkdir,
              composeFile: replicatedComposeFile,
            },
          }),
        });
      }

      const dockerfilePath =
        state.runtimePlan.execution.dockerfilePath ?? state.runtimePlan.runtimeArtifact?.metadata?.dockerfilePath;
      const defaultPort = state.runtimePlan.execution.port;
      const remoteComposeFile = replicatedComposeFile.startsWith("/")
        ? replicatedComposeFile
        : `${input.remoteWorkdir}/${replicatedComposeFile}`;
      const generatedFiles = [
        {
          path: remoteComposeFile,
          contents: renderReplicatedWorkloadCompose({
            image: input.image,
            ...(dockerfilePath ? { dockerfilePath } : {}),
            serviceName,
            ...(defaultPort ? { defaultPort } : {}),
            replicas,
            ...(state.runtimePlan.execution.startCommand
              ? { command: state.runtimePlan.execution.startCommand }
              : {}),
            ...(input.environment ? { environment: input.environment } : {}),
            includeBuild: Boolean(dockerfilePath),
          }),
        },
      ];

      const dockerBuild = generateWorkspaceDockerBuild({
        execution: state.runtimePlan.execution,
        ...(state.runtimePlan.source.inspection
          ? { sourceInspection: state.runtimePlan.source.inspection }
          : {}),
      });
      if (dockerBuild && dockerfilePath) {
        const remoteDockerfilePath = dockerfilePath.startsWith("/")
          ? dockerfilePath
          : `${input.remoteWorkdir}/${dockerfilePath}`;
        generatedFiles.unshift(
          {
            path: remoteDockerfilePath,
            contents: dockerBuild.dockerfile,
          },
          ...dockerBuild.contextAssets.map((asset) => ({
            path: remoteGeneratedDockerBuildAssetPath(input.remoteWorkdir, asset.relativePath),
            contents: asset.contents,
          })),
        );
      }

      const writeReplicatedWorkloadFiles = await this.runRemoteCommand({
        target: input.target,
        command: remoteWriteTextFilesCommand(generatedFiles),
        cwd: input.runtimeDir,
        env: input.env,
      });

      if (writeReplicatedWorkloadFiles.failed) {
        const message = "SSH replicated workload asset write failed";
        input.timeline.push(phaseLog("package", message, "error"));
        return ok({
          prepared: false,
          deployment: this.applyFailure(input.deployment, {
            timeline: input.timeline,
            errorCode: "ssh_replicated_workload_compose_write_failed",
            retryable: true,
            metadata: {
              host: input.target.host,
              remoteWorkdir: input.remoteWorkdir,
              composeFile: remoteComposeFile,
            },
          }),
        });
      }

      input.timeline.push(
        phaseLog("package", `Generated replicated workload compose file ${replicatedComposeFile}`),
      );
      await this.report(input.context, {
        deploymentId: state.id.value,
        phase: "package",
        status: "succeeded",
        message: "Generated replicated workload compose file",
      });

      return ok({ prepared: true, composeFile: replicatedComposeFile });
    }

    const composeFile = serviceGraphComposeFileFromMetadata(state.runtimePlan.execution.metadata);
    if (!composeFile) {
      return ok({ prepared: true });
    }

    const services = serviceGraphComposeServicesFromMetadata(state.runtimePlan.execution.metadata);
    if (services.length === 0) {
      const message = "Repository service graph metadata is missing services";
      input.timeline.push(phaseLog("package", message, "error"));
      return ok({
        prepared: false,
        deployment: this.applyFailure(input.deployment, {
          timeline: input.timeline,
          errorCode: "ssh_service_graph_metadata_missing",
          retryable: false,
          metadata: {
            host: input.target.host,
            remoteWorkdir: input.remoteWorkdir,
            composeFile,
          },
        }),
      });
    }

    const dockerBuild = generateWorkspaceDockerBuild({
      execution: state.runtimePlan.execution,
      ...(state.runtimePlan.source.inspection
        ? { sourceInspection: state.runtimePlan.source.inspection }
        : {}),
    });
    if (!dockerBuild) {
      const message = "Start command is required for workspace service graph image generation";
      input.timeline.push(phaseLog("package", message, "error"));
      return ok({
        prepared: false,
        deployment: this.applyFailure(input.deployment, {
          timeline: input.timeline,
          errorCode: "workspace_start_command_missing",
          retryable: false,
          metadata: {
            host: input.target.host,
            remoteWorkdir: input.remoteWorkdir,
            composeFile,
          },
        }),
      });
    }

    const dockerfilePath =
      state.runtimePlan.execution.dockerfilePath ?? ".appaloft/Dockerfile.appaloft";
    const remoteDockerfilePath = dockerfilePath.startsWith("/")
      ? dockerfilePath
      : `${input.remoteWorkdir}/${dockerfilePath}`;
    const remoteComposeFile = composeFile.startsWith("/")
      ? composeFile
      : `${input.remoteWorkdir}/${composeFile}`;
    const generatedFiles = [
      {
        path: remoteDockerfilePath,
        contents: dockerBuild.dockerfile,
      },
      ...dockerBuild.contextAssets.map((asset) => ({
        path: remoteGeneratedDockerBuildAssetPath(input.remoteWorkdir, asset.relativePath),
        contents: asset.contents,
      })),
      {
        path: remoteComposeFile,
        contents: renderServiceGraphCompose({
          image: input.image,
          dockerfilePath,
          services,
          defaultPort: state.runtimePlan.execution.port ?? 3000,
          ...(input.environment ? { environment: input.environment } : {}),
        }),
      },
    ];

    const writeServiceGraphFiles = await this.runRemoteCommand({
      target: input.target,
      command: remoteWriteTextFilesCommand(generatedFiles),
      cwd: input.runtimeDir,
      env: input.env,
    });

    if (writeServiceGraphFiles.failed) {
      const message = "SSH repository service graph asset write failed";
      input.timeline.push(phaseLog("package", message, "error"));
      return ok({
        prepared: false,
        deployment: this.applyFailure(input.deployment, {
          timeline: input.timeline,
          errorCode: "ssh_service_graph_compose_write_failed",
          retryable: true,
          metadata: {
            host: input.target.host,
            remoteWorkdir: input.remoteWorkdir,
            composeFile: remoteComposeFile,
            dockerfilePath: remoteDockerfilePath,
          },
        }),
      });
    }

    input.timeline.push(
      phaseLog("package", `Generated repository service graph compose file ${composeFile}`),
    );
    await this.report(input.context, {
      deploymentId: state.id.value,
      phase: "package",
      status: "succeeded",
      message: "Generated repository service graph compose file",
    });

    return ok({ prepared: true, composeFile });
  }

  private async executeDockerCompose(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = deployment.toState();
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }
    const target = targetResult._unsafeUnwrap();
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);
    const packageEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      ...(state.runtimePlan.execution.port ? { port: state.runtimePlan.execution.port } : {}),
      includeDependencyRuntimeSecrets: false,
    });
    if (packageEnv.isErr()) {
      return err(packageEnv.error);
    }
    const { env, redactions } = packageEnv.value;
    const timeline: DeploymentTimelineJournalEntry[] = [
      phaseLog(
        "plan",
        `Using SSH docker-compose-stack execution on ${target.host}:${target.port}`,
      ),
    ];

    try {
      const prepared = await this.prepareSshSource(context, deployment, timeline, {
        runtimeDir,
        remoteRoot,
        target,
        env,
      });

      if (!prepared.prepared) {
        return ok({ deployment: prepared.deployment });
      }

      const remoteWorkdir = prepared.source.remoteWorkdir;
      if (!remoteWorkdir) {
        return err(
          domainError.validation("Docker Compose SSH deployment requires a remote workdir"),
        );
      }

      const dockerVersion = await this.runRemoteCommand({
        target,
        command: "docker version --format '{{.Server.Version}}'",
        cwd: runtimeDir,
        env,
        redactions,
      });

      if (dockerVersion.failed) {
        const message = "Docker is not available on the SSH target";
        timeline.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const dockerComposeReady = await this.runRemoteCommandStreaming({
        target,
        command: remoteDockerPrepareCommand,
        cwd: runtimeDir,
        env,
        redactions,
        onOutput: this.createStreamingOutputSink(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "package",
        }),
      });
      if (dockerComposeReady.failed) {
        const message = "Docker Compose is not available on the SSH target";
        timeline.push(phaseLog("package", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_compose_unavailable",
            retryable: false,
            metadata: {
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      const runtimeInstanceNames = deriveRuntimeInstanceNames({
        deploymentId: state.id.value,
        metadata: state.runtimePlan.execution.metadata,
      });
      const deployOwnershipResult = await this.ensureExecutionStillOwned(context, deployment, {
        step: "before-compose-up",
      });
      if (deployOwnershipResult.isErr()) {
        return deployOwnershipResult.map(() => ({ deployment }));
      }
      const runtimeEnv = await resolveDependencyRuntimeEnvironment({
        context,
        deployment,
        dependencyResourceSecretStore: this.dependencyResourceSecretStore,
        ...(state.runtimePlan.execution.port ? { port: state.runtimePlan.execution.port } : {}),
      });
      if (runtimeEnv.isErr()) {
        return err(runtimeEnv.error);
      }
      const runtimeEnvVariables = runtimeContainerEnvironmentVariables({
        env: runtimeEnv.value.env,
        state,
        dependencyTargetNames: runtimeEnv.value.dependencyTargetNames,
      });
      const runtimeEnvPlaceholders = Object.fromEntries(
        runtimeEnvVariables.map((variable) => [variable.name, `\${${variable.name}}`]),
      );
      const generatedCompose = await this.prepareRemoteGeneratedServiceGraphCompose({
        context,
        deployment,
        timeline,
        runtimeDir,
        target,
        env,
        remoteWorkdir,
        image: runtimeInstanceNames.imageName,
        environment: runtimeEnvPlaceholders,
      });
      if (generatedCompose.isErr()) {
        return err(generatedCompose.error);
      }
      if (!generatedCompose.value.prepared) {
        return ok({ deployment: generatedCompose.value.deployment });
      }
      const composeFile =
        generatedCompose.value.composeFile ??
        state.runtimePlan.execution.composeFile ??
        "docker-compose.yml";
      const remoteComposeFile = composeFile.startsWith("/")
        ? composeFile
        : `${remoteWorkdir}/${composeFile}`;
      const remoteComposeOwnershipOverrideFile = `${remoteWorkdir}/.appaloft.compose.labels.override.yml`;
      const remoteRuntimeEnvFile = `${remoteWorkdir}/.appaloft/runtime.env`;
      const composeOwnershipLabels = dockerLabelsFromAssignments(
        appaloftDockerContainerLabelsForDeployment(state),
      );
      const storageMounts = dockerStorageMountsFromRuntimeMetadata(state.runtimePlan.execution.metadata);
      if (storageMounts.isErr()) {
        const message = "Storage mounts could not be rendered for SSH Docker Compose";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: storageMounts.error.code,
            retryable: storageMounts.error.retryable,
            metadata: {
              host: target.host,
              remoteWorkdir,
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              message: storageMounts.error.message,
              phase: "storage-runtime-realization",
              ...prepared.source.metadata,
            },
          }),
        });
      }
      const storageVolumeRealizations = dockerStorageVolumeRealizationsFromRuntimeMetadata(
        state.runtimePlan.execution.metadata,
      );
      if (storageVolumeRealizations.isErr()) {
        const message = "Storage volume realization could not be rendered for SSH Docker Compose";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: storageVolumeRealizations.error.code,
            retryable: storageVolumeRealizations.error.retryable,
            metadata: {
              host: target.host,
              remoteWorkdir,
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              message: storageVolumeRealizations.error.message,
              phase: "storage-runtime-realization",
              ...prepared.source.metadata,
            },
          }),
        });
      }
      const runtimeEnvFile = renderRemotePrivateTextFileCommand({
        path: remoteRuntimeEnvFile,
        contents: renderRuntimeEnvironmentShellFile({ variables: runtimeEnvVariables }),
      });
      const writeRuntimeEnvFile = await this.runRemoteCommand({
        target,
        command: runtimeEnvFile.command,
        cwd: runtimeDir,
        env: runtimeEnv.value.env,
        redactions: [...runtimeEnv.value.redactions, ...runtimeEnvFile.redactions],
      });
      if (writeRuntimeEnvFile.failed) {
        const message = "SSH Docker Compose runtime environment write failed";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_compose_runtime_env_write_failed",
            retryable: true,
            metadata: {
              host: target.host,
              remoteWorkdir,
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              runtimeEnvFile: remoteRuntimeEnvFile,
              ...prepared.source.metadata,
            },
          }),
        });
      }
      timeline.push(phaseLog("deploy", "Generate Appaloft compose ownership labels override"));
      const composeOverride = await this.runRemoteCommandStreaming({
        target,
        command: withRemoteRuntimeEnvironmentFile({
          envFile: remoteRuntimeEnvFile,
          command: renderComposeOwnershipLabelOverrideScript({
            composeFile: remoteComposeFile,
            overrideFile: remoteComposeOwnershipOverrideFile,
            labels: composeOwnershipLabels,
            mounts: storageMounts.value,
            volumeRealizations: storageVolumeRealizations.value,
            quote: shellQuote,
          }),
        }),
        cwd: runtimeDir,
        env: runtimeEnv.value.env,
        redactions: runtimeEnv.value.redactions,
        onOutput: this.createStreamingOutputSink(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
        }),
      });
      if (composeOverride.failed) {
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_compose_label_override_failed",
            retryable: false,
            metadata: {
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              composeOwnershipOverrideFile: remoteComposeOwnershipOverrideFile,
              runtimeEnvFile: remoteRuntimeEnvFile,
              host: target.host,
              ...prepared.source.metadata,
            },
          }),
        });
      }
      const upCommand = renderRuntimeCommandString(
        RuntimeCommandBuilder.docker().composeUp({
          composeFile: remoteComposeFile,
          additionalComposeFiles: [remoteComposeOwnershipOverrideFile],
          projectName: runtimeInstanceNames.composeProjectName,
          workingDirectory: remoteWorkdir,
          scales: composeScaleFromRuntimeMetadata(state.runtimePlan.execution.metadata),
          portableDockerCompose: true,
          pull: isForceRedeployDeployment(state),
          noCache: isForceRedeployDeployment(state),
        }),
        { quote: shellQuote },
      );
      timeline.push(phaseLog("deploy", `Run docker compose on SSH target with ${remoteComposeFile}`));
      await this.report(context, {
        deploymentId: state.id.value,
        phase: "deploy",
        status: "running",
        message: `Start compose stack ${remoteComposeFile}`,
      });

      const up = await this.runRemoteCommandStreaming({
        target,
        command: withRemoteRuntimeEnvironmentFile({
          envFile: remoteRuntimeEnvFile,
          command: upCommand,
        }),
        cwd: runtimeDir,
        env: runtimeEnv.value.env,
        redactions: runtimeEnv.value.redactions,
        onOutput: this.createStreamingOutputSink(timeline, {
          context,
          deploymentId: state.id.value,
          phase: "deploy",
        }),
      });

      if (up.failed) {
        const message = "SSH Docker Compose deployment failed";
        timeline.push(phaseLog("deploy", message, "error"));
        return ok({
          deployment: this.applyFailure(deployment, {
            timeline,
            errorCode: "ssh_docker_compose_failed",
            retryable: true,
            metadata: {
              host: target.host,
              remoteWorkdir,
              composeFile: remoteComposeFile,
              composeProjectName: runtimeInstanceNames.composeProjectName,
              composeOwnershipOverrideFile: remoteComposeOwnershipOverrideFile,
              runtimeEnvFile: remoteRuntimeEnvFile,
              ...prepared.source.metadata,
            },
          }),
        });
      }

      timeline.push(phaseLog("verify", `SSH compose stack started from ${remoteComposeFile}`));
      deployment.applyExecutionResult(
        FinishedAt.rehydrate(new Date().toISOString()),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          timeline,
          metadata: {
            host: target.host,
            remoteWorkdir,
            composeFile: remoteComposeFile,
            composeProjectName: runtimeInstanceNames.composeProjectName,
            composeOwnershipOverrideFile: remoteComposeOwnershipOverrideFile,
            runtimeEnvFile: remoteRuntimeEnvFile,
            ...prepared.source.metadata,
          },
        }),
      );

      return ok({ deployment });
    } catch (error) {
      if (context.entrypoint !== "cli") {
        this.logger.error("ssh_execution_backend.compose_execute_failed", {
          deploymentId: state.id.value,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return ok({
        deployment: this.applyFailure(deployment, {
          timeline: [
            phaseLog(
              "deploy",
              error instanceof Error ? error.message : "Unknown SSH Docker Compose execution error",
              "error",
            ),
          ],
          errorCode: "ssh_docker_compose_execution_failed",
          retryable: true,
        }),
      });
    } finally {
      this.cleanupPrivateKey(target);
    }
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ timeline: [] }));
    }

    const target = targetResult._unsafeUnwrap();
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      includeDependencyRuntimeSecrets: false,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const { env, redactions } = runtimeEnv.value;
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });
    const containerName = metadata.containerName ?? runtimeInstanceNames.containerName;
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);
    const remoteWorkdir = metadata.remoteWorkdir ?? remoteSourceWorkdir(remoteRoot, state.runtimePlan.source.metadata);
    const timeline: DeploymentTimelineJournalEntry[] = [];

    try {
      if (state.runtimePlan.execution.kind === "docker-container") {
        await this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(containerName)} >/dev/null 2>&1 || true`,
          cwd: runtimeDir,
          env,
          redactions,
        });
      } else if (state.runtimePlan.execution.kind === "docker-compose-stack") {
        const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
        if (composeFile) {
          const remoteComposeFile = composeFile.startsWith("/")
            ? composeFile
            : `${remoteWorkdir}/${composeFile}`;
          await this.runRemoteCommand({
            target,
            command: withOptionalRemoteRuntimeEnvironmentFile({
              envFile: `${remoteWorkdir}/.appaloft/runtime.env`,
              command: `docker compose -p ${shellQuote(
                metadata.composeProjectName ?? runtimeInstanceNames.composeProjectName,
              )} -f ${shellQuote(remoteComposeFile)} down`,
            }),
            cwd: runtimeDir,
            env,
            redactions,
          });
        }
      }
      const artifactCleanup = createPreviewRuntimeArtifactCleanupPlan({
        deploymentId: state.id.value,
        buildStrategy: state.runtimePlan.buildStrategy,
        sourceKind: state.runtimePlan.source.kind,
        executionKind: state.runtimePlan.execution.kind,
        imageName: runtimeInstanceNames.imageName,
        metadata,
        remoteRuntimeRoot: remoteRoot,
        remoteWorkdir,
      });
      const remoteArtifactRoot = artifactCleanup.remoteRuntimeRoot ?? artifactCleanup.remoteWorkdir;
      if (remoteArtifactRoot) {
        const workspaceCleanup = await this.runRemoteCommand({
          target,
          command: `rm -rf ${shellQuote(remoteArtifactRoot)}`,
          cwd: runtimeDir,
          env,
          redactions,
        });
        if (workspaceCleanup.failed) {
          return err(
            domainError.infra("Preview SSH artifact cleanup failed", {
              phase: "runtime-cleanup",
              cleanupStage: "artifact-cleanup",
              deploymentId: state.id.value,
              remoteWorkdir: remoteArtifactRoot,
              errorMessage: workspaceCleanup.reason ?? workspaceCleanup.stderr,
            }),
          );
        }
        timeline.push(
          phaseLog("deploy", `Removed SSH preview source workspace ${remoteArtifactRoot}`),
        );
      }
      if (artifactCleanup.imageName) {
        await this.runRemoteCommand({
          target,
          command: `docker image rm ${shellQuote(artifactCleanup.imageName)} >/dev/null 2>&1 || true`,
          cwd: runtimeDir,
          env,
          redactions,
        });
        timeline.push(phaseLog("deploy", `Removed SSH preview image ${artifactCleanup.imageName}`));
      }
      const sourceFingerprint = previewSourceFingerprintFromMetadata(metadata);
      if (sourceFingerprint) {
        const siblingArtifactCleanup = await this.runRemoteCommand({
          target,
          command: buildRemotePreviewArtifactSweepCommand({
            remoteRuntimeRoot: this.remoteRuntimeRoot,
            sourceFingerprint,
          }),
          cwd: runtimeDir,
          env,
          redactions,
        });
        if (siblingArtifactCleanup.failed) {
          return err(
            domainError.infra("Preview SSH sibling artifact cleanup failed", {
              phase: "runtime-cleanup",
              cleanupStage: "artifact-cleanup",
              deploymentId: state.id.value,
              errorMessage:
                siblingArtifactCleanup.reason ?? siblingArtifactCleanup.stderr,
            }),
          );
        }
        if (siblingArtifactCleanup.stdout.trim().length > 0) {
          timeline.push(
            phaseLog("deploy", "Removed SSH preview sibling artifacts for source fingerprint"),
          );
        }
      }
    } finally {
      this.cleanupPrivateKey(target);
    }

    const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
    timeline.unshift(
      phaseLog(
        "deploy",
        state.runtimePlan.execution.kind === "docker-container"
          ? `Removed SSH container ${containerName}`
          : state.runtimePlan.execution.kind === "docker-compose-stack" && composeFile
            ? `Stopped SSH compose stack ${composeFile}`
            : "No SSH cancellation cleanup required",
      ),
    );
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "deploy",
      status: "succeeded",
      message: "SSH deployment cancellation completed",
    });

    return ok({ timeline });
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    void plan;
    const state = deployment.toState();
    const metadata = state.runtimePlan.execution.metadata ?? {};
    const runtimeDir = this.runtimeDirectory(state.id.value);
    mkdirSync(runtimeDir, { recursive: true });

    const targetResult = await this.targetFor(context, deployment, runtimeDir);
    if (targetResult.isErr()) {
      return targetResult.map(() => ({ deployment }));
    }

    const target = targetResult._unsafeUnwrap();
    const timeline: DeploymentTimelineJournalEntry[] = [];
    const runtimeEnv = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      includeDependencyRuntimeSecrets: false,
    });
    if (runtimeEnv.isErr()) {
      return err(runtimeEnv.error);
    }
    const { env, redactions } = runtimeEnv.value;
    const runtimeInstanceNames = deriveRuntimeInstanceNames({
      deploymentId: state.id.value,
      metadata: state.runtimePlan.execution.metadata,
    });
    const remoteRoot = this.remoteRuntimeDirectory(state.id.value);
    const remoteWorkdir = metadata.remoteWorkdir ?? remoteSourceWorkdir(remoteRoot, state.runtimePlan.source.metadata);

    try {
      if (state.runtimePlan.execution.kind === "docker-container") {
        await this.runRemoteCommand({
          target,
          command: `docker rm -f ${shellQuote(metadata.containerName ?? runtimeInstanceNames.containerName)}`,
          cwd: runtimeDir,
          env,
          redactions,
        });
      } else if (state.runtimePlan.execution.kind === "docker-compose-stack") {
        const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
        if (composeFile) {
          const remoteComposeFile = composeFile.startsWith("/")
            ? composeFile
            : `${remoteWorkdir}/${composeFile}`;
          await this.runRemoteCommand({
            target,
            command: withOptionalRemoteRuntimeEnvironmentFile({
              envFile: `${remoteWorkdir}/.appaloft/runtime.env`,
              command: `docker compose -p ${shellQuote(
                metadata.composeProjectName ?? runtimeInstanceNames.composeProjectName,
              )} -f ${shellQuote(remoteComposeFile)} down`,
            }),
            cwd: runtimeDir,
            env,
            redactions,
          });
        }
      }
    } finally {
      this.cleanupPrivateKey(target);
    }

    const composeFile = metadata.composeFile ?? state.runtimePlan.execution.composeFile;
    timeline.push(
      phaseLog(
        "rollback",
        metadata.containerName
          ? `Removed SSH container ${metadata.containerName}`
          : state.runtimePlan.execution.kind === "docker-container"
            ? `Removed SSH container ${runtimeInstanceNames.containerName}`
            : state.runtimePlan.execution.kind === "docker-compose-stack" && composeFile
              ? `Stopped SSH compose stack ${composeFile}`
              : "No SSH container metadata recorded",
      ),
    );
    deployment.applyExecutionResult(
      FinishedAt.rehydrate(new Date().toISOString()),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("rolled-back"),
        retryable: false,
        timeline,
      }),
    );
    await this.report(context, {
      deploymentId: state.id.value,
      phase: "rollback",
      status: "succeeded",
      message: "SSH rollback completed",
    });

    return ok({ deployment });
  }
}
