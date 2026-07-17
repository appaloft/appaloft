import { createSign } from "node:crypto";
import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type ExecutionContext,
  type GitHubAppInstallationReadback,
  type GitHubAppInstallationToken,
  type GitHubAppRuntime,
  type GitHubPreviewPullRequestAction,
  type GitHubPreviewPullRequestWebhookVerificationInput,
  type GitHubPreviewPullRequestWebhookVerificationResult,
  type GitHubPreviewPullRequestWebhookVerifier,
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type GitHubSourceEventWebhookVerificationInput,
  type GitHubSourceEventWebhookVerificationResult,
  type GitHubSourceEventWebhookVerifier,
  type IntegrationDescriptor,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
  type SourceEventChangedPathResolution,
  type SourceEventChangedPathResolver,
  type SourceEventChangedPathResolverInput,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

export interface GitHubAppIntegrationOptions {
  callbackUrl?: string;
  connectionMode?: "user-oauth" | "hosted-provider-app" | "operator-managed-app";
  installUrl?: string;
  owner?: string;
  privateKeyConfigured?: boolean;
  slug?: string;
  appId?: string;
  webhookSecretConfigured?: boolean;
  webhookUrl?: string;
}

export const githubIntegration: IntegrationDescriptor = {
  key: "github",
  title: "GitHub",
  capabilities: ["repository-import", "webhook-ready", "future-pr-comment"],
  defaultConnectionModeKey: "user-oauth",
  connectionModes: [
    {
      key: "user-oauth",
      title: "User OAuth",
      audience: "end-user",
      externalSetup: "none",
      createsExternalResources: false,
      secretMaterialRequired: false,
      description:
        "Browse repositories with the signed-in user's GitHub account without storing GitHub App private key material.",
    },
    {
      key: "hosted-provider-app",
      title: "Hosted provider app",
      audience: "end-user",
      externalSetup: "provider-installation",
      createsExternalResources: false,
      secretMaterialRequired: false,
      description:
        "Install the Appaloft instance's GitHub App for repository events and installation-scoped access.",
    },
    {
      key: "operator-managed-app",
      title: "Operator-managed app",
      audience: "instance-admin",
      externalSetup: "manual-provider-app",
      createsExternalResources: false,
      secretMaterialRequired: true,
      description:
        "Use a GitHub App owned by the Appaloft instance operator for repository events and installation-scoped access.",
    },
  ],
};

export function createGitHubIntegrationDescriptor(
  options: GitHubAppIntegrationOptions = {},
): IntegrationDescriptor {
  const connectionMode =
    options.connectionMode ?? githubIntegration.defaultConnectionModeKey ?? "user-oauth";
  const appMode =
    connectionMode === "hosted-provider-app" || connectionMode === "operator-managed-app";
  const missing: string[] = [];

  if (appMode) {
    if (!options.appId) {
      missing.push("github_app_id_missing");
    }
    if (!options.privateKeyConfigured) {
      missing.push("github_app_private_key_missing");
    }
    if (!options.installUrl && !options.slug) {
      missing.push("github_app_install_url_missing");
    }
  }

  const status: NonNullable<IntegrationDescriptor["configuration"]>["status"] = appMode
    ? missing.length === 0
      ? "configured"
      : missing.length === 3
        ? "not-configured"
        : "partial"
    : "unknown";

  return {
    ...githubIntegration,
    defaultConnectionModeKey: connectionMode,
    ...(appMode
      ? {
          setup: {
            providerApp: {
              ...(options.installUrl ? { installUrl: options.installUrl } : {}),
              ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
              ...(options.webhookUrl ? { webhookUrl: options.webhookUrl } : {}),
            },
          },
        }
      : {}),
    ...(appMode
      ? {
          configuration: {
            status,
            diagnostics: missing.map((code) => ({
              code,
              severity: "error" as const,
              message: `GitHub App configuration is missing ${code.replace("github_app_", "").replaceAll("_", " ")}.`,
            })),
          },
        }
      : {}),
  };
}

interface GitHubRepositoryApiRecord {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  clone_url: string;
  updated_at: string;
  owner: {
    login: string;
  };
}

interface GitHubInstallationApiRecord {
  account: {
    id?: number;
    login?: string;
    type?: string;
  } | null;
  id: number;
  repository_selection?: "all" | "selected";
  suspended_at?: string | null;
}

interface GitHubInstallationAccessTokenResponse {
  expires_at: string;
  token: string;
}

interface GitHubInstallationRepositoriesResponse {
  repositories: GitHubRepositoryApiRecord[];
  total_count?: number;
}

