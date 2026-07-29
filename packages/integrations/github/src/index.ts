import { createSign } from "node:crypto";
import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type ExecutionContext,
  type ExecutionSandboxService,
  type GitHubAgentFeedbackPort,
  type GitHubAgentFeedbackState,
  type GitHubAgentReviewDeliveryPort,
  type GitHubAgentReviewDeliveryResult,
  type GitHubAgentTaskSummary,
  type GitHubAgentTrigger,
  type GitHubAgentTriggerSourceResolverPort,
  type GitHubAppInstallationReadback,
  type GitHubAppInstallationToken,
  type GitHubAppRuntime,
  type GitHubPreviewPullRequestAction,
  type GitHubPreviewPullRequestWebhookVerificationInput,
  type GitHubPreviewPullRequestWebhookVerificationResult,
  type GitHubPreviewPullRequestWebhookVerifier,
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type GitHubRepositoryWorkspaceMaterializerPort,
  type GitHubSourceEventWebhookVerificationInput,
  type GitHubSourceEventWebhookVerificationResult,
  type GitHubSourceEventWebhookVerifier,
  type IntegrationDescriptor,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
  type SandboxExecResult,
  type SourceEventChangedPathResolution,
  type SourceEventChangedPathResolver,
  type SourceEventChangedPathResolverInput,
  type VerifiedSourceEventInput,
} from "@appaloft/application";
import { ash } from "@appaloft/ash";
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

export interface GitHubRepositoryActorReadback {
  readonly githubUserId: string;
  readonly loginSnapshot: string;
  readonly permission: "admin" | "maintain" | "push" | "triage" | "pull" | "none";
  readonly organizationMember: boolean;
}

export interface GitHubRepositoryPermissionReader {
  read(input: {
    readonly installationId: string;
    readonly repositoryFullName: string;
    readonly githubUserId: string;
  }): Promise<Result<GitHubRepositoryActorReadback>>;
}

export class GitHubApiRepositoryPermissionReader implements GitHubRepositoryPermissionReader {
  constructor(
    private readonly accessToken: (installationId: string) => Promise<string | null>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async read(input: {
    installationId: string;
    repositoryFullName: string;
    githubUserId: string;
  }): Promise<Result<GitHubRepositoryActorReadback>> {
    if (!/^[1-9]\d*$/u.test(input.githubUserId)) {
      return err(domainError.validation("GitHub sender id must be numeric"));
    }
    const token = await this.accessToken(input.installationId);
    if (!token) {
      return err(
        domainError.conflict("GitHub installation credential is unavailable", {
          code: "github_installation_credential_missing",
        }),
      );
    }
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "appaloft-github-agent",
    };
    const userResponse = await this.fetcher(
      `${this.apiBaseUrl}/user/${encodeURIComponent(input.githubUserId)}`,
      { headers },
    );
    if (!userResponse.ok) {
      return err(
        domainError.conflict("GitHub sender identity could not be verified", {
          code: "github_sender_readback_failed",
          status: userResponse.status,
        }),
      );
    }
    const user = objectRecord(await userResponse.json());
    if (!user || String(user.id) !== input.githubUserId || typeof user.login !== "string") {
      return err(
        domainError.conflict("GitHub sender identity readback did not match the webhook", {
          code: "github_sender_readback_mismatch",
        }),
      );
    }
    const repository = parseRepositoryFullName(input.repositoryFullName);
    if (!repository) {
      return err(domainError.validation("GitHub repository full name is invalid"));
    }
    const permissionResponse = await this.fetcher(
      `${this.apiBaseUrl}/repos/${repository.owner}/${repository.name}/collaborators/${encodeURIComponent(user.login)}/permission`,
      { headers },
    );
    if (!permissionResponse.ok) {
      return err(
        domainError.conflict("GitHub repository permission could not be verified", {
          code: "github_repository_permission_readback_failed",
          status: permissionResponse.status,
        }),
      );
    }
    const permissionPayload = objectRecord(await permissionResponse.json());
    const permission = normalizeGitHubRepositoryPermission(
      typeof permissionPayload?.permission === "string" ? permissionPayload.permission : "",
    );
    const membershipResponse = await this.fetcher(
      `${this.apiBaseUrl}/orgs/${repository.owner}/members/${encodeURIComponent(user.login)}`,
      { headers },
    );
    if (membershipResponse.status !== 204 && membershipResponse.status !== 404) {
      return err(
        domainError.conflict("GitHub organization membership could not be verified", {
          code: "github_organization_membership_readback_failed",
          status: membershipResponse.status,
        }),
      );
    }
    return ok({
      githubUserId: input.githubUserId,
      loginSnapshot: user.login,
      permission,
      organizationMember: membershipResponse.status === 204,
    });
  }
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

export type AppaloftGitHubCommand =
  | { kind: "fix"; instruction?: string }
  | { kind: "review"; instruction?: string }
  | { kind: "status" }
  | { kind: "steer"; instruction: string }
  | { kind: "stop" }
  | { kind: "resume" }
  | { kind: "new"; profile: string };

export type GitHubAgentEventName =
  | "issue_comment"
  | "pull_request_review_comment"
  | "issues"
  | "pull_request";

export type GitHubAgentEventAction =
  | "created"
  | "labeled"
  | "ready_for_review"
  | "synchronize"
  | "closed";

export interface GitHubAgentWebhookInput {
  eventName: string;
  deliveryId: string;
  rawBody: string;
  signature: string;
  secretValue: string;
  receivedAt?: string;
}

export interface GitHubWebhookSignatureInput {
  rawBody: string;
  signature: string;
  secretValue: string;
  eventName?: string;
  deliveryId?: string;
}

export interface NormalizedGitHubAgentEvent {
  provider: "github";
  event: GitHubAgentEventName;
  action: GitHubAgentEventAction;
  deliveryId: string;
  installationId: string;
  repository: {
    id: string;
    fullName: string;
    ownerId?: string;
    private?: boolean;
    defaultBranch?: string;
  };
  sender: {
    id: string;
    loginSnapshot?: string;
    typeSnapshot?: string;
  };
  thread: {
    kind: "issue" | "pull-request";
    number: number;
  };
  comment?: {
    id: string;
    command?: AppaloftGitHubCommand;
    path?: string;
    line?: number;
  };
  label?: {
    id?: string;
    name: string;
  };
  pullRequest?: {
    number: number;
    headSha: string;
    baseRef: string;
    headRepositoryId: string;
    headRepositoryFullName: string;
    fork: boolean;
  };
  receivedAt?: string;
}

const appaloftCommandPrefix = "@appaloft";
const appaloftCommandInstructionLimit = 4_096;
const githubCommentBodyLimit = 65_536;
const sensitiveCommandText =
  /(?:\b(?:api[_-]?key|password|private[_-]?key|secret|token|credential(?:connection)?id)\b\s*[:=]|\b[A-Z][A-Z0-9_]{2,}\s*=|\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{12,}))/iu;
