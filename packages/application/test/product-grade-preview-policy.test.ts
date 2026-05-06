import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  domainError,
  err,
  ok,
  type PreviewEnvironment,
  type PreviewEnvironmentMutationSpec,
  type PreviewEnvironmentSelectionSpec,
  type Result,
} from "@appaloft/core";

import {
  type CreateDeploymentCommandInput,
  CreateDeploymentSourceEventDispatcher,
  createExecutionContext,
  type ExecutionContext,
  type PreviewEnvironmentRepository,
  type PreviewFeedbackRecord,
  type PreviewFeedbackRecorder,
  PreviewFeedbackService,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
  PreviewLifecycleService,
  type PreviewPolicyDecisionProjection,
  type PreviewPolicyDecisionReadModel,
  type PreviewPolicyDecisionRecorder,
  PreviewPolicyEvaluator,
  PreviewPullRequestEventIngestService,
  PreviewScopedConfigResolver,
  type RepositoryContext,
  type SourceEventDeploymentDispatcher,
  type SourceEventDeploymentDispatchInput,
  type SourceEventDeploymentDispatchResult,
  toRepositoryContext,
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

class CapturingCreateDeploymentUseCase {
  inputs: CreateDeploymentCommandInput[] = [];

  async execute(
    _context: ExecutionContext,
    input: CreateDeploymentCommandInput,
  ): Promise<Result<{ id: string }>> {
    this.inputs.push(input);
    return ok({ id: `dep_create_${this.inputs.length}` });
  }
}

class InMemoryPreviewPolicyDecisionProjection
  implements PreviewPolicyDecisionRecorder, PreviewPolicyDecisionReadModel
{
  private readonly projections = new Map<string, PreviewPolicyDecisionProjection>();

  async record(
    _context: RepositoryContext,
    projection: PreviewPolicyDecisionProjection,
  ): Promise<void> {
    this.projections.set(projection.sourceEventId, projection);
  }

  async findOne(
    _context: RepositoryContext,
    input: { sourceEventId: string },
  ): Promise<PreviewPolicyDecisionProjection | null> {
    return this.projections.get(input.sourceEventId) ?? null;
  }
}

class InMemoryPreviewFeedbackRecorder implements PreviewFeedbackRecorder {
  readonly records = new Map<string, PreviewFeedbackRecord>();

  async findOne(
    _context: RepositoryContext,
    input: { feedbackKey: string },
  ): Promise<PreviewFeedbackRecord | null> {
    return this.records.get(input.feedbackKey) ?? null;
  }

  async record(_context: RepositoryContext, record: PreviewFeedbackRecord): Promise<void> {
    this.records.set(record.feedbackKey, record);
  }
}

class CapturingPreviewFeedbackWriter implements PreviewFeedbackWriter {
  inputs: PreviewFeedbackWriterInput[] = [];
  failRetryably = false;

  async publish(
    _context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    this.inputs.push(input);
    if (this.failRetryably) {
      return err(
        domainError.provider(
          "Preview feedback provider is temporarily unavailable",
          { phase: "preview-feedback" },
          true,
        ),
      );
    }

    return ok({
      providerFeedbackId: input.providerFeedbackId ?? `github_feedback_${this.inputs.length}`,
    });
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
        activePreviewCount: 0,
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

  test("[PG-PREVIEW-POLICY-003] blocks over-quota preview events with safe quota details", () => {
    const result = new PreviewPolicyEvaluator().evaluate({
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 127,
      headSha: "quota123",
      baseRef: "main",
      verified: true,
      activePreviewCount: 3,
      policy: {
        maxActivePreviews: 3,
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "blocked",
      deploymentEligible: false,
      reasonCode: "preview_quota_exceeded",
      safeDetails: {
        activePreviewCount: 3,
        maxActivePreviews: 3,
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
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T01:00:00.000Z"),
      new SequentialIdGenerator(),
    );

    const context = createExecutionContext({
      requestId: "req_preview_lifecycle_test",
      entrypoint: "system",
    });
    const result = await service.deployFromPolicyEligibleEvent(context, {
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
    });

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
    expect(
      await projection.findOne(toRepositoryContext(context), {
        sourceEventId: "sevt_preview_1",
      }),
    ).toMatchObject({
      sourceEventId: "sevt_preview_1",
      status: "allowed",
      deploymentEligible: true,
      activePreviewCount: 0,
      previewEnvironmentId: "prenv_1",
      deploymentId: "dep_preview_1",
    });
  });

  test("[PG-PREVIEW-POLICY-003] applies preview TTL when creating allowed preview environments", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T01:00:00.000Z"),
      new SequentialIdGenerator(),
    );

    const context = createExecutionContext({
      requestId: "req_preview_lifecycle_ttl_test",
      entrypoint: "system",
    });
    const result = await service.deployFromPolicyEligibleEvent(context, {
      sourceEventId: "sevt_preview_ttl_1",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
      sourceBindingFingerprint: "srcfp_preview_ttl",
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 47,
      headSha: "abc1235",
      baseRef: "main",
      verified: true,
      policy: {
        previewTtlHours: 24,
      },
    });
    const projected = await projection.findOne(toRepositoryContext(context), {
      sourceEventId: "sevt_preview_ttl_1",
    });

    expect(result.isOk()).toBe(true);
    expect(repository.previewEnvironment?.toState().expiresAt?.value).toBe(
      "2026-05-07T01:00:00.000Z",
    );
    expect(projected).toMatchObject({
      sourceEventId: "sevt_preview_ttl_1",
      status: "allowed",
      activePreviewCount: 0,
      previewEnvironmentId: "prenv_1",
      previewExpiresAt: "2026-05-07T01:00:00.000Z",
      deploymentId: "dep_preview_1",
    });
  });

  test("[PG-PREVIEW-POLICY-001B] updates existing preview environment before dispatch", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T01:05:00.000Z"),
      new SequentialIdGenerator(),
    );
    const repositoryContext = toRepositoryContext(
      createExecutionContext({
        requestId: "req_preview_lifecycle_projection_lookup_test",
        entrypoint: "system",
      }),
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
    expect(
      await projection.findOne(repositoryContext, {
        sourceEventId: "sevt_preview_2",
      }),
    ).toMatchObject({
      sourceEventId: "sevt_preview_2",
      status: "allowed",
      deploymentEligible: true,
      previewEnvironmentId: "prenv_1",
      deploymentId: "dep_preview_2",
    });
  });

  test("[PG-PREVIEW-EVENT-002] returns existing preview decision for duplicate source events", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T01:10:00.000Z"),
      new SequentialIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_preview_lifecycle_duplicate_test",
      entrypoint: "system",
    });
    const input = {
      sourceEventId: "sevt_preview_duplicate_1",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
      sourceBindingFingerprint: "srcfp_preview_42",
      provider: "github" as const,
      eventKind: "pull-request" as const,
      eventAction: "synchronize" as const,
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "appaloft/demo",
      pullRequestNumber: 42,
      headSha: "abc1234",
      baseRef: "main",
      verified: true,
    };

    const first = await service.deployFromPolicyEligibleEvent(context, input);
    const duplicate = await service.deployFromPolicyEligibleEvent(context, {
      ...input,
      headSha: "def5678",
    });

    expect(first.isOk()).toBe(true);
    expect(duplicate.isOk()).toBe(true);
    expect(duplicate._unsafeUnwrap()).toMatchObject({
      status: "dispatched",
      previewEnvironmentId: "prenv_1",
      deploymentId: "dep_preview_1",
    });
    expect(repository.upsertCount).toBe(1);
    expect(repository.previewEnvironment?.toState().source.headSha.value).toBe("abc1234");
    expect(dispatcher.inputs).toEqual([
      {
        sourceEventId: "sevt_preview_duplicate_1",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
      },
    ]);
  });

  test("[PG-PREVIEW-POLICY-002B] projects blocked fork policy decisions with safe details", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const service = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T01:15:00.000Z"),
      new SequentialIdGenerator(),
    );
    const context = createExecutionContext({
      requestId: "req_preview_lifecycle_blocked_test",
      entrypoint: "system",
    });

    const result = await service.deployFromPolicyEligibleEvent(context, {
      sourceEventId: "sevt_preview_blocked_1",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
      sourceBindingFingerprint: "srcfp_preview_43",
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "external/demo-fork",
      pullRequestNumber: 43,
      headSha: "blocked1234",
      baseRef: "main",
      verified: true,
      requestedSecretScopes: ["preview-runtime", "database"],
    });
    const projected = await projection.findOne(toRepositoryContext(context), {
      sourceEventId: "sevt_preview_blocked_1",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "blocked",
      policyDecision: {
        status: "blocked",
        reasonCode: "preview_fork_disabled",
        deploymentEligible: false,
      },
    });
    expect(repository.upsertCount).toBe(0);
    expect(dispatcher.inputs).toEqual([]);
    expect(projected).toEqual({
      sourceEventId: "sevt_preview_blocked_1",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      provider: "github",
      eventKind: "pull-request",
      eventAction: "opened",
      repositoryFullName: "appaloft/demo",
      headRepositoryFullName: "external/demo-fork",
      pullRequestNumber: 43,
      headSha: "blocked1234",
      baseRef: "main",
      fork: true,
      secretBacked: true,
      requestedSecretScopeCount: 2,
      activePreviewCount: 0,
      status: "blocked",
      phase: "preview-policy-evaluation",
      deploymentEligible: false,
      evaluatedAt: "2026-05-06T01:15:00.000Z",
      reasonCode: "preview_fork_disabled",
    });
    expect(JSON.stringify(projected)).not.toContain("preview-runtime");
    expect(JSON.stringify(projected)).not.toContain("database");
    expect(JSON.stringify(projected)).not.toContain("secretRef");
  });
});