export class GitHubApiRepositoryBrowser implements GitHubRepositoryBrowser {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async listRepositories(
    context: ExecutionContext,
    input: {
      accessToken: string;
      accessTokenKind?: "installation" | "user";
      search?: string;
    },
  ): Promise<GitHubRepositorySummary[]> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("github_repository_browser", "list_repositories"),
      {
        attributes: {
          [appaloftTraceAttributes.integrationKey]: "github",
        },
      },
      async () => {
        const url = new URL(
          input.accessTokenKind === "installation" ? "/installation/repositories" : "/user/repos",
          this.apiBaseUrl,
        );
        url.searchParams.set("sort", "updated");
        url.searchParams.set("per_page", "100");
        if (input.accessTokenKind !== "installation") {
          url.searchParams.set("affiliation", "owner,collaborator,organization_member");
        }

        const response = await this.fetcher(url, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${input.accessToken}`,
            "user-agent": "appaloft-control-plane",
            "x-github-api-version": "2022-11-28",
          },
        });

        if (!response.ok) {
          throw new Error(`GitHub API returned ${response.status}`);
        }

        const payload = (await response.json()) as
          | GitHubRepositoryApiRecord[]
          | GitHubInstallationRepositoriesResponse;
        const records = Array.isArray(payload) ? payload : payload.repositories;
        const search = input.search?.trim().toLowerCase();

        return records
          .filter((repository) =>
            search
              ? [
                  repository.name,
                  repository.full_name,
                  repository.owner.login,
                  repository.description ?? "",
                ]
                  .join(" ")
                  .toLowerCase()
                  .includes(search)
              : true,
          )
          .map((repository) => ({
            id: String(repository.id),
            name: repository.name,
            fullName: repository.full_name,
            ownerLogin: repository.owner.login,
            ...(repository.description ? { description: repository.description } : {}),
            private: repository.private,
            defaultBranch: repository.default_branch,
            htmlUrl: repository.html_url,
            cloneUrl: repository.clone_url,
            updatedAt: repository.updated_at,
          }))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      },
    );
  }
}

export interface GitHubAppRuntimeConfig {
  apiBaseUrl?: string;
  appId?: string;
  privateKey?: string;
  privateKeyBase64?: string;
}

export class GitHubApiAppRuntime implements GitHubAppRuntime {
  constructor(
    private readonly config: GitHubAppRuntimeConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createInstallationAccessToken(
    context: ExecutionContext,
    input: { installationId: string },
  ): Promise<Result<GitHubAppInstallationToken>> {
    const jwt = this.createJwt(context);
    if (jwt.isErr()) {
      return err(jwt.error);
    }

    const response = await this.fetcher(
      new URL(
        `/app/installations/${encodeURIComponent(input.installationId)}/access_tokens`,
        this.apiBaseUrl(),
      ),
      {
        method: "POST",
        headers: this.appHeaders(jwt.value),
      },
    );
    if (!response.ok) {
      return err(
        domainError.provider("GitHub App installation token exchange failed", {
          phase: "github-app-token-exchange",
          status: response.status,
        }),
      );
    }

    const payload = (await response.json()) as GitHubInstallationAccessTokenResponse;
    return ok({
      expiresAt: payload.expires_at,
      token: payload.token,
    });
  }

  async readInstallation(
    context: ExecutionContext,
    input: { installationId: string },
  ): Promise<Result<GitHubAppInstallationReadback>> {
    const jwt = this.createJwt(context);
    if (jwt.isErr()) {
      return err(jwt.error);
    }

    const response = await this.fetcher(
      new URL(`/app/installations/${encodeURIComponent(input.installationId)}`, this.apiBaseUrl()),
      {
        headers: this.appHeaders(jwt.value),
      },
    );
    if (!response.ok) {
      return err(
        domainError.provider("GitHub App installation readback failed", {
          phase: "github-app-installation-readback",
          status: response.status,
        }),
      );
    }

    const payload = (await response.json()) as GitHubInstallationApiRecord;
    return ok({
      installationId: String(payload.id),
      ...(payload.account?.id ? { accountId: String(payload.account.id) } : {}),
      ...(payload.account?.login ? { accountLogin: payload.account.login } : {}),
      ...(payload.account?.type ? { accountType: payload.account.type } : {}),
      ...(payload.repository_selection
        ? { repositoriesSelection: payload.repository_selection }
        : {}),
      ...(payload.suspended_at ? { suspendedAt: payload.suspended_at } : {}),
    });
  }

  private appHeaders(jwt: string) {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${jwt}`,
      "user-agent": "appaloft-control-plane",
      "x-github-api-version": "2022-11-28",
    };
  }

  private apiBaseUrl() {
    return this.config.apiBaseUrl ?? "https://api.github.com";
  }

  private createJwt(context: ExecutionContext): Result<string> {
    const appId = this.config.appId?.trim();
    const privateKey = normalizeGitHubAppPrivateKey(this.config);
    if (!appId || !privateKey) {
      return err(
        domainError.validation("GitHub App runtime is not configured", {
          phase: "github-app-jwt",
        }),
      );
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
      const payload = base64UrlJson({
        exp: now + 540,
        iat: now - 60,
        iss: appId,
      });
      const signingInput = `${header}.${payload}`;
      const signer = createSign("RSA-SHA256");
      signer.update(signingInput);
      signer.end();
      const signature = signer.sign(privateKey);
      return ok(`${signingInput}.${base64Url(signature)}`);
    } catch (error) {
      return err(
        domainError.provider("GitHub App JWT signing failed", {
          phase: "github-app-jwt",
          requestId: context.requestId,
          message: error instanceof Error ? error.message : "Unknown signing error",
        }),
      );
    }
  }
}

export function createGitHubAppRuntime(
  config: GitHubAppRuntimeConfig,
  fetcher?: typeof fetch,
): GitHubAppRuntime {
  return new GitHubApiAppRuntime(config, fetcher);
}

function normalizeGitHubAppPrivateKey(config: GitHubAppRuntimeConfig): string | null {
  if (config.privateKey?.trim()) {
    return config.privateKey.trim();
  }
  if (!config.privateKeyBase64?.trim()) {
    return null;
  }
  return Buffer.from(config.privateKeyBase64.trim(), "base64").toString("utf8").trim();
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value), "utf8"));
}