const credentialSelectionText =
  /(?:--(?:credential|api-key|env|environment|model)\b|\b(?:credential|connection)[_-]?(?:id|ref)\b)/iu;
const profileSlug = /^[a-z0-9](?:[a-z0-9.-]{0,78}[a-z0-9])?$/u;

export function parseAppaloftGitHubCommand(body: string): Result<AppaloftGitHubCommand> {
  if (body.length > githubCommentBodyLimit) {
    return err(domainError.validation("GitHub command body is too long"));
  }

  const withoutFencedCode = body.replace(/```[\s\S]*?```/gu, "");
  const commandLines = withoutFencedCode
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith(`${appaloftCommandPrefix} `));

  if (commandLines.length !== 1) {
    return err(
      domainError.validation(
        commandLines.length === 0
          ? "GitHub comment does not contain one Appaloft command"
          : "GitHub comment must contain exactly one Appaloft command",
      ),
    );
  }

  const commandLine = commandLines[0] ?? "";
  if (sensitiveCommandText.test(commandLine) || credentialSelectionText.test(commandLine)) {
    return err(
      domainError.validation(
        "GitHub commands cannot contain credentials, secret material, or environment assignments",
      ),
    );
  }

  const commandText = commandLine.slice(appaloftCommandPrefix.length).trim();
  const separator = commandText.search(/\s/u);
  const verb = (separator === -1 ? commandText : commandText.slice(0, separator)).toLowerCase();
  const rest = separator === -1 ? "" : commandText.slice(separator).trim();
  if (rest.length > appaloftCommandInstructionLimit) {
    return err(domainError.validation("GitHub command instruction is too long"));
  }

  switch (verb) {
    case "fix":
    case "review":
      if (rest.startsWith("--")) {
        return err(domainError.validation(`@appaloft ${verb} does not accept flags`));
      }
      return ok(rest ? { kind: verb, instruction: rest } : { kind: verb });
    case "steer":
      return rest
        ? ok({ kind: "steer", instruction: rest })
        : err(domainError.validation("@appaloft steer requires an instruction"));
    case "status":
    case "stop":
    case "resume":
      return rest
        ? err(domainError.validation(`@appaloft ${verb} does not accept arguments`))
        : ok({ kind: verb });
    case "new": {
      const match = /^--profile\s+([a-z0-9.-]+)$/u.exec(rest);
      if (!match?.[1] || !profileSlug.test(match[1])) {
        return err(
          domainError.validation("@appaloft new requires exactly --profile <allowed-profile-slug>"),
        );
      }
      return ok({ kind: "new", profile: match[1] });
    }
    default:
      return err(
        domainError.validation(`Unsupported Appaloft GitHub command ${verb || "(empty)"}`),
      );
  }
}