describe("PreviewScopedConfigResolver", () => {
  test("[PG-PREVIEW-CONFIG-001] does not copy production secrets or durable routes by default", () => {
    const result = new PreviewScopedConfigResolver().resolve({
      resourceId: "res_preview_api",
      previewEnvironmentId: "prenv_1",
      effectiveConfig: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_preview_api",
        environmentId: "env_production",
        ownedEntries: [],
        effectiveEntries: [
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "environment",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
          {
            key: "PUBLIC_BASE_URL",
            value: "https://production.example.test",
            scope: "environment",
            exposure: "build-time",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "API_TOKEN",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        overrides: [],
        precedence: [
          "defaults",
          "system",
          "organization",
          "project",
          "environment",
          "resource",
          "deployment",
        ],
        generatedAt: "2026-05-06T04:00:00.000Z",
      },
    });

    expect(result).toEqual({
      schemaVersion: "preview-scoped-config.resolve/v1",
      resourceId: "res_preview_api",
      previewEnvironmentId: "prenv_1",
      variables: [],
      secretReferences: [],
      omittedProductionSecretKeys: ["API_TOKEN", "DATABASE_URL"],
      routePolicy: {
        mode: "none",
        copiedDurableRoutes: [],
      },
    });
  });

  test("[PG-PREVIEW-CONFIG-001] resolves only explicit preview variables and safe secret references", () => {
    const result = new PreviewScopedConfigResolver().resolve({
      resourceId: "res_preview_api",
      previewEnvironmentId: "prenv_1",
      effectiveConfig: {
        schemaVersion: "resources.effective-config/v1",
        resourceId: "res_preview_api",
        environmentId: "env_production",
        ownedEntries: [],
        effectiveEntries: [
          {
            key: "DATABASE_URL",
            value: "****",
            scope: "environment",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
          {
            key: "PUBLIC_BASE_URL",
            value: "https://preview.example.test",
            scope: "resource",
            exposure: "build-time",
            isSecret: false,
            kind: "plain-config",
          },
          {
            key: "API_TOKEN",
            value: "****",
            scope: "resource",
            exposure: "runtime",
            isSecret: true,
            kind: "secret",
          },
        ],
        overrides: [],
        precedence: [
          "defaults",
          "system",
          "organization",
          "project",
          "environment",
          "resource",
          "deployment",
        ],
        generatedAt: "2026-05-06T04:00:00.000Z",
      },
      variableSelections: [{ key: "PUBLIC_BASE_URL", exposure: "build-time" }],
      secretSelections: [{ key: "DATABASE_URL", exposure: "runtime" }],
      routePolicy: { mode: "generated-default-access", pathPrefix: "/pr-42" },
    });

    expect(result).toEqual({
      schemaVersion: "preview-scoped-config.resolve/v1",
      resourceId: "res_preview_api",
      previewEnvironmentId: "prenv_1",
      variables: [
        {
          key: "PUBLIC_BASE_URL",
          value: "https://preview.example.test",
          exposure: "build-time",
          kind: "plain-config",
          sourceScope: "resource",
        },
      ],
      secretReferences: [
        {
          key: "DATABASE_URL",
          exposure: "runtime",
          kind: "secret",
          sourceScope: "environment",
        },
      ],
      omittedProductionSecretKeys: ["API_TOKEN"],
      routePolicy: {
        mode: "generated-default-access",
        copiedDurableRoutes: [],
        pathPrefix: "/pr-42",
      },
    });
    expect(JSON.stringify(result)).not.toContain("postgres://");
    expect(JSON.stringify(result)).not.toContain("****");
  });
});

describe("PreviewDeploymentDispatch", () => {
  test("[PG-PREVIEW-DEPLOY-001] dispatches preview deployments through ids-only create input", async () => {
    const createDeploymentUseCase = new CapturingCreateDeploymentUseCase();
    const dispatcher = new CreateDeploymentSourceEventDispatcher(createDeploymentUseCase);
    const context = createExecutionContext({
      requestId: "req_preview_deploy_dispatch_test",
      entrypoint: "system",
    });

    const result = await dispatcher.dispatch(context, {
      sourceEventId: "sevt_preview_dispatch_1",
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ deploymentId: "dep_create_1" });
    expect(createDeploymentUseCase.inputs).toEqual([
      {
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
      },
    ]);
    expect(JSON.stringify(createDeploymentUseCase.inputs)).not.toContain("sourceEventId");
    expect(JSON.stringify(createDeploymentUseCase.inputs)).not.toContain("pullRequestNumber");
    expect(JSON.stringify(createDeploymentUseCase.inputs)).not.toContain("headSha");
    expect(JSON.stringify(createDeploymentUseCase.inputs)).not.toContain("baseRef");
  });
});

describe("PreviewPullRequestEventIngestService", () => {
  test("[PG-PREVIEW-EVENT-001] routes normalized pull request events into preview lifecycle", async () => {
    const repository = new InMemoryPreviewEnvironmentRepository();
    const dispatcher = new CapturingPreviewDeploymentDispatcher();
    const projection = new InMemoryPreviewPolicyDecisionProjection();
    const lifecycle = new PreviewLifecycleService(
      repository,
      dispatcher,
      projection,
      projection,
      new FixedClock("2026-05-06T04:20:00.000Z"),
      new SequentialIdGenerator(),
    );
    const ingest = new PreviewPullRequestEventIngestService(lifecycle);
    const context = createExecutionContext({
      requestId: "req_preview_pull_request_ingest_test",
      entrypoint: "system",
    });

    const result = await ingest.ingest(context, {
      sourceEventId: "sevt_preview_pull_request_1",
      event: {
        provider: "github",
        eventKind: "pull-request",
        eventAction: "synchronize",
        repositoryFullName: "appaloft/demo",
        headRepositoryFullName: "appaloft/demo",
        pullRequestNumber: 48,
        headSha: "abc1234",
        baseRef: "main",
        verified: true,
        deliveryId: "delivery_preview_48",
      },
      projectId: "prj_preview",
      environmentId: "env_preview",
      resourceId: "res_preview_api",
      serverId: "srv_preview",
      destinationId: "dst_preview",
      sourceBindingFingerprint: "srcfp_preview_48",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      status: "routed",
      lifecycleResult: {
        status: "dispatched",
        previewEnvironmentId: "prenv_1",
        deploymentId: "dep_preview_1",
      },
    });
    expect(repository.previewEnvironment?.toState()).toMatchObject({
      id: { value: "prenv_1" },
      source: {
        pullRequestNumber: { value: 48 },
        headSha: { value: "abc1234" },
        baseRef: { value: "main" },
      },
    });
    expect(dispatcher.inputs).toEqual([
      {
        sourceEventId: "sevt_preview_pull_request_1",
        projectId: "prj_preview",
        environmentId: "env_preview",
        resourceId: "res_preview_api",
        serverId: "srv_preview",
        destinationId: "dst_preview",
      },
    ]);
  });
});

describe("PreviewFeedbackService", () => {
  test("[PG-PREVIEW-FEEDBACK-001] updates existing provider feedback idempotently", async () => {
    const writer = new CapturingPreviewFeedbackWriter();
    const recorder = new InMemoryPreviewFeedbackRecorder();
    const service = new PreviewFeedbackService(
      writer,
      recorder,
      new FixedClock("2026-05-06T04:30:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_preview_feedback_idempotent_test",
      entrypoint: "system",
    });
    const input = {
      feedbackKey: "feedback:sevt_preview_1:comment",
      sourceEventId: "sevt_preview_1",
      previewEnvironmentId: "prenv_1",
      channel: "github-pr-comment" as const,
      repositoryFullName: "appaloft/demo",
      pullRequestNumber: 48,
      body: "Preview deployment accepted.",
    };

    const first = await service.publish(context, input);
    const second = await service.publish(context, {
      ...input,
      body: "Preview deployment updated.",
    });

    expect(first._unsafeUnwrap()).toEqual({
      status: "created",
      providerFeedbackId: "github_feedback_1",
    });
    expect(second._unsafeUnwrap()).toEqual({
      status: "updated",
      providerFeedbackId: "github_feedback_1",
    });
    expect(writer.inputs).toEqual([
      expect.objectContaining({
        feedbackKey: "feedback:sevt_preview_1:comment",
        body: "Preview deployment accepted.",
      }),
      expect.objectContaining({
        feedbackKey: "feedback:sevt_preview_1:comment",
        providerFeedbackId: "github_feedback_1",
        body: "Preview deployment updated.",
      }),
    ]);
    expect(recorder.records.get("feedback:sevt_preview_1:comment")).toEqual({
      feedbackKey: "feedback:sevt_preview_1:comment",
      sourceEventId: "sevt_preview_1",
      previewEnvironmentId: "prenv_1",
      channel: "github-pr-comment",
      status: "published",
      providerFeedbackId: "github_feedback_1",
      updatedAt: "2026-05-06T04:30:00.000Z",
    });
  });

  test("[PG-PREVIEW-FEEDBACK-001] records retryable provider failures without returning err", async () => {
    const writer = new CapturingPreviewFeedbackWriter();
    writer.failRetryably = true;
    const recorder = new InMemoryPreviewFeedbackRecorder();
    const service = new PreviewFeedbackService(
      writer,
      recorder,
      new FixedClock("2026-05-06T04:35:00.000Z"),
    );
    const context = createExecutionContext({
      requestId: "req_preview_feedback_retryable_test",
      entrypoint: "system",
    });

    const result = await service.publish(context, {
      feedbackKey: "feedback:sevt_preview_retry:comment",
      sourceEventId: "sevt_preview_retry",
      previewEnvironmentId: "prenv_retry",
      channel: "github-pr-comment",
      repositoryFullName: "appaloft/demo",
      pullRequestNumber: 49,
      body: "Preview deployment accepted.",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      status: "retryable-failed",
      errorCode: "provider_error",
      retryable: true,
    });
    expect(recorder.records.get("feedback:sevt_preview_retry:comment")).toEqual({
      feedbackKey: "feedback:sevt_preview_retry:comment",
      sourceEventId: "sevt_preview_retry",
      previewEnvironmentId: "prenv_retry",
      channel: "github-pr-comment",
      status: "retryable-failed",
      errorCode: "provider_error",
      retryable: true,
      updatedAt: "2026-05-06T04:35:00.000Z",
    });
  });
});