function base64Url(value: Buffer): string {
  return value.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createGitHubRepositoryBrowser(
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): GitHubRepositoryBrowser {
  return new GitHubApiRepositoryBrowser(fetcher, apiBaseUrl);
}

interface ActionSourcePackageManifestInput {
  transport: "inline-archive" | "remote-archive-url" | "server-github-fetch";
  sourceFingerprint?: string | undefined;
  configPath: string;
  sourceRoot: string;
  repositoryFullName?: string | undefined;
  revision?: string | undefined;
}

interface ActionSourcePackageConfigReaderInput {
  sourceFingerprint: string;
  configPath: string;
  sourceRoot: string;
  sourcePackage: ActionSourcePackageManifestInput;
  credentials?:
    | {
        githubToken?: string | undefined;
      }
    | undefined;
}

function isSafeGitHubRepositoryFullName(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.trim());
}

function isSafeGitHubRevision(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value.trim());
}

function encodeRepositoryConfigPath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export class GitHubRawActionSourcePackageConfigReader {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly rawBaseUrl = "https://raw.githubusercontent.com",
    private readonly maxConfigBytes = 1_000_000,
  ) {}

  async readConfig(
    input: ActionSourcePackageConfigReaderInput,
  ): Promise<Result<{ text: string; fileName?: string }>> {
    if (input.sourcePackage.transport !== "server-github-fetch") {
      return err(
        domainError.validation(
          "GitHub source package config reader supports only server-github-fetch transport",
          {
            phase: "source-package-validation",
            transport: input.sourcePackage.transport,
          },
        ),
      );
    }

    const repositoryFullName = input.sourcePackage.repositoryFullName?.trim();
    if (!repositoryFullName || !isSafeGitHubRepositoryFullName(repositoryFullName)) {
      return err(
        domainError.validation("GitHub source package requires a safe repositoryFullName", {
          phase: "source-package-validation",
          field: "sourcePackage.repositoryFullName",
        }),
      );
    }

    const revision = input.sourcePackage.revision?.trim();
    if (!revision || !isSafeGitHubRevision(revision)) {
      return err(
        domainError.validation(
          "GitHub source package requires a safe revision SHA or ref without path separators",
          {
            phase: "source-package-validation",
            field: "sourcePackage.revision",
          },
        ),
      );
    }

    const url = new URL(
      `${repositoryFullName}/${encodeURIComponent(revision)}/${encodeRepositoryConfigPath(
        input.configPath,
      )}`,
      `${this.rawBaseUrl.replace(/\/+$/, "")}/`,
    );
    const githubToken = input.credentials?.githubToken?.trim();
    const response = await this.fetcher(url, {
      headers: {
        accept: "text/plain",
        ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
        "user-agent": "appaloft-control-plane",
      },
    });

    if (!response.ok) {
      return err(
        domainError.validation("GitHub source package config could not be fetched", {
          phase: "config-bootstrap",
          reasonCode: "github_source_package_config_fetch_failed",
          status: response.status,
          upstreamStatus: response.status,
          repositoryFullName,
          configPath: input.configPath,
          revision,
          credentialProvided: Boolean(githubToken),
        }),
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > this.maxConfigBytes) {
      return err(
        domainError.validation("GitHub source package config exceeds the maximum supported size", {
          phase: "source-package-validation",
          field: "sourcePackage.configPath",
          maxConfigBytes: this.maxConfigBytes,
        }),
      );
    }

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > this.maxConfigBytes) {
      return err(
        domainError.validation("GitHub source package config exceeds the maximum supported size", {
          phase: "source-package-validation",
          field: "sourcePackage.configPath",
          maxConfigBytes: this.maxConfigBytes,
        }),
      );
    }

    return ok({ text, fileName: input.configPath });
  }
}

export function createGitHubActionSourcePackageConfigReader(
  fetcher?: typeof fetch,
  rawBaseUrl?: string,
): GitHubRawActionSourcePackageConfigReader {
  return new GitHubRawActionSourcePackageConfigReader(fetcher, rawBaseUrl);
}

export interface GitHubSourceEventChangedPathResolverOptions {
  githubAppRuntime?: GitHubAppRuntime;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
}