export async function verifyAndNormalizeGitHubAgentWebhook(
  input: GitHubAgentWebhookInput,
): Promise<Result<NormalizedGitHubAgentEvent>> {
  const verified = await verifyGitHubWebhookSignature(input);
  if (verified.isErr()) return err(verified.error);

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return err(domainError.validation("GitHub Agent webhook body must be valid JSON"));
  }

  const payload = objectRecord(parsed);
  if (!payload) {
    return err(domainError.validation("GitHub Agent webhook body must be an object"));
  }

  const event = githubAgentEventName(input.eventName);
  const action = githubAgentEventAction(event, payload.action);
  const deliveryId = boundedText(input.deliveryId, 256);
  const installation = objectRecord(payload.installation);
  const repository = objectRecord(payload.repository);
  const sender = objectRecord(payload.sender);
  const installationId = positiveNumericId(installation?.id);
  const repositoryId = positiveNumericId(repository?.id);
  const repositoryFullName = boundedText(repository?.full_name, 512);
  const senderId = positiveNumericId(sender?.id);

  if (
    !event ||
    !action ||
    !deliveryId ||
    !repository ||
    !sender ||
    !installationId ||
    !repositoryId ||
    !repositoryFullName ||
    !senderId
  ) {
    return err(
      domainError.validation(
        "GitHub Agent webhook is missing a supported action or required numeric identity",
      ),
    );
  }
  const repositoryPayload = repository;
  const senderPayload = sender;

  const thread = githubAgentThread(event, payload);
  if (!thread) {
    return err(domainError.validation("GitHub Agent webhook thread is invalid"));
  }

  const pullRequest = githubAgentPullRequest(event, payload, repositoryId, repositoryFullName);
  if (pullRequest.isErr()) {
    return err(pullRequest.error);
  }

  const comment = githubAgentComment(event, payload);
  if (comment.isErr()) {
    return err(comment.error);
  }

  const label = githubAgentLabel(event, payload);
  if (label.isErr()) {
    return err(label.error);
  }

  const owner = objectRecord(repositoryPayload.owner);
  const ownerId = positiveNumericId(owner?.id);
  const defaultBranch = boundedText(repositoryPayload.default_branch, 512);
  const loginSnapshot = boundedText(senderPayload.login, 160);
  const typeSnapshot = boundedText(senderPayload.type, 80);
  return ok({
    provider: "github",
    event,
    action,
    deliveryId,
    installationId,
    repository: {
      id: repositoryId,
      fullName: repositoryFullName,
      ...(ownerId ? { ownerId } : {}),
      ...(typeof repositoryPayload.private === "boolean"
        ? { private: repositoryPayload.private }
        : {}),
      ...(defaultBranch ? { defaultBranch } : {}),
    },
    sender: {
      id: senderId,
      ...(loginSnapshot ? { loginSnapshot } : {}),
      ...(typeSnapshot ? { typeSnapshot } : {}),
    },
    thread,
    ...(comment.value ? { comment: comment.value } : {}),
    ...(label.value ? { label: label.value } : {}),
    ...(pullRequest.value ? { pullRequest: pullRequest.value } : {}),
    ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
  });
}

export async function verifyGitHubWebhookSignature(
  input: GitHubWebhookSignatureInput,
): Promise<Result<void>> {
  const expectedSignature = await hmacSha256Hex(input.secretValue, input.rawBody);
  const suppliedSignature = normalizeSha256Signature(input.signature);
  if (!suppliedSignature || !constantTimeEqualHex(expectedSignature, suppliedSignature)) {
    return err(
      domainError.sourceEventSignatureInvalid("GitHub Agent webhook signature is invalid", {
        phase: "github-agent-webhook-verification",
        sourceKind: "github",
        ...(input.eventName ? { eventKind: input.eventName } : {}),
        ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
      }),
    );
  }
  return ok(undefined);
}

export function githubAgentSourceEventInput(
  event: NormalizedGitHubAgentEvent,
): VerifiedSourceEventInput {
  const eventKind = `${event.event}.${event.action}` as VerifiedSourceEventInput["eventKind"];
  const ref =
    event.thread.kind === "pull-request"
      ? `refs/pull/${event.thread.number}/head`
      : `refs/issues/${event.thread.number}`;
  const revision =
    event.pullRequest?.headSha ??
    event.comment?.id ??
    event.label?.id ??
    `${event.event}:${event.action}:${event.thread.number}`;
  return {
    sourceKind: "github",
    eventKind,
    sourceIdentity: {
      locator: `https://github.com/${event.repository.fullName}`,
      providerRepositoryId: event.repository.id,
      repositoryFullName: event.repository.fullName,
    },
    ref,
    revision,
    deliveryId: event.deliveryId,
    idempotencyKey: `github-delivery:${event.deliveryId}`,
    verification: {
      status: "verified",
      method: "provider-signature",
    },
    ...(event.receivedAt ? { receivedAt: event.receivedAt } : {}),
  };
}

export function githubAgentTriggerFromSourceEvent(
  event: NormalizedGitHubAgentEvent,
  sourceEventId: string,
): GitHubAgentTrigger {
  return {
    provider: "github",
    sourceEventId,
    event: event.event,
    action: event.action,
    deliveryId: event.deliveryId,
    installationId: event.installationId,
    repository: {
      id: event.repository.id,
      fullName: event.repository.fullName,
      ...(event.repository.defaultBranch ? { defaultBranch: event.repository.defaultBranch } : {}),
    },
    sender: { ...event.sender },
    thread: { ...event.thread },
    ...(event.comment?.id ? { commentId: event.comment.id } : {}),
    ...(event.comment?.command ? { command: event.comment.command } : {}),
    ...(event.label ? { label: { ...event.label } } : {}),
    ...(event.pullRequest ? { pullRequest: { ...event.pullRequest } } : {}),
    ...(event.pullRequest
      ? {
          source: {
            ref: event.pullRequest.headSha,
            headSha: event.pullRequest.headSha,
          },
        }
      : {}),
    ...(event.receivedAt ? { receivedAt: event.receivedAt } : {}),
  };
}

