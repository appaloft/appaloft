import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type ExecutionContext,
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
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

export const githubIntegration: IntegrationDescriptor = {
  key: "github",
  title: "GitHub",
  capabilities: ["repository-import", "webhook-ready", "future-pr-comment"],
};

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

export class GitHubApiRepositoryBrowser implements GitHubRepositoryBrowser {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async listRepositories(
    context: ExecutionContext,
    input: {
      accessToken: string;
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
        const url = new URL("/user/repos", this.apiBaseUrl);
        url.searchParams.set("sort", "updated");
        url.searchParams.set("per_page", "100");
        url.searchParams.set("affiliation", "owner,collaborator,organization_member");

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

        const payload = (await response.json()) as GitHubRepositoryApiRecord[];
        const search = input.search?.trim().toLowerCase();

        return payload
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

export function createGitHubRepositoryBrowser(
  fetcher?: typeof fetch,
  apiBaseUrl?: string,
): GitHubRepositoryBrowser {
  return new GitHubApiRepositoryBrowser(fetcher, apiBaseUrl);
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

        const deploymentId = input.providerFeedbackId ?? input.providerDeploymentId;
        if (!deploymentId) {
          return err(
            domainError.validation("GitHub preview deployment status requires a deployment id", {
              phase: "preview-feedback",
              provider: "github",
              channel: input.channel,
            }),
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
              state: "success",
              description: "Appaloft preview deployment accepted",
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
}

interface GitHubPullRequestPayloadFacts {
  action: GitHubPreviewPullRequestAction;
  repositoryFullName: string;
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
  const revision = payload ? nonEmptyString(payload.after) : null;

  if (!repositoryIdValue || !repositoryFullName || !locator || !ref || !revision) {
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
    revision,
  });
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