export class GitHubApiSourceEventChangedPathResolver implements SourceEventChangedPathResolver {
  private readonly fetcher: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: GitHubSourceEventChangedPathResolverOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
  }

  async resolve(
    context: ExecutionContext,
    input: SourceEventChangedPathResolverInput,
  ): Promise<Result<SourceEventChangedPathResolution>> {
    try {
      return await this.resolveFromProvider(context, input);
    } catch {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }
  }

  private async resolveFromProvider(
    context: ExecutionContext,
    input: SourceEventChangedPathResolverInput,
  ): Promise<Result<SourceEventChangedPathResolution>> {
    if (input.sourceKind !== "github" || input.refChangeKind === "deleted") {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }

    const repository = input.sourceIdentity.repositoryFullName
      ? parseRepositoryFullName(input.sourceIdentity.repositoryFullName)
      : null;
    if (!repository) {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }

    let accessToken: string | undefined;
    if (input.providerConnectionId && this.options.githubAppRuntime) {
      const token = await this.options.githubAppRuntime.createInstallationAccessToken(context, {
        installationId: input.providerConnectionId,
      });
      if (token.isErr()) {
        return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
      }
      accessToken = token.value.token;
    }

    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "user-agent": "appaloft-control-plane",
      "x-github-api-version": "2022-11-28",
    };
    if (accessToken) {
      headers.authorization = `Bearer ${accessToken}`;
    }

    if (input.refChangeKind === "created") {
      return this.resolveCreatedRef(repository, input.revision, headers);
    }
    if (!input.beforeRevision) {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }
    return this.resolveUpdatedRef(repository, input.beforeRevision, input.revision, headers);
  }

  private async resolveUpdatedRef(
    repository: { owner: string; name: string },
    beforeRevision: string,
    revision: string,
    headers: Record<string, string>,
  ): Promise<Result<SourceEventChangedPathResolution>> {
    const url = gitHubApiUrl(
      this.apiBaseUrl,
      `/repos/${repository.owner}/${repository.name}/compare/${encodeURIComponent(
        beforeRevision,
      )}...${encodeURIComponent(revision)}?per_page=100&page=1`,
    );
    const response = await this.fetcher(url, { headers });
    if (!response.ok) {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }

    const payload = objectRecord(await response.json());
    const files = payload && Array.isArray(payload.files) ? payload.files : null;
    if (!files) {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }
    if (files.length >= 300) {
      return ok({ status: "unavailable", reason: "provider-compare-truncated" });
    }

    const changedPaths: string[] = [];
    for (const value of files) {
      const file = objectRecord(value);
      const filename = file ? safeRepositoryPath(file.filename) : null;
      const previousFilename = file ? safeRepositoryPath(file.previous_filename) : null;
      if (!filename) {
        return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
      }
      changedPaths.push(filename);
      if (previousFilename) changedPaths.push(previousFilename);
    }

    return ok({ status: "resolved", changedPaths: [...new Set(changedPaths)] });
  }

  private async resolveCreatedRef(
    repository: { owner: string; name: string },
    revision: string,
    headers: Record<string, string>,
  ): Promise<Result<SourceEventChangedPathResolution>> {
    const url = gitHubApiUrl(
      this.apiBaseUrl,
      `/repos/${repository.owner}/${repository.name}/git/trees/${encodeURIComponent(
        revision,
      )}?recursive=1`,
    );
    const response = await this.fetcher(url, { headers });
    if (!response.ok) {
      return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
    }

    const payload = objectRecord(await response.json());
    const tree = payload && Array.isArray(payload.tree) ? payload.tree : null;
    if (!tree || payload?.truncated === true) {
      return ok({
        status: "unavailable",
        reason:
          payload?.truncated === true
            ? "provider-compare-truncated"
            : "provider-compare-unavailable",
      });
    }

    const changedPaths: string[] = [];
    for (const value of tree) {
      const entry = objectRecord(value);
      const type = entry ? nonEmptyString(entry.type) : null;
      if (type === "tree") continue;
      const path = entry ? safeRepositoryPath(entry.path) : null;
      if (!path) {
        return ok({ status: "unavailable", reason: "provider-compare-unavailable" });
      }
      changedPaths.push(path);
      if (changedPaths.length > 300) {
        return ok({ status: "unavailable", reason: "provider-compare-truncated" });
      }
    }

    return ok({ status: "resolved", changedPaths });
  }
}

export function createGitHubSourceEventChangedPathResolver(
  options: GitHubSourceEventChangedPathResolverOptions = {},
): SourceEventChangedPathResolver {
  return new GitHubApiSourceEventChangedPathResolver(options);
}

function safeRepositoryPath(value: unknown): string | null {
  const path = nonEmptyString(value);
  if (
    !path ||
    path.length > 1024 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\r\n\0]/.test(path) ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return path;
}

