import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type SourceEventPolicyReader } from "../../ports";
import { tokens } from "../../tokens";
import {
  type ResolvePreviewPullRequestContextQueryParsedInput,
  type ResolvePreviewPullRequestContextResponse,
} from "./resolve-preview-pull-request-context.schema";

@injectable()
export class ResolvePreviewPullRequestContextQueryService {
  constructor(
    @inject(tokens.sourceEventPolicyReader)
    private readonly sourceEventPolicyReader: SourceEventPolicyReader,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ResolvePreviewPullRequestContextQueryParsedInput,
  ): Promise<Result<ResolvePreviewPullRequestContextResponse>> {
    const candidates = await this.sourceEventPolicyReader.listCandidates(
      toRepositoryContext(context),
      {
        sourceKind: "github",
        sourceIdentity: {
          locator: githubRepositoryLocator(input.repositoryFullName),
          repositoryFullName: input.repositoryFullName,
          ...(input.providerRepositoryId
            ? { providerRepositoryId: input.providerRepositoryId }
            : {}),
        },
      },
    );
    const eligibleCandidates = candidates.filter(
      (candidate) =>
        candidate.status === "enabled" &&
        Boolean(candidate.serverId) &&
        Boolean(candidate.destinationId) &&
        Boolean(candidate.sourceBindingFingerprint) &&
        candidate.refs.some((ref) => previewRefMatches(ref, input.baseRef)),
    );

    if (eligibleCandidates.length === 0) {
      return err(
        domainError.validation("No preview context matched the GitHub pull request repository", {
          phase: "preview-event-ingestion",
          provider: "github",
          repositoryFullName: input.repositoryFullName,
          baseRef: input.baseRef,
          ...(input.installationId ? { installationId: input.installationId } : {}),
        }),
      );
    }

    if (eligibleCandidates.length > 1) {
      return err(
        domainError.conflict("GitHub pull request preview context is ambiguous", {
          phase: "preview-event-ingestion",
          provider: "github",
          repositoryFullName: input.repositoryFullName,
          baseRef: input.baseRef,
          matchCount: eligibleCandidates.length,
          ...(input.installationId ? { installationId: input.installationId } : {}),
        }),
      );
    }

    const candidate = eligibleCandidates[0];
    if (!candidate?.serverId || !candidate.destinationId || !candidate.sourceBindingFingerprint) {
      return err(
        domainError.validation("GitHub pull request preview context is incomplete", {
          phase: "preview-event-ingestion",
          provider: "github",
          repositoryFullName: input.repositoryFullName,
        }),
      );
    }

    return ok({
      projectId: candidate.projectId,
      environmentId: candidate.environmentId,
      resourceId: candidate.resourceId,
      serverId: candidate.serverId,
      destinationId: candidate.destinationId,
      sourceBindingFingerprint: candidate.sourceBindingFingerprint,
    });
  }
}

function githubRepositoryLocator(repositoryFullName: string): string {
  return `https://github.com/${repositoryFullName}.git`;
}

function previewRefMatches(candidateRef: string, baseRef: string): boolean {
  return candidateRef === baseRef || candidateRef === `refs/heads/${baseRef}`;
}
