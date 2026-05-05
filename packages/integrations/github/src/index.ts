import {
  appaloftTraceAttributes,
  createAdapterSpanName,
  type ExecutionContext,
  type GitHubRepositoryBrowser,
  type GitHubRepositorySummary,
  type GitHubSourceEventWebhookVerificationInput,
  type GitHubSourceEventWebhookVerificationResult,
  type GitHubSourceEventWebhookVerifier,
  type IntegrationDescriptor,
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

interface GitHubPushPayloadFacts {
  locator: string;
  providerRepositoryId: string;
  repositoryFullName: string;
  ref: string;
  revision: string;
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

function normalizeGitHubRef(ref: string): string {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }

  if (ref.startsWith("refs/tags/")) {
    return ref.slice("refs/tags/".length);
  }

  return ref;
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