export class GitHubWebhookSourceEventVerifier implements GitHubSourceEventWebhookVerifier {
  async verify(
    _context: ExecutionContext,
    input: GitHubSourceEventWebhookVerificationInput,
  ): Promise<Result<GitHubSourceEventWebhookVerificationResult>> {
    const expectedSignature = await hmacSha256Hex(input.secretValue, input.rawBody);
    const suppliedSignature = normalizeSha256Signature(input.signature);
    if (!suppliedSignature || !constantTimeEqualHex(expectedSignature, suppliedSignature)) {
      return err(
        domainError.sourceEventSignatureInvalid("Source event signature is invalid", {
          phase: "source-event-verification",
          sourceKind: "github",
          eventKind: input.eventName,
          ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        }),
      );
    }

    if (input.eventName === "ping") {
      return ok({ outcome: "noop" });
    }

    if (input.eventName !== "push") {
      return err(
        domainError.sourceEventUnsupportedKind("GitHub source event kind is unsupported", {
          phase: "source-event-normalization",
          sourceKind: "github",
          eventKind: input.eventName,
          ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        }),
      );
    }

    const payload = parseGitHubPushPayload(input.rawBody, input.deliveryId);
    if (payload.isErr()) {
      return err(payload.error);
    }

    return ok({
      outcome: "source-event",
      sourceEvent: {
        sourceKind: "github",
        eventKind: "push",
        sourceIdentity: {
          locator: payload.value.locator,
          providerRepositoryId: payload.value.providerRepositoryId,
          repositoryFullName: payload.value.repositoryFullName,
        },
        ref: normalizeGitHubRef(payload.value.ref),
        revision: payload.value.revision,
        ...(payload.value.beforeRevision ? { beforeRevision: payload.value.beforeRevision } : {}),
        refChangeKind: payload.value.refChangeKind,
        forced: payload.value.forced,
        ...(payload.value.providerConnectionId
          ? { providerConnectionId: payload.value.providerConnectionId }
          : {}),
        ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        verification: {
          status: "verified",
          method: "provider-signature",
        },
        ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
  }
}

export function createGitHubSourceEventWebhookVerifier(): GitHubSourceEventWebhookVerifier {
  return new GitHubWebhookSourceEventVerifier();
}

export class GitHubPreviewPullRequestWebhookVerifierImpl
  implements GitHubPreviewPullRequestWebhookVerifier
{
  async verify(
    _context: ExecutionContext,
    input: GitHubPreviewPullRequestWebhookVerificationInput,
  ): Promise<Result<GitHubPreviewPullRequestWebhookVerificationResult>> {
    const expectedSignature = await hmacSha256Hex(input.secretValue, input.rawBody);
    const suppliedSignature = normalizeSha256Signature(input.signature);
    if (!suppliedSignature || !constantTimeEqualHex(expectedSignature, suppliedSignature)) {
      return err(
        domainError.sourceEventSignatureInvalid("Preview pull request signature is invalid", {
          phase: "preview-webhook-verification",
          sourceKind: "github",
          eventKind: input.eventName,
          ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        }),
      );
    }

    if (input.eventName === "ping") {
      return ok({ outcome: "noop" });
    }

    if (input.eventName !== "pull_request") {
      return err(
        domainError.sourceEventUnsupportedKind("GitHub preview event kind is unsupported", {
          phase: "preview-webhook-verification",
          sourceKind: "github",
          eventKind: input.eventName,
          ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        }),
      );
    }

    const payload = parseGitHubPullRequestPayload(input.rawBody, input.deliveryId);
    if (payload.isErr()) {
      return err(payload.error);
    }

    return ok({
      outcome: "preview-pull-request-event",
      previewEvent: {
        provider: "github",
        eventKind: "pull-request",
        eventAction: payload.value.action,
        repositoryFullName: payload.value.repositoryFullName,
        ...(payload.value.providerRepositoryId
          ? { providerRepositoryId: payload.value.providerRepositoryId }
          : {}),
        ...(payload.value.installationId ? { installationId: payload.value.installationId } : {}),
        headRepositoryFullName: payload.value.headRepositoryFullName,
        pullRequestNumber: payload.value.pullRequestNumber,
        headSha: payload.value.headSha,
        baseRef: payload.value.baseRef,
        verified: true,
        ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
        ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
      },
    });
  }
}

export function createGitHubPreviewPullRequestWebhookVerifier(): GitHubPreviewPullRequestWebhookVerifier {
  return new GitHubPreviewPullRequestWebhookVerifierImpl();
}

export class GitHubPreviewPrCommentFeedbackWriter implements PreviewFeedbackWriter {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("github_preview_feedback", "publish_pr_comment"),
      {
        attributes: {
          [appaloftTraceAttributes.integrationKey]: "github",
          "appaloft.preview_feedback.channel": input.channel,
        },
      },
      async () => {
        if (input.channel !== "github-pr-comment") {
          return err(
            domainError.providerCapabilityUnsupported(
              "GitHub preview feedback channel is not supported by this writer",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
              },
            ),
          );
        }

        const repository = parseRepositoryFullName(input.repositoryFullName);
        if (!repository) {
          return err(
            domainError.validation("GitHub repository full name is invalid", {
              phase: "preview-feedback",
              provider: "github",
            }),
          );
        }

        const url = input.providerFeedbackId
          ? gitHubApiUrl(
              this.apiBaseUrl,
              `/repos/${repository.owner}/${repository.name}/issues/comments/${encodeURIComponent(
                input.providerFeedbackId,
              )}`,
            )
          : gitHubApiUrl(
              this.apiBaseUrl,
              `/repos/${repository.owner}/${repository.name}/issues/${input.pullRequestNumber}/comments`,
            );
        const response = await this.fetcher(url, {
          method: input.providerFeedbackId ? "PATCH" : "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${this.accessToken}`,
            "content-type": "application/json",
            "user-agent": "appaloft-control-plane",
            "x-github-api-version": "2022-11-28",
          },
          body: JSON.stringify({ body: input.body }),
        });

        if (!response.ok) {
          return err(
            domainError.provider(
              "GitHub preview feedback request failed",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
                statusCode: response.status,
              },
              isRetryableGitHubStatus(response.status),
            ),
          );
        }

        const payload = objectRecord(await response.json().catch(() => null));
        const providerFeedbackId =
          typeof payload?.id === "number" || typeof payload?.id === "string"
            ? String(payload.id)
            : input.providerFeedbackId;
        if (!providerFeedbackId) {
          return err(
            domainError.provider(
              "GitHub preview feedback response did not include a comment id",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
                statusCode: response.status,
              },
              true,
            ),
          );
        }

        return ok({ providerFeedbackId });
      },
    );
  }
}

type GitHubRepositoryParts = NonNullable<ReturnType<typeof parseRepositoryFullName>>;

export class GitHubPreviewCheckRunFeedbackWriter implements PreviewFeedbackWriter {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("github_preview_feedback", "publish_check_run"),
      {
        attributes: {
          [appaloftTraceAttributes.integrationKey]: "github",
          "appaloft.preview_feedback.channel": input.channel,
        },
      },
      async () => {
        if (input.channel !== "github-check") {
          return err(
            domainError.providerCapabilityUnsupported(
              "GitHub preview feedback channel is not supported by this writer",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
              },
            ),
          );
        }

        const repository = parseRepositoryFullName(input.repositoryFullName);
        if (!repository) {
          return err(
            domainError.validation("GitHub repository full name is invalid", {
              phase: "preview-feedback",
              provider: "github",
            }),
          );
        }

        let headSha: string | undefined;
        if (!input.providerFeedbackId) {
          const resolvedHeadSha = await this.resolvePullRequestHeadSha(repository, input);
          if (resolvedHeadSha.isErr()) {
            return err(resolvedHeadSha.error);
          }
          headSha = resolvedHeadSha.value;
        }

