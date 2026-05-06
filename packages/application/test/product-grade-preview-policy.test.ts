import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { PreviewPolicyEvaluator } from "../src/use-cases";

describe("PreviewPolicyEvaluator", () => {
  test("[PG-PREVIEW-POLICY-001] allows a verified same-repository pull request event", () => {
    const result = new PreviewPolicyEvaluator().evaluate({
      provider: "github",
      eventKind: "pull-request",
      eventAction: "synchronize",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 123,
      headSha: "abc123",
      baseRef: "main",
      verified: true,
      requestedSecretScopes: ["preview-runtime"],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "allowed",
      phase: "preview-policy-evaluation",
      deploymentEligible: true,
      safeDetails: {
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 123,
        headSha: "abc123",
        baseRef: "main",
        fork: false,
        secretBacked: true,
        requestedSecretScopeCount: 1,
      },
    });
  });

  test("[PG-PREVIEW-POLICY-002] blocks secret-backed fork previews by default", () => {
    const result = new PreviewPolicyEvaluator().evaluate({
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "external/demo-fork",
      pullRequestNumber: 124,
      headSha: "def456",
      baseRef: "main",
      verified: true,
      requestedSecretScopes: ["preview-runtime"],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "blocked",
      phase: "preview-policy-evaluation",
      deploymentEligible: false,
      reasonCode: "preview_fork_disabled",
      safeDetails: {
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "external/demo-fork",
        pullRequestNumber: 124,
        fork: true,
        secretBacked: true,
        requestedSecretScopeCount: 1,
      },
    });
  });

  test("[PG-PREVIEW-POLICY-002] allows fork previews without secrets only when policy opts in", () => {
    const result = new PreviewPolicyEvaluator().evaluate({
      provider: "github",
      eventKind: "pull-request",
      eventAction: "reopened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "external/demo-fork",
      pullRequestNumber: 125,
      headSha: "fed789",
      baseRef: "main",
      verified: true,
      policy: {
        forkPreviews: "without-secrets",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "allowed",
      deploymentEligible: true,
      safeDetails: {
        fork: true,
        secretBacked: false,
        requestedSecretScopeCount: 0,
      },
    });
  });

  test("[PG-PREVIEW-POLICY-001] blocks unverified pull request events before policy allow", () => {
    const result = new PreviewPolicyEvaluator().evaluate({
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 126,
      headSha: "abc789",
      baseRef: "main",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "blocked",
      deploymentEligible: false,
      reasonCode: "preview_event_unverified",
    });
  });
});