export class GitHubAgentTriggerSourceResolverAdapter
  implements GitHubAgentTriggerSourceResolverPort
{
  constructor(
    private readonly installationToken: (installationId: string) => Promise<string | null>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async resolve(
    _context: ExecutionContext,
    input: Parameters<GitHubAgentTriggerSourceResolverPort["resolve"]>[1],
  ): Promise<Result<GitHubAgentTrigger>> {
    if (!["fix", "review", "preview", "new"].includes(input.intent.action)) {
      return ok(input.trigger);
    }
    if (input.trigger.source) {
      return ok(input.trigger);
    }

    const repository = parseRepositoryFullName(input.trigger.repository.fullName);
    if (!repository) {
      return err(domainError.validation("GitHub repository full name is invalid"));
    }
    const token = await this.installationToken(input.trigger.installationId);
    if (!token || token.length > 4_096 || /[\r\n\0]/u.test(token)) {
      return err(
        domainError.conflict("GitHub installation credential is unavailable for source pinning", {
          code: "github_agent_source_pin_credential_missing",
        }),
      );
    }
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "appaloft-control-plane",
      "x-github-api-version": "2022-11-28",
    };

    if (input.trigger.thread.kind === "pull-request") {
      const response = await this.fetcher(
        gitHubApiUrl(
          this.apiBaseUrl,
          `/repos/${repository.owner}/${repository.name}/pulls/${input.trigger.thread.number}`,
        ),
        { headers },
      );
      if (!response.ok) {
        return err(
          domainError.infra("GitHub pull request source pin could not be resolved", {
            code: "github_agent_pull_request_source_pin_unavailable",
            status: response.status,
          }),
        );
      }
      const payload = objectRecord(await response.json());
      if (!payload) {
        return err(domainError.validation("GitHub pull request source response is invalid"));
      }
      const pullRequest = githubAgentPullRequest(
        "pull_request",
        { pull_request: payload, number: input.trigger.thread.number },
        input.trigger.repository.id,
        input.trigger.repository.fullName,
      );
      if (pullRequest.isErr() || !pullRequest.value) {
        return pullRequest.isErr()
          ? err(pullRequest.error)
          : err(domainError.validation("GitHub pull request source response is incomplete"));
      }
      return ok({
        ...input.trigger,
        pullRequest: pullRequest.value,
        source: {
          ref: pullRequest.value.headSha,
          headSha: pullRequest.value.headSha,
        },
      });
    }

    const ref = input.trigger.repository.defaultBranch;
    if (!ref) {
      return err(
        domainError.validation("GitHub repository default branch is required for source pinning"),
      );
    }
    const response = await this.fetcher(
      gitHubApiUrl(
        this.apiBaseUrl,
        `/repos/${repository.owner}/${repository.name}/commits/${encodeURIComponent(ref)}`,
      ),
      { headers },
    );
    if (!response.ok) {
      return err(
        domainError.infra("GitHub repository source pin could not be resolved", {
          code: "github_agent_repository_source_pin_unavailable",
          status: response.status,
        }),
      );
    }
    const payload = objectRecord(await response.json());
    const headSha = boundedText(payload?.sha, 64);
    if (!headSha || !/^[0-9a-f]{40}$/u.test(headSha)) {
      return err(domainError.validation("GitHub repository source head SHA is invalid"));
    }
    return ok({
      ...input.trigger,
      source: {
        ref,
        headSha,
      },
    });
  }
}

export class GitHubRepositoryWorkspaceMaterializerAdapter
  implements GitHubRepositoryWorkspaceMaterializerPort
{
  constructor(
    private readonly sandboxes: Pick<ExecutionSandboxService, "exec" | "writeFile">,
    private readonly installationToken: (installationId: string) => Promise<string | null>,
  ) {}

  async materialize(
    context: ExecutionContext,
    input: Parameters<GitHubRepositoryWorkspaceMaterializerPort["materialize"]>[1],
  ): Promise<Result<void>> {
    const revision = input.trigger.source?.headSha ?? input.trigger.pullRequest?.headSha;
    if (!revision || !/^[0-9a-f]{40}$/u.test(revision)) {
      return err(
        domainError.conflict("GitHub source pin is unavailable for checkout", {
          code: "github_agent_checkout_source_pin_missing",
        }),
      );
    }
    const token = await this.installationToken(input.trigger.installationId);
    if (!token || token.length > 4_096 || /[\r\n\0]/u.test(token)) {
      return err(
        domainError.conflict("GitHub installation credential is unavailable for checkout", {
          code: "github_agent_checkout_credential_missing",
        }),
      );
    }
    const repository = parseRepositoryFullName(input.trigger.repository.fullName);
    if (!repository) {
      return err(domainError.validation("GitHub repository full name is invalid"));
    }

    const tokenPath = ".appaloft-github-token";
    const askpassPath = ".appaloft-git-askpass";
    const askpass = ash`#!/bin/sh
      case "$1" in
        *Username*) printf '%s\n' x-access-token ;;
        *) cat ${ash.arg(`./${tokenPath}`)} ;;
      esac
    `;
    const encoder = new TextEncoder();
    const execute = async (argv: string[], timeoutMs = 10 * 60_000): Promise<Result<void>> => {
      const executed = await this.sandboxes.exec(context, input.workspaceId, {
        argv,
        timeoutMs,
      });
      if (executed.isErr()) return err(executed.error);
      return foregroundSandboxExecSucceeded(executed.value)
        ? ok(undefined)
        : err(
            domainError.conflict("GitHub repository checkout failed", {
              code: "github_agent_checkout_failed",
            }),
          );
    };

    try {
      const tokenWritten = await this.sandboxes.writeFile(context, input.workspaceId, {
        path: tokenPath,
        content: encoder.encode(`${token}\n`),
      });
      if (tokenWritten.isErr()) return err(tokenWritten.error);
      const askpassWritten = await this.sandboxes.writeFile(context, input.workspaceId, {
        path: askpassPath,
        content: encoder.encode(ash.render(askpass)),
      });
      if (askpassWritten.isErr()) return err(askpassWritten.error);
      const protectedFiles = await execute(["chmod", "600", tokenPath, askpassPath]);
      if (protectedFiles.isErr()) return protectedFiles;

      const repositoryUrl = `https://github.com/${repository.owner}/${repository.name}.git`;
      const cloned = await execute([
        "env",
        `GIT_ASKPASS=./${askpassPath}`,
        "GIT_TERMINAL_PROMPT=0",
        "git",
        "clone",
        "--no-checkout",
        "--filter=blob:none",
        repositoryUrl,
        ".",
      ]);
      if (cloned.isErr()) return cloned;
      const hooksDisabled = await execute(["git", "config", "core.hooksPath", "/dev/null"]);
      if (hooksDisabled.isErr()) return hooksDisabled;

      const fetched = await execute(["git", "fetch", "--no-tags", "origin", revision]);
      if (fetched.isErr()) return fetched;
      return execute(["git", "checkout", "--detach", revision]);
    } finally {
      await this.sandboxes.exec(context, input.workspaceId, {
        argv: ["rm", "-f", tokenPath, askpassPath],
        timeoutMs: 30_000,
      });
    }
  }
}

