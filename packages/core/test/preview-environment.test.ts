import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DestinationId,
  EnvironmentId,
  GitCommitShaText,
  GitRefText,
  PreviewEnvironment,
  PreviewEnvironmentExpiresAt,
  PreviewEnvironmentId,
  PreviewEnvironmentProviderValue,
  PreviewEnvironmentStatusValue,
  PreviewPullRequestNumber,
  ProjectId,
  ResourceId,
  SourceBindingFingerprint,
  SourceRepositoryFullName,
  UpdatedAt,
} from "../src";

function sourceContext(input: { headSha?: string } = {}) {
  return {
    repositoryFullName: SourceRepositoryFullName.create("appaloft/demo")._unsafeUnwrap(),
    headRepositoryFullName: SourceRepositoryFullName.create("appaloft/demo")._unsafeUnwrap(),
    pullRequestNumber: PreviewPullRequestNumber.create(123)._unsafeUnwrap(),
    headSha: GitCommitShaText.create(input.headSha ?? "a".repeat(40))._unsafeUnwrap(),
    baseRef: GitRefText.create("main")._unsafeUnwrap(),
    sourceBindingFingerprint: SourceBindingFingerprint.create("srcfp_demo")._unsafeUnwrap(),
  };
}

function previewEnvironmentFixture() {
  return PreviewEnvironment.create({
    id: PreviewEnvironmentId.rehydrate("penv_demo_pr_123"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_preview"),
    resourceId: ResourceId.rehydrate("res_web"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    provider: PreviewEnvironmentProviderValue.github(),
    source: sourceContext(),
    createdAt: CreatedAt.rehydrate("2026-05-06T00:00:00.000Z"),
    expiresAt: PreviewEnvironmentExpiresAt.create("2026-05-13T00:00:00.000Z")._unsafeUnwrap(),
  })._unsafeUnwrap();
}

describe("PreviewEnvironment", () => {
  test("[PG-PREVIEW-ENV-001] creates scoped preview environment identity with safe source context", () => {
    const provider = PreviewEnvironmentProviderValue.create("github");
    const pullRequestNumber = PreviewPullRequestNumber.create(123);
    const expiresAt = PreviewEnvironmentExpiresAt.create("2026-05-13T00:00:00.000Z");

    expect(provider.isOk()).toBe(true);
    expect(pullRequestNumber.isOk()).toBe(true);
    expect(expiresAt.isOk()).toBe(true);

    const previewEnvironment = previewEnvironmentFixture();
    const state = previewEnvironment.toState();

    expect(state.id.value).toBe("penv_demo_pr_123");
    expect(state.projectId.value).toBe("prj_demo");
    expect(state.environmentId.value).toBe("env_preview");
    expect(state.resourceId.value).toBe("res_web");
    expect(state.serverId.value).toBe("srv_demo");
    expect(state.destinationId.value).toBe("dst_demo");
    expect(state.provider.value).toBe("github");
    expect(state.status.value).toBe("active");
    expect(state.source.repositoryFullName.value).toBe("appaloft/demo");
    expect(state.source.pullRequestNumber.value).toBe(123);
    expect(state.source.baseRef.value).toBe("main");
    expect(state.source.sourceBindingFingerprint.value).toBe("srcfp_demo");
    expect(previewEnvironment.belongsToResource(ResourceId.rehydrate("res_web"))).toBe(true);
    expect(previewEnvironment.isExpiredAt(CreatedAt.rehydrate("2026-05-12T00:00:00.000Z"))).toBe(
      false,
    );
    expect(previewEnvironment.isExpiredAt(CreatedAt.rehydrate("2026-05-13T00:00:00.000Z"))).toBe(
      true,
    );

    const events = previewEnvironment.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "preview-environment-created",
      aggregateId: "penv_demo_pr_123",
      payload: {
        projectId: "prj_demo",
        environmentId: "env_preview",
        resourceId: "res_web",
        provider: "github",
        pullRequestNumber: 123,
      },
    });
  });

  test("[PG-PREVIEW-ENV-001] updates preview source context while active", () => {
    const previewEnvironment = previewEnvironmentFixture();
    previewEnvironment.pullDomainEvents();

    const updated = previewEnvironment.updateSourceContext({
      source: sourceContext({ headSha: "b".repeat(40) }),
      updatedAt: UpdatedAt.rehydrate("2026-05-06T01:00:00.000Z"),
    });

    expect(updated.isOk()).toBe(true);
    expect(updated._unsafeUnwrap()).toEqual({ changed: true });
    expect(previewEnvironment.toState().source.headSha.value).toBe("b".repeat(40));
    expect(previewEnvironment.toState().updatedAt?.value).toBe("2026-05-06T01:00:00.000Z");
    expect(previewEnvironment.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "preview-environment-source-updated",
        payload: expect.objectContaining({
          resourceId: "res_web",
          provider: "github",
          pullRequestNumber: 123,
          headSha: "b".repeat(40),
        }),
      }),
    ]);
  });

  test("[PG-PREVIEW-CLEANUP-001] records cleanup request and blocks later source changes", () => {
    const previewEnvironment = previewEnvironmentFixture();
    previewEnvironment.pullDomainEvents();

    const cleanup = previewEnvironment.requestCleanup({
      requestedAt: UpdatedAt.rehydrate("2026-05-06T02:00:00.000Z"),
    });

    expect(cleanup.isOk()).toBe(true);
    expect(previewEnvironment.isActive()).toBe(false);
    expect(previewEnvironment.toState().status.value).toBe("cleanup-requested");
    expect(previewEnvironment.pullDomainEvents()[0]).toMatchObject({
      type: "preview-environment-cleanup-requested",
    });

    const updateAfterCleanup = previewEnvironment.updateSourceContext({
      source: sourceContext({ headSha: "c".repeat(40) }),
      updatedAt: UpdatedAt.rehydrate("2026-05-06T03:00:00.000Z"),
    });

    expect(updateAfterCleanup.isErr()).toBe(true);
    if (updateAfterCleanup.isErr()) {
      expect(updateAfterCleanup.error.code).toBe("conflict");
      expect(updateAfterCleanup.error.details).toMatchObject({
        phase: "preview-environment-state-transition",
        status: "cleanup-requested",
      });
    }
  });

  test("[PG-PREVIEW-ENV-001] rejects unsafe preview environment value objects", () => {
    const invalidProvider = PreviewEnvironmentProviderValue.create("raw-github-payload");
    const invalidStatus = PreviewEnvironmentStatusValue.create("deleted");
    const invalidPullRequestNumber = PreviewPullRequestNumber.create(0);
    const invalidExpiresAt = PreviewEnvironmentExpiresAt.create("not-a-date");

    expect(invalidProvider.isErr()).toBe(true);
    expect(invalidStatus.isErr()).toBe(true);
    expect(invalidPullRequestNumber.isErr()).toBe(true);
    expect(invalidExpiresAt.isErr()).toBe(true);
    if (invalidProvider.isErr()) {
      expect(invalidProvider.error.details).toMatchObject({
        phase: "preview-environment-admission",
        field: "provider",
      });
    }
  });
});