        const url = input.providerFeedbackId
          ? gitHubApiUrl(
              this.apiBaseUrl,
              `/repos/${repository.owner}/${repository.name}/check-runs/${encodeURIComponent(
                input.providerFeedbackId,
              )}`,
            )
          : gitHubApiUrl(
              this.apiBaseUrl,
              `/repos/${repository.owner}/${repository.name}/check-runs`,
            );
        const response = await this.fetcher(url, {
          method: input.providerFeedbackId ? "PATCH" : "POST",
          headers: githubJsonHeaders(this.accessToken),
          body: JSON.stringify({
            name: "Appaloft preview",
            ...(headSha ? { head_sha: headSha } : {}),
            status: "completed",
            conclusion: "success",
            output: {
              title: "Preview deployment accepted",
              summary: input.body,
            },
          }),
        });

        if (!response.ok) {
          return err(
            domainError.provider(
              "GitHub preview check run request failed",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
                statusCode: response.status,
              },
              isRetryableGitHubStatus(response.status),
            ),
          );
        }

        const payload = objectRecord(await response.json().catch(() => null));
        const providerFeedbackId =
          typeof payload?.id === "number" || typeof payload?.id === "string"
            ? String(payload.id)
            : input.providerFeedbackId;
        if (!providerFeedbackId) {
          return err(
            domainError.provider(
              "GitHub preview check run response did not include a check run id",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
                statusCode: response.status,
              },
              true,
            ),
          );
        }

        return ok({ providerFeedbackId });
      },
    );
  }

  private async resolvePullRequestHeadSha(
    repository: GitHubRepositoryParts,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<string>> {
    const response = await this.fetcher(
      gitHubApiUrl(
        this.apiBaseUrl,
        `/repos/${repository.owner}/${repository.name}/pulls/${input.pullRequestNumber}`,
      ),
      {
        method: "GET",
        headers: githubJsonHeaders(this.accessToken),
      },
    );
    if (!response.ok) {
      return err(
        domainError.provider(
          "GitHub preview pull request lookup failed",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
            statusCode: response.status,
          },
          isRetryableGitHubStatus(response.status),
        ),
      );
    }

    const payload = objectRecord(await response.json().catch(() => null));
    const head = payload ? objectRecord(payload.head) : null;
    const sha = head ? nonEmptyString(head.sha) : null;
    if (!sha) {
      return err(
        domainError.provider(
          "GitHub preview pull request lookup did not include a head SHA",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
            statusCode: response.status,
          },
          true,
        ),
      );
    }

    return ok(sha);
  }
}

export class GitHubPreviewDeploymentStatusFeedbackWriter implements PreviewFeedbackWriter {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("github_preview_feedback", "publish_deployment_status"),
      {
        attributes: {
          [appaloftTraceAttributes.integrationKey]: "github",
          "appaloft.preview_feedback.channel": input.channel,
        },
      },
      async () => {
        if (input.channel !== "github-deployment-status") {
          return err(
            domainError.providerCapabilityUnsupported(
              "GitHub preview feedback channel is not supported by this writer",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
              },
            ),
          );
        }

        const repository = parseRepositoryFullName(input.repositoryFullName);
        if (!repository) {
          return err(
            domainError.validation("GitHub repository full name is invalid", {
              phase: "preview-feedback",
              provider: "github",
            }),
          );
        }

        let deploymentId = input.providerFeedbackId ?? input.providerDeploymentId;
        if (!deploymentId) {
          const createdDeployment = await this.createDeployment(repository, input);
          if (createdDeployment.isErr()) {
            return err(createdDeployment.error);
          }
          deploymentId = createdDeployment.value;
        }
        if (!deploymentId) {
          return err(
            domainError.provider(
              "GitHub preview deployment creation did not return a deployment id",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
              },
              true,
            ),
          );
        }

        const response = await this.fetcher(
          gitHubApiUrl(
            this.apiBaseUrl,
            `/repos/${repository.owner}/${repository.name}/deployments/${encodeURIComponent(
              deploymentId,
            )}/statuses`,
          ),
          {
            method: "POST",
            headers: githubJsonHeaders(this.accessToken),
            body: JSON.stringify({
              state: input.deploymentStatusState ?? "success",
              description:
                input.deploymentStatusState === "inactive"
                  ? "Appaloft preview cleanup completed"
                  : "Appaloft preview deployment accepted",
              environment: "preview",
              auto_inactive: false,
            }),
          },
        );

        if (!response.ok) {
          return err(
            domainError.provider(
              "GitHub preview deployment status request failed",
              {
                phase: "preview-feedback",
                provider: "github",
                channel: input.channel,
                statusCode: response.status,
              },
              isRetryableGitHubStatus(response.status),
            ),
          );
        }

        await response.json().catch(() => null);

        return ok({ providerFeedbackId: deploymentId });
      },
    );
  }

  private async createDeployment(
    repository: GitHubRepositoryParts,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<string>> {
    const headSha = await this.resolvePullRequestHeadSha(repository, input);
    if (headSha.isErr()) {
      return err(headSha.error);
    }

    const response = await this.fetcher(
      gitHubApiUrl(this.apiBaseUrl, `/repos/${repository.owner}/${repository.name}/deployments`),
      {
        method: "POST",
        headers: githubJsonHeaders(this.accessToken),
        body: JSON.stringify({
          ref: headSha.value,
          environment: "preview",
          description: "Appaloft preview deployment",
          auto_merge: false,
          required_contexts: [],
          transient_environment: true,
          production_environment: false,
        }),
      },
    );

    if (!response.ok) {
      return err(
        domainError.provider(
          "GitHub preview deployment creation failed",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
            statusCode: response.status,
          },
          isRetryableGitHubStatus(response.status),
        ),
      );
    }

    const payload = objectRecord(await response.json().catch(() => null));
    const deploymentId =
      typeof payload?.id === "number" || typeof payload?.id === "string"
        ? String(payload.id)
        : undefined;

    return deploymentId
      ? ok(deploymentId)
      : err(
          domainError.provider(
            "GitHub preview deployment creation response did not include a deployment id",
            {
              phase: "preview-feedback",
              provider: "github",
              channel: input.channel,
              statusCode: response.status,
            },
            true,
          ),
        );
  }

  private async resolvePullRequestHeadSha(
    repository: GitHubRepositoryParts,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<string>> {
    const response = await this.fetcher(
      gitHubApiUrl(
        this.apiBaseUrl,
        `/repos/${repository.owner}/${repository.name}/pulls/${input.pullRequestNumber}`,
      ),
      {
        method: "GET",
        headers: githubJsonHeaders(this.accessToken),
      },
    );
    if (!response.ok) {
      return err(
        domainError.provider(
          "GitHub preview pull request lookup failed",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
            statusCode: response.status,
          },
          isRetryableGitHubStatus(response.status),
        ),
      );
    }

    const payload = objectRecord(await response.json().catch(() => null));
    const head = payload ? objectRecord(payload.head) : null;
    const sha = head ? nonEmptyString(head.sha) : null;
    if (!sha) {
      return err(
        domainError.provider(
          "GitHub preview pull request lookup did not include a head SHA",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
            statusCode: response.status,
          },
          true,
        ),
      );
    }

    return ok(sha);
  }
}