export class GitHubAgentTaskFeedbackAdapter implements GitHubAgentFeedbackPort {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async acknowledge(
    _context: ExecutionContext,
    input: { trigger: GitHubAgentTrigger; existing?: GitHubAgentFeedbackState },
  ): Promise<Result<GitHubAgentFeedbackState>> {
    if (input.existing?.reactionId || !input.trigger.commentId) {
      return ok({ ...(input.existing ?? {}) });
    }
    const id = await this.requestId(
      input.trigger,
      `/issues/comments/${encodeURIComponent(input.trigger.commentId)}/reactions`,
      "POST",
      { content: "eyes" },
      "GitHub Agent acknowledgement",
    );
    return id.isErr() ? err(id.error) : ok({ ...(input.existing ?? {}), reactionId: id.value });
  }

  async update(
    _context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      task: GitHubAgentTaskSummary;
      existing?: GitHubAgentFeedbackState;
    },
  ): Promise<Result<GitHubAgentFeedbackState>> {
    const existing = input.existing ?? {};
    const commentId = await this.requestId(
      input.trigger,
      existing.statusCommentId
        ? `/issues/comments/${encodeURIComponent(existing.statusCommentId)}`
        : `/issues/${input.trigger.thread.number}/comments`,
      existing.statusCommentId ? "PATCH" : "POST",
      { body: githubAgentStatusBody(input.task) },
      "GitHub Agent status comment",
      existing.statusCommentId,
    );
    if (commentId.isErr()) return err(commentId.error);

    let checkRunId = existing.checkRunId;
    const checkHeadSha = input.trigger.pullRequest?.headSha ?? input.trigger.source?.headSha;
    if (checkHeadSha) {
      const check = githubAgentCheckRun(input.task, checkHeadSha);
      const { head_sha: _headSha, ...checkUpdate } = check;
      const checkId = await this.requestId(
        input.trigger,
        existing.checkRunId
          ? `/check-runs/${encodeURIComponent(existing.checkRunId)}`
          : "/check-runs",
        existing.checkRunId ? "PATCH" : "POST",
        existing.checkRunId ? checkUpdate : check,
        "GitHub Agent Check Run",
        existing.checkRunId,
      );
      if (checkId.isErr()) return err(checkId.error);
      checkRunId = checkId.value;
    }
    return ok({
      ...existing,
      statusCommentId: commentId.value,
      ...(checkRunId ? { checkRunId } : {}),
    });
  }

  async reject(
    _context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      reasonCode: string;
      message: string;
      connectAgentUrl?: string;
      existing?: GitHubAgentFeedbackState;
    },
  ): Promise<Result<GitHubAgentFeedbackState>> {
    const existing = input.existing ?? {};
    const action = input.connectAgentUrl ? `\n\n[Connect Agent](${input.connectAgentUrl})` : "";
    const body = boundedText(
      `Appaloft did not start a Task.\n\nReason: ${input.message}\n\nCode: \`${input.reasonCode}\`${action}`,
      8_000,
    );
    if (!body) return err(domainError.validation("GitHub Agent rejection body is invalid"));
    const commentId = await this.requestId(
      input.trigger,
      existing.statusCommentId
        ? `/issues/comments/${encodeURIComponent(existing.statusCommentId)}`
        : `/issues/${input.trigger.thread.number}/comments`,
      existing.statusCommentId ? "PATCH" : "POST",
      { body },
      "GitHub Agent rejection comment",
      existing.statusCommentId,
    );
    return commentId.isErr()
      ? err(commentId.error)
      : ok({ ...existing, statusCommentId: commentId.value });
  }

  private async requestId(
    trigger: GitHubAgentTrigger,
    repositoryPath: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    operation: string,
    fallbackId?: string,
  ): Promise<Result<string>> {
    const repository = parseRepositoryFullName(trigger.repository.fullName);
    if (!repository) return err(domainError.validation("GitHub repository full name is invalid"));
    const response = await this.fetcher(
      gitHubApiUrl(
        this.apiBaseUrl,
        `/repos/${repository.owner}/${repository.name}${repositoryPath}`,
      ),
      {
        method,
        headers: githubJsonHeaders(this.accessToken),
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return err(
        domainError.provider(
          `${operation} request failed`,
          {
            phase: "github-agent-feedback",
            provider: "github",
            statusCode: response.status,
          },
          isRetryableGitHubStatus(response.status),
        ),
      );
    }
    const payload = objectRecord(await response.json().catch(() => null));
    const id =
      typeof payload?.id === "number" || typeof payload?.id === "string"
        ? String(payload.id)
        : fallbackId;
    return id
      ? ok(id)
      : err(
          domainError.provider(`${operation} response did not include an id`, {
            phase: "github-agent-feedback",
            provider: "github",
          }),
        );
  }
}

