import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ok,
  type PreviewEnvironment,
  type PreviewEnvironmentMutationSpec,
  type PreviewEnvironmentSelectionSpec,
  type Result,
} from "@appaloft/core";

import {
  createExecutionContext,
  type ExecutionContext,
  type PreviewEnvironmentRepository,
  PreviewLifecycleService,
  PreviewPolicyEvaluator,
  type RepositoryContext,
  type SourceEventDeploymentDispatcher,
  type SourceEventDeploymentDispatchInput,
  type SourceEventDeploymentDispatchResult,
} from "../src";

class SequentialIdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }
}

class FixedClock {
  constructor(private readonly value: string) {}

  now(): string {
    return this.value;
  }
}

class InMemoryPreviewEnvironmentRepository implements PreviewEnvironmentRepository {
  previewEnvironment: PreviewEnvironment | null = null;
  upsertCount = 0;

  async findOne(
    _context: RepositoryContext,
    _spec: PreviewEnvironmentSelectionSpec,
  ): Promise<PreviewEnvironment | null> {
    return this.previewEnvironment;
  }

  async upsert(
    _context: RepositoryContext,
    previewEnvironment: PreviewEnvironment,
    _spec: PreviewEnvironmentMutationSpec,
  ): Promise<void> {
    this.previewEnvironment = previewEnvironment;
    this.upsertCount += 1;
  }

  async delete(_context: RepositoryContext, _spec: PreviewEnvironmentMutationSpec): Promise<void> {
    this.previewEnvironment = null;
  }
}

class CapturingPreviewDeploymentDispatcher implements SourceEventDeploymentDispatcher {
  inputs: SourceEventDeploymentDispatchInput[] = [];

  async dispatch(
    _context: ExecutionContext,
    input: SourceEventDeploymentDispatchInput,
  ): Promise<Result<SourceEventDeploymentDispatchResult>> {
    this.inputs.push(input);
    return ok({ deploymentId: `dep_preview_${this.inputs.length}` });
  }
}

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

  test("[PG-PREVIEW-POLICY-001B] creates preview environment and dispatches ids-only deployment", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      new FixedClock("2026-05-06T01:00:00.000Z"),
      new SequentialIdGenerator(),
    );

    const result = await service.deployFromPolicyEligibleEvent(
      createExecutionContext({
        requestId: "req_preview_lifecycle_test",
        entrypoint: "system",
      }),
      {
        sourceEventId: "sevt_preview_1",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
        sourceBindingFingerprint: "srcfp_preview_42",
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        headSha: "abc1234",
        baseRef: "main",
        verified: true,
        requestedSecretScopes: ["preview-runtime"],
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "dispatched",
      previewEnvironmentId: "prenv_1",
      deploymentId: "dep_preview_1",
    });
    expect(repository.previewEnvironment?.toState()).toMatchObject({
      id: { value: "prenv_1" },
      projectId: { value: "prj_preview" },
      environmentId: { value: "env_preview" },
      resourceId: { value: "res_preview_api" },
      serverId: { value: "srv_preview" },
      destinationId: { value: "dst_preview" },
    });
    expect(dispatcher.inputs).toEqual([
      {
        sourceEventId: "sevt_preview_1",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
      },
    ]);
    expect(JSON.stringify(dispatcher.inputs)).not.toContain("pullRequestNumber");
    expect(JSON.stringify(dispatcher.inputs)).not.toContain("headSha");
  });

  test("[PG-PREVIEW-POLICY-001B] updates existing preview environment before dispatch", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      new FixedClock("2026-05-06T01:05:00.000Z"),
      new SequentialIdGenerator(),
    );

    const first = await service.deployFromPolicyEligibleEvent(
      createExecutionContext({
        requestId: "req_preview_lifecycle_update_test",
        entrypoint: "system",
      }),
      {
        sourceEventId: "sevt_preview_1",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
        sourceBindingFingerprint: "srcfp_preview_42",
        provider: "github",
        eventKind: "pull-request",
        eventAction: "opened",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        headSha: "abc1234",
        baseRef: "main",
        verified: true,
      },
    );
    const second = await service.deployFromPolicyEligibleEvent(
      createExecutionContext({
        requestId: "req_preview_lifecycle_update_test",
        entrypoint: "system",
      }),
      {
        sourceEventId: "sevt_preview_2",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
        sourceBindingFingerprint: "srcfp_preview_42",
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 42,
        headSha: "def5678",
        baseRef: "main",
        verified: true,
      },
    );

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    expect(second._unsafeUnwrap()).toMatchObject({
      status: "dispatched",
      previewEnvironmentId: "prenv_1",
      deploymentId: "dep_preview_2",
    });
    expect(repository.upsertCount).toBe(2);
    expect(repository.previewEnvironment?.toState().source.headSha.value).toBe("def5678");
    expect(dispatcher.inputs).toHaveLength(2);
  });
});