export class GitHubPreviewCompositeFeedbackWriter implements PreviewFeedbackWriter {
  private readonly prCommentWriter: PreviewFeedbackWriter;
  private readonly checkRunWriter: PreviewFeedbackWriter;
  private readonly deploymentStatusWriter: PreviewFeedbackWriter;

  constructor(
    accessToken: string,
    fetcher: typeof fetch = fetch,
    apiBaseUrl = "https://api.github.com",
  ) {
    this.prCommentWriter = new GitHubPreviewPrCommentFeedbackWriter(
      accessToken,
      fetcher,
      apiBaseUrl,
    );
    this.checkRunWriter = new GitHubPreviewCheckRunFeedbackWriter(accessToken, fetcher, apiBaseUrl);
    this.deploymentStatusWriter = new GitHubPreviewDeploymentStatusFeedbackWriter(
      accessToken,
      fetcher,
      apiBaseUrl,
    );
  }

  publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    if (input.channel === "github-pr-comment") {
      return this.prCommentWriter.publish(context, input);
    }

    if (input.channel === "github-check") {
      return this.checkRunWriter.publish(context, input);
    }

    if (input.channel === "github-deployment-status") {
      return this.deploymentStatusWriter.publish(context, input);
    }

    return Promise.resolve(
      err(
        domainError.providerCapabilityUnsupported(
          "GitHub preview feedback channel is not supported by this writer",
          {
            phase: "preview-feedback",
            provider: "github",
            channel: input.channel,
          },
        ),
      ),
    );
  }
}

export function createGitHubPreviewPrCommentFeedbackWriter(
  accessToken: string,
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): PreviewFeedbackWriter {
  return new GitHubPreviewPrCommentFeedbackWriter(accessToken, fetcher, apiBaseUrl);
}

export function createGitHubPreviewCheckRunFeedbackWriter(
  accessToken: string,
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): PreviewFeedbackWriter {
  return new GitHubPreviewCheckRunFeedbackWriter(accessToken, fetcher, apiBaseUrl);
}

export function createGitHubPreviewDeploymentStatusFeedbackWriter(
  accessToken: string,
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): PreviewFeedbackWriter {
  return new GitHubPreviewDeploymentStatusFeedbackWriter(accessToken, fetcher, apiBaseUrl);
}

export function createGitHubPreviewFeedbackWriter(
  accessToken: string,
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): PreviewFeedbackWriter {
  return new GitHubPreviewCompositeFeedbackWriter(accessToken, fetcher, apiBaseUrl);
}

interface GitHubPushPayloadFacts {
  locator: string;
  providerRepositoryId: string;
  repositoryFullName: string;
  ref: string;
  revision: string;
  beforeRevision?: string;
  refChangeKind: "created" | "updated" | "deleted";
  forced: boolean;
  providerConnectionId?: string;
}

interface GitHubPullRequestPayloadFacts {
  action: GitHubPreviewPullRequestAction;
  repositoryFullName: string;
  providerRepositoryId?: string;
  installationId?: string;
  headRepositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseRef: string;
}