function foregroundSandboxExecSucceeded(result: SandboxExecResult): boolean {
  return (
    result.mode === "foreground" &&
    result.frames.some((frame) => frame.kind === "exit" && frame.exitCode === 0)
  );
}

export class GitHubAgentReviewDeliveryAdapter implements GitHubAgentReviewDeliveryPort {
  constructor(
    private readonly accessToken: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async submit(
    _context: ExecutionContext,
    input: Parameters<GitHubAgentReviewDeliveryPort["submit"]>[1],
  ): Promise<Result<GitHubAgentReviewDeliveryResult>> {
    const repository = parseRepositoryFullName(input.trigger.repository.fullName);
    const pullRequest = input.trigger.pullRequest;
    if (!repository || !pullRequest || input.trigger.thread.kind !== "pull-request") {
      return err(domainError.validation("GitHub Review delivery requires a pull request trigger"));
    }
    if (
      !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.contentDigest) ||
      input.expectedHeadSha !== pullRequest.headSha ||
      input.findings.length > 50
    ) {
      return err(domainError.validation("GitHub Review delivery input is invalid or stale"));
    }
    const summary = boundedText(input.summary, 32_000);
    if (!summary || sensitiveCommandText.test(summary)) {
      return err(domainError.validation("GitHub Review summary is invalid or contains secrets"));
    }
    const comments: Array<Record<string, unknown>> = [];
    for (const finding of input.findings) {
      const path = boundedText(finding.path, 1_024);
      const body = boundedText(finding.body, 4_000);
      if (
        !path ||
        path.startsWith("/") ||
        path.split("/").includes("..") ||
        !body ||
        sensitiveCommandText.test(body) ||
        !Number.isSafeInteger(finding.line) ||
        finding.line < 1
      ) {
        return err(domainError.validation("GitHub Review finding is invalid or contains secrets"));
      }
      comments.push({
        path,
        line: finding.line,
        side: "RIGHT",
        body: `[${finding.severity}] ${body}`,
      });
    }

    const basePath = `/repos/${repository.owner}/${repository.name}`;
    const current = await this.request(
      `${basePath}/pulls/${pullRequest.number}`,
      "GET",
      undefined,
      "GitHub pull request head readback",
    );
    if (current.isErr()) return err(current.error);
    const currentHead = objectRecord(objectRecord(current.value)?.head)?.sha;
    if (currentHead !== input.expectedHeadSha) {
      return err(
        domainError.conflict("GitHub pull request head changed before Review delivery", {
          phase: "github-agent-review-head-reconciliation",
          expectedHeadSha: input.expectedHeadSha,
          observedHeadSha: typeof currentHead === "string" ? currentHead : "unavailable",
        }),
      );
    }

    const marker = `<!-- appaloft-agent-review:${input.contentDigest} -->`;
    const reviews = await this.request(
      `${basePath}/pulls/${pullRequest.number}/reviews?per_page=100`,
      "GET",
      undefined,
      "GitHub Review dedupe readback",
    );
    if (reviews.isErr()) return err(reviews.error);
    if (Array.isArray(reviews.value)) {
      for (const value of reviews.value) {
        const review = objectRecord(value);
        if (
          review?.commit_id === input.expectedHeadSha &&
          typeof review.body === "string" &&
          review.body.includes(marker)
        ) {
          const reviewId = review.id;
          if (typeof reviewId === "string" || typeof reviewId === "number") {
            return ok({
              reviewId: String(reviewId),
              ...(typeof review.html_url === "string" ? { reviewUrl: review.html_url } : {}),
              duplicate: true,
            });
          }
        }
      }
    }

    const created = await this.request(
      `${basePath}/pulls/${pullRequest.number}/reviews`,
      "POST",
      {
        commit_id: input.expectedHeadSha,
        event: "COMMENT",
        body: `${marker}\n${summary}`,
        comments,
      },
      "GitHub Review delivery",
    );
    if (created.isErr()) return err(created.error);
    const payload = objectRecord(created.value);
    const reviewId = payload?.id;
    if (typeof reviewId !== "string" && typeof reviewId !== "number") {
      return err(domainError.provider("GitHub Review response did not include an id"));
    }
    return ok({
      reviewId: String(reviewId),
      ...(typeof payload?.html_url === "string" ? { reviewUrl: payload.html_url } : {}),
      duplicate: false,
    });
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body: Record<string, unknown> | undefined,
    operation: string,
  ): Promise<Result<unknown>> {
    const response = await this.fetcher(gitHubApiUrl(this.apiBaseUrl, path), {
      method,
      headers: githubJsonHeaders(this.accessToken),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      return err(
        domainError.provider(
          `${operation} request failed`,
          {
            phase: "github-agent-review-delivery",
            provider: "github",
            statusCode: response.status,
          },
          isRetryableGitHubStatus(response.status),
        ),
      );
    }
    return ok(await response.json().catch(() => null));
  }
}

export function createGitHubAgentReviewDeliveryAdapter(
  accessToken: string,
  fetcher: typeof fetch = fetch,
  apiBaseUrl = "https://api.github.com",
): GitHubAgentReviewDeliveryAdapter {
  return new GitHubAgentReviewDeliveryAdapter(accessToken, fetcher, apiBaseUrl);
}

function githubAgentStatusBody(task: GitHubAgentTaskSummary): string {
  const details = task.feedback;
  const lines = [
    "<!-- appaloft-agent-task-status -->",
    `Appaloft Agent Task: **${task.status}**`,
    "",
    `[Open Task](${safeFeedbackUrl(task.taskUrl) ?? "#"})`,
    `Session recovery: \`${task.sessionRecovery}\``,
  ];
  if (details?.phase) {
    lines.push("", `Current phase: **${safeFeedbackInline(details.phase, 160)}**`);
  }
  if (details?.checks?.length) {
    lines.push("", "### Checks");
    for (const check of details.checks.slice(0, 12)) {
      const icon = check.status === "passed" ? "✅" : check.status === "failed" ? "❌" : "⏭️";
      lines.push(`- ${icon} ${safeFeedbackInline(check.name, 200)}`);
      if (check.summary) {
        lines.push(`  ${safeFeedbackText(check.summary, 800).replaceAll("\n", "\n  ")}`);
      }
    }
    if (details.checks.length > 12) {
      lines.push(
        `- ${details.checks.length - 12} additional checks are available in Task details.`,
      );
    }
  }
  if (details?.diff) {
    lines.push("", "### Diff", safeFeedbackText(details.diff.stat, 2_000));
    if (details.diff.redacted) {
      lines.push(
        "Sensitive-looking diff content was redacted. Open Task details for safe evidence.",
      );
    } else if (details.diff.patch) {
      const patch = escapeHtml(safeFeedbackText(details.diff.patch, 8_000));
      lines.push(
        "<details><summary>Bounded patch</summary>",
        "",
        `<pre>${patch}</pre>`,
        "</details>",
      );
    }
    if (details.diff.truncated) {
      lines.push("Diff output is truncated; open Task details for the complete artifact.");
    }
  }
  if (details?.preview) {
    const previewUrl = safeFeedbackUrl(details.preview.url);
    lines.push(
      "",
      "### Preview",
      previewUrl
        ? `[Open ${details.preview.visibility} Preview](${previewUrl})`
        : `${details.preview.visibility} Preview is available from Task details.`,
      `Expires: ${safeFeedbackInline(details.preview.expiresAt, 80)}`,
    );
  }
  if (details?.delivery) {
    const deliveryUrl = details.delivery.url ? safeFeedbackUrl(details.delivery.url) : undefined;
    lines.push(
      "",
      "### Delivery",
      `${safeFeedbackInline(details.delivery.kind, 80)}: **${details.delivery.status}**${
        deliveryUrl ? ` ([open](${deliveryUrl}))` : ""
      }`,
    );
  }
  if (details?.failure) {
    lines.push(
      "",
      "### Failure",
      safeFeedbackText(details.failure.summary, 1_200),
      ...(details.failure.code
        ? [`Code: \`${safeFeedbackInline(details.failure.code, 160)}\``]
        : []),
      `Retryable: ${details.failure.retryable ? "yes" : "no"}`,
    );
  }
  if (details?.cleanup) {
    lines.push(
      "",
      "### Retention",
      `Workspace: **${details.cleanup.workspace}**`,
      ...(details.cleanup.preview ? [`Preview: **${details.cleanup.preview}**`] : []),
    );
  }
  return boundedFeedbackMarkdown(lines.join("\n"), 24_000);
}

function githubAgentCheckRun(
  task: GitHubAgentTaskSummary,
  headSha: string,
): Record<string, unknown> {
  if (task.status === "queued") {
    return {
      name: "Appaloft Agent Task",
      head_sha: headSha,
      status: "queued",
      details_url: task.taskUrl,
      output: { title: "Task queued", summary: githubAgentStatusBody(task) },
    };
  }
  if (task.status === "running") {
    return {
      name: "Appaloft Agent Task",
      head_sha: headSha,
      status: "in_progress",
      details_url: task.taskUrl,
      output: { title: "Task running", summary: githubAgentStatusBody(task) },
    };
  }
  const conclusion =
    task.status === "completed"
      ? "success"
      : task.status === "failed"
        ? "failure"
        : task.status === "needs-reconciliation"
          ? "action_required"
          : "neutral";
  return {
    name: "Appaloft Agent Task",
    head_sha: headSha,
    status: "completed",
    conclusion,
    details_url: task.taskUrl,
    output: { title: `Task ${task.status}`, summary: githubAgentStatusBody(task) },
  };
}

export function createGitHubAgentTaskFeedbackAdapter(
  accessToken: string,
  fetcher: typeof fetch = fetch,
  apiBaseUrl = "https://api.github.com",
): GitHubAgentTaskFeedbackAdapter {
  return new GitHubAgentTaskFeedbackAdapter(accessToken, fetcher, apiBaseUrl);
}

function githubAgentEventName(value: string): GitHubAgentEventName | null {
  return value === "issue_comment" ||
    value === "pull_request_review_comment" ||
    value === "issues" ||
    value === "pull_request"
    ? value
    : null;
}

function githubAgentEventAction(
  event: GitHubAgentEventName | null,
  value: unknown,
): GitHubAgentEventAction | null {
  if (!event || typeof value !== "string") return null;
  if (
    (event === "issue_comment" || event === "pull_request_review_comment") &&
    value === "created"
  ) {
    return value;
  }
  if ((event === "issues" || event === "pull_request") && value === "labeled") return value;
  if (
    event === "pull_request" &&
    (value === "ready_for_review" || value === "synchronize" || value === "closed")
  ) {
    return value;
  }
  return null;
}

function githubAgentThread(
  event: GitHubAgentEventName,
  payload: Record<string, unknown>,
): NormalizedGitHubAgentEvent["thread"] | null {
  if (event === "pull_request" || event === "pull_request_review_comment") {
    const pullRequest = objectRecord(payload.pull_request);
    const number = positiveInteger(pullRequest?.number ?? payload.number);
    return number === null ? null : { kind: "pull-request", number };
  }
  const issue = objectRecord(payload.issue);
  const number = positiveInteger(issue?.number);
  if (number === null) return null;
  return {
    kind: objectRecord(issue?.pull_request) ? "pull-request" : "issue",
    number,
  };
}

function githubAgentPullRequest(
  event: GitHubAgentEventName,
  payload: Record<string, unknown>,
  repositoryId: string,
  repositoryFullName: string,
): Result<NormalizedGitHubAgentEvent["pullRequest"] | undefined> {
  if (event !== "pull_request" && event !== "pull_request_review_comment") {
    return ok(undefined);
  }
  const pullRequest = objectRecord(payload.pull_request);
  const head = objectRecord(pullRequest?.head);
  const base = objectRecord(pullRequest?.base);
  const headRepository = objectRecord(head?.repo);
  const number = positiveInteger(pullRequest?.number ?? payload.number);
  const headSha = boundedText(head?.sha, 160);
  const baseRef = boundedText(base?.ref, 512);
  const headRepositoryId = positiveNumericId(headRepository?.id);
  const headRepositoryFullName = boundedText(headRepository?.full_name, 512);
  if (number === null || !headSha || !baseRef || !headRepositoryId || !headRepositoryFullName) {
    return err(
      domainError.validation(
        "GitHub Agent pull request must include an unambiguous numeric head repository",
      ),
    );
  }
  return ok({
    number,
    headSha,
    baseRef,
    headRepositoryId,
    headRepositoryFullName,
    fork:
      headRepositoryId !== repositoryId ||
      headRepositoryFullName.toLowerCase() !== repositoryFullName.toLowerCase(),
  });
}

function githubAgentComment(
  event: GitHubAgentEventName,
  payload: Record<string, unknown>,
): Result<NormalizedGitHubAgentEvent["comment"] | undefined> {
  if (event !== "issue_comment" && event !== "pull_request_review_comment") {
    return ok(undefined);
  }
  const comment = objectRecord(payload.comment);
  const id = positiveNumericId(comment?.id);
  const body = typeof comment?.body === "string" ? comment.body : null;
  if (!comment || !id || body === null || body.length > githubCommentBodyLimit) {
    return err(domainError.validation("GitHub Agent comment is invalid"));
  }
  const commentPayload = comment;

  const hasCommand = body
    .replace(/```[\s\S]*?```/gu, "")
    .split(/\r?\n/u)
    .some((line) => line.trim().toLowerCase().startsWith(`${appaloftCommandPrefix} `));
  const command = hasCommand ? parseAppaloftGitHubCommand(body) : ok(undefined);
  if (command.isErr()) return err(command.error);
  const line = positiveInteger(commentPayload.line);
  const path = boundedText(commentPayload.path, 1_024);
  return ok({
    id,
    ...(command.value ? { command: command.value } : {}),
    ...(path ? { path } : {}),
    ...(line !== null ? { line } : {}),
  });
}

function githubAgentLabel(
  event: GitHubAgentEventName,
  payload: Record<string, unknown>,
): Result<NormalizedGitHubAgentEvent["label"] | undefined> {
  if (!((event === "issues" || event === "pull_request") && payload.action === "labeled")) {
    return ok(undefined);
  }
  const label = objectRecord(payload.label);
  const name = boundedText(label?.name, 160);
  if (!name) return err(domainError.validation("GitHub Agent label is invalid"));
  const id = positiveNumericId(label?.id);
  return ok({ ...(id ? { id } : {}), name });
}

function positiveNumericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

const feedbackSecretLine =
  /(?:api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)\s*[:=]/iu;
const feedbackSecretValue =
  /(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)/u;

function safeFeedbackText(value: string, maxLength: number): string {
  const redacted = value
    .replaceAll("\0", "")
    .split("\n")
    .map((line) =>
      feedbackSecretLine.test(line) || feedbackSecretValue.test(line)
        ? "[REDACTED SECRET-LIKE OUTPUT]"
        : line,
    )
    .join("\n")
    .trim();
  if (!redacted) return "No details recorded.";
  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, Math.max(0, maxLength - 14))}\n[TRUNCATED]`;
}

function safeFeedbackInline(value: string, maxLength: number): string {
  return safeFeedbackText(value, maxLength)
    .replaceAll("\n", " ")
    .replace(/([\\`*_[\]<>])/gu, "\\$1");
}

function safeFeedbackUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some((key) =>
        /(?:token|secret|credential|api[_-]?key|signature)/iu.test(key),
      )
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function boundedFeedbackMarkdown(value: string, maxLength: number): string {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 14))}\n[TRUNCATED]`;
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

function normalizeGitHubRepositoryPermission(
  value: string,
): GitHubRepositoryActorReadback["permission"] {
  if (value === "admin" || value === "maintain" || value === "triage" || value === "pull") {
    return value;
  }
  if (value === "push" || value === "write") return "push";
  if (value === "read") return "pull";
  return "none";
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
