import { type Result } from "@appaloft/core";

import { type PreviewPolicyDecisionReasonCode } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type PreviewPolicyEvaluationInput,
  type PreviewPolicyEvaluationPayload,
  previewPolicyEvaluationInputSchema,
} from "./preview-policy.schema";

export type PreviewPolicyDecisionStatus = "allowed" | "blocked";

export type PreviewPolicyBlockedReason = PreviewPolicyDecisionReasonCode;

export interface PreviewPolicyDecisionSafeDetails {
  provider: "github";
  eventKind: "pull-request";
  eventAction: PreviewPolicyEvaluationPayload["eventAction"];
  repositoryFullName: string;
  headRepositoryFullName: string;
  pullRequestNumber: number;
  headSha: string;
  baseRef: string;
  fork: boolean;
  secretBacked: boolean;
  requestedSecretScopeCount: number;
  activePreviewCount: number;
  maxActivePreviews?: number;
  previewTtlHours?: number;
}

export interface PreviewPolicyDecision {
  status: PreviewPolicyDecisionStatus;
  phase: "preview-policy-evaluation";
  deploymentEligible: boolean;
  safeDetails: PreviewPolicyDecisionSafeDetails;
  reasonCode?: PreviewPolicyBlockedReason;
}

function safeDetails(input: PreviewPolicyEvaluationPayload): PreviewPolicyDecisionSafeDetails {
  const fork = input.headRepositoryFullName !== input.repositoryFullName;

  return {
    provider: input.provider,
    eventKind: input.eventKind,
    eventAction: input.eventAction,
    repositoryFullName: input.repositoryFullName,
    headRepositoryFullName: input.headRepositoryFullName,
    pullRequestNumber: input.pullRequestNumber,
    headSha: input.headSha,
    baseRef: input.baseRef,
    fork,
    secretBacked: input.requestedSecretScopes.length > 0,
    requestedSecretScopeCount: input.requestedSecretScopes.length,
    activePreviewCount: input.activePreviewCount,
    ...(input.policy.maxActivePreviews !== undefined
      ? { maxActivePreviews: input.policy.maxActivePreviews }
      : {}),
    ...(input.policy.previewTtlHours !== undefined
      ? { previewTtlHours: input.policy.previewTtlHours }
      : {}),
  };
}

function blocked(
  input: PreviewPolicyEvaluationPayload,
  reasonCode: PreviewPolicyBlockedReason,
): PreviewPolicyDecision {
  return {
    status: "blocked",
    phase: "preview-policy-evaluation",
    deploymentEligible: false,
    reasonCode,
    safeDetails: safeDetails(input),
  };
}

function allowed(input: PreviewPolicyEvaluationPayload): PreviewPolicyDecision {
  return {
    status: "allowed",
    phase: "preview-policy-evaluation",
    deploymentEligible: true,
    safeDetails: safeDetails(input),
  };
}

export class PreviewPolicyEvaluator {
  evaluate(input: PreviewPolicyEvaluationInput): Result<PreviewPolicyDecision> {
    return parseOperationInput(previewPolicyEvaluationInputSchema, input).map((parsed) => {
      if (!parsed.verified) {
        return blocked(parsed, "preview_event_unverified");
      }

      const fork = parsed.headRepositoryFullName !== parsed.repositoryFullName;
      const secretBacked = parsed.requestedSecretScopes.length > 0;
      const maxActivePreviews = parsed.policy.maxActivePreviews;

      if (maxActivePreviews !== undefined && parsed.activePreviewCount >= maxActivePreviews) {
        return blocked(parsed, "preview_quota_exceeded");
      }

      if (!fork && !parsed.policy.sameRepositoryPreviews) {
        return blocked(parsed, "preview_same_repository_disabled");
      }

      if (fork && parsed.policy.forkPreviews === "disabled") {
        return blocked(parsed, "preview_fork_disabled");
      }

      if (fork && secretBacked && parsed.policy.forkPreviews !== "with-secrets") {
        return blocked(parsed, "preview_fork_secrets_blocked");
      }

      if (secretBacked && !parsed.policy.secretBackedPreviews) {
        return blocked(parsed, "preview_secret_backed_disabled");
      }

      return allowed(parsed);
    });
  }
}

export function evaluatePreviewPolicy(
  input: PreviewPolicyEvaluationInput,
): Result<PreviewPolicyDecision> {
  return new PreviewPolicyEvaluator().evaluate(input);
}