function parseGitHubPushPayload(
  rawBody: string,
  deliveryId: string | undefined,
): Result<GitHubPushPayloadFacts> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return err(
      domainError.validation("GitHub source event body must be valid JSON", {
        phase: "source-event-normalization",
        sourceKind: "github",
        ...(deliveryId ? { deliveryId } : {}),
      }),
    );
  }

  const payload = objectRecord(parsedJson);
  const repository = payload ? objectRecord(payload.repository) : null;
  const repositoryId = repository ? repository.id : undefined;
  const repositoryIdValue =
    typeof repositoryId === "number" || typeof repositoryId === "string"
      ? String(repositoryId)
      : null;
  const repositoryFullName = repository ? nonEmptyString(repository.full_name) : null;
  const locator =
    (repository ? nonEmptyString(repository.clone_url) : null) ??
    (repository ? nonEmptyString(repository.html_url) : null);
  const ref = payload ? nonEmptyString(payload.ref) : null;
  const before = payload ? nonEmptyString(payload.before) : null;
  const after = payload ? nonEmptyString(payload.after) : null;
  const created = payload && typeof payload.created === "boolean" ? payload.created : null;
  const deleted = payload && typeof payload.deleted === "boolean" ? payload.deleted : null;
  const forced = payload && typeof payload.forced === "boolean" ? payload.forced : null;
  const installation = payload ? objectRecord(payload.installation) : null;
  const installationId = installation ? installation.id : undefined;
  const providerConnectionId =
    typeof installationId === "number" || typeof installationId === "string"
      ? String(installationId)
      : null;

  if (
    !repositoryIdValue ||
    !repositoryFullName ||
    !locator ||
    !ref ||
    !before ||
    !after ||
    created === null ||
    deleted === null ||
    forced === null ||
    (created && deleted) ||
    (created && isZeroGitSha(after)) ||
    (deleted && isZeroGitSha(before)) ||
    (!created && !deleted && (isZeroGitSha(before) || isZeroGitSha(after)))
  ) {
    return err(
      domainError.validation("GitHub source event body is invalid", {
        phase: "source-event-normalization",
        sourceKind: "github",
        ...(deliveryId ? { deliveryId } : {}),
      }),
    );
  }

  return ok({
    locator,
    providerRepositoryId: repositoryIdValue,
    repositoryFullName,
    ref,
    revision: deleted ? before : after,
    ...(!created ? { beforeRevision: before } : {}),
    refChangeKind: created ? "created" : deleted ? "deleted" : "updated",
    forced,
    ...(providerConnectionId ? { providerConnectionId } : {}),
  });
}

function isZeroGitSha(value: string): boolean {
  return /^0{40}$/.test(value);
}

function parseGitHubPullRequestPayload(
  rawBody: string,
  deliveryId: string | undefined,
): Result<GitHubPullRequestPayloadFacts> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return err(
      domainError.validation("GitHub preview event body must be valid JSON", {
        phase: "preview-webhook-normalization",
        sourceKind: "github",
        ...(deliveryId ? { deliveryId } : {}),
      }),
    );
  }

  const payload = objectRecord(parsedJson);
  const action = payload ? previewPullRequestAction(payload.action) : null;
  if (payload && !action) {
    return err(
      domainError.sourceEventUnsupportedKind("GitHub preview pull request action is unsupported", {
        phase: "preview-webhook-normalization",
        sourceKind: "github",
        eventKind: "pull_request",
        ...(deliveryId ? { deliveryId } : {}),
      }),
    );
  }

  const pullRequest = payload ? objectRecord(payload.pull_request) : null;
  const repository = payload ? objectRecord(payload.repository) : null;
  const head = pullRequest ? objectRecord(pullRequest.head) : null;
  const headRepository = head ? objectRecord(head.repo) : null;
  const base = pullRequest ? objectRecord(pullRequest.base) : null;
  const repositoryFullName = repository ? nonEmptyString(repository.full_name) : null;
  const headRepositoryFullName = headRepository ? nonEmptyString(headRepository.full_name) : null;
  const repositoryId =
    repository && (typeof repository.id === "number" || typeof repository.id === "string")
      ? String(repository.id)
      : null;
  const installation = payload ? objectRecord(payload.installation) : null;
  const installationId =
    installation && (typeof installation.id === "number" || typeof installation.id === "string")
      ? String(installation.id)
      : null;
  const pullRequestNumber = payload ? positiveInteger(payload.number) : null;
  const headSha = head ? nonEmptyString(head.sha) : null;
  const baseRef = base ? nonEmptyString(base.ref) : null;

  if (
    !action ||
    !repositoryFullName ||
    !headRepositoryFullName ||
    pullRequestNumber === null ||
    !headSha ||
    !baseRef
  ) {
    return err(
      domainError.validation("GitHub preview event body is invalid", {
        phase: "preview-webhook-normalization",
        sourceKind: "github",
        ...(deliveryId ? { deliveryId } : {}),
      }),
    );
  }

  return ok({
    action,
    repositoryFullName,
    ...(repositoryId ? { providerRepositoryId: repositoryId } : {}),
    ...(installationId ? { installationId } : {}),
    headRepositoryFullName,
    pullRequestNumber,
    headSha,
    baseRef,
  });
}

function previewPullRequestAction(value: unknown): GitHubPreviewPullRequestAction | null {
  return value === "opened" || value === "reopened" || value === "synchronize" || value === "closed"
    ? value
    : null;
}

function normalizeGitHubRef(ref: string): string {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/tags/")) {
    return ref.slice("refs/tags/".length);
  }

  return ref;
}

function parseRepositoryFullName(value: string): { owner: string; name: string } | null {
  const [owner, name, ...extra] = value.split("/");
  if (!owner || !name || extra.length > 0) {
    return null;
  }

  return {
    owner: encodeURIComponent(owner),
    name: encodeURIComponent(name),
  };
}

function gitHubApiUrl(apiBaseUrl: string, path: string): URL {
  return new URL(path, apiBaseUrl);
}

function githubJsonHeaders(accessToken: string): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": "appaloft-control-plane",
    "x-github-api-version": "2022-11-28",
  };
}

function isRetryableGitHubStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function hmacSha256Hex(secretValue: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(new Uint8Array(signature));
}

function normalizeSha256Signature(signature: string): string | null {
  const trimmed = signature.trim().toLowerCase();
  const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
  return /^[a-f0-9]{64}$/.test(withoutPrefix) ? withoutPrefix : null;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes.at(index) ?? 0) ^ (rightBytes.at(index) ?? 0);
  }

  return difference === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/.test(hex) || hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
