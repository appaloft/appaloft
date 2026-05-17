import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import { createExecutionContext } from "../src/execution-context";
import { CreateActionSourceLinkDeploymentUseCase } from "../src/operations/source-links/create-action-source-link-deployment.use-case";
import { ResolveActionServerConfigDeploymentTargetUseCase } from "../src/operations/source-links/resolve-action-server-config-deployment-target.use-case";
import {
  type Clock,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type SourceLinkUpsertSpec,
} from "../src/ports";

class MemorySourceLinkRepository implements SourceLinkRepository {
  upserted: SourceLinkRecord | undefined;

  constructor(private record: SourceLinkRecord | null) {}

  async findOne(spec: SourceLinkSelectionSpec): Promise<Result<SourceLinkRecord | null>> {
    const requested = spec.accept("", {
      visitSourceLinkBySourceFingerprint: (_query, sourceFingerprintSpec) =>
        sourceFingerprintSpec.sourceFingerprint,
    });
    return ok(this.record?.sourceFingerprint === requested ? this.record : null);
  }

  async upsert(
    record: SourceLinkRecord,
    _spec: SourceLinkUpsertSpec,
  ): Promise<Result<SourceLinkRecord>> {
    this.record = record;
    this.upserted = record;
    return ok(record);
  }

  async deleteOne(_spec: SourceLinkSelectionSpec): Promise<Result<boolean>> {
    return ok(false);
  }
}

const fixedClock = {
  now: () => "2026-05-10T00:00:00.000Z",
} satisfies Clock;

const context = createExecutionContext({
  requestId: "req_action_source_link_deployment_test",
  entrypoint: "system",
});

describe("Action source-link deployment application commands", () => {
  test("[CONTROL-PLANE-HANDSHAKE-010] creates deployment from existing source link without adapter repository policy", async () => {
    const repository = new MemorySourceLinkRepository({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_linked",
      environmentId: "env_linked",
      resourceId: "res_linked",
      serverId: "srv_linked",
      destinationId: "dst_linked",
      updatedAt: "2026-05-09T00:00:00.000Z",
    });
    let deploymentInput: unknown;
    const createDeploymentUseCase = {
      execute: async (_context: typeof context, input: unknown) => {
        deploymentInput = input;
        return ok({ id: "dep_linked" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
    });

    expect(result).toEqual(ok({ id: "dep_linked" }));
    expect(deploymentInput).toEqual({
      projectId: "prj_linked",
      environmentId: "env_linked",
      resourceId: "res_linked",
      serverId: "srv_linked",
      destinationId: "dst_linked",
    });
    expect(repository.upserted).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-010] bootstraps missing source link after deployment admission", async () => {
    const repository = new MemorySourceLinkRepository(null);
    const createDeploymentUseCase = {
      execute: async () => ok({ id: "dep_bootstrapped" }),
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });

    expect(result).toEqual(ok({ id: "dep_bootstrapped" }));
    expect(repository.upserted).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      reason: "github-action-source-link-bootstrap",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-020] explicit bootstrap ids inside deploy token scope succeed", async () => {
    const repository = new MemorySourceLinkRepository(null);
    let deploymentInput: unknown;
    const createDeploymentUseCase = {
      execute: async (_context: typeof context, input: unknown) => {
        deploymentInput = input;
        return ok({ id: "dep_bootstrapped_scoped" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      authorizedTokenScope: {
        projectIds: ["prj_console"],
        environmentIds: ["env_prod"],
        resourceIds: ["res_www"],
        serverIds: ["srv_prod"],
        repositoryFullNames: [],
      },
    });

    expect(result).toEqual(ok({ id: "dep_bootstrapped_scoped" }));
    expect(deploymentInput).toEqual({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
    });
    expect(repository.upserted).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      reason: "github-action-source-link-bootstrap",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-018] resolves source-link deployment target from complete deploy token scope without ids", async () => {
    const repository = new MemorySourceLinkRepository(null);
    let deploymentInput: unknown;
    const createDeploymentUseCase = {
      execute: async (_context: typeof context, input: unknown) => {
        deploymentInput = input;
        return ok({ id: "dep_token_scope" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      trustedContext: {
        repositoryFullName: "appaloft/www",
        ref: "refs/heads/main",
        revision: "sha_main",
      },
      authorizedTokenScope: {
        projectIds: ["prj_console"],
        environmentIds: ["env_prod"],
        resourceIds: ["res_www"],
        serverIds: ["srv_prod"],
        repositoryFullNames: ["appaloft/www"],
      },
    });

    expect(result).toEqual(ok({ id: "dep_token_scope" }));
    expect(deploymentInput).toEqual({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
    });
    expect(repository.upserted).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      reason: "github-action-token-scope",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-019] unresolved source-link target fails before deployment mutation with recovery guidance", async () => {
    const repository = new MemorySourceLinkRepository(null);
    let deploymentCalled = false;
    const createDeploymentUseCase = {
      execute: async () => {
        deploymentCalled = true;
        return ok({ id: "dep_unexpected" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amissing",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "action_deployment_target_unresolved",
        details: {
          phase: "source-link-resolution",
          nextActions: [
            "create-or-link-source-binding-in-console",
            "run-source-links-relink",
            "pass-one-time-trusted-bootstrap-ids",
          ],
        },
      });
    }
    expect(deploymentCalled).toBe(false);
    expect(repository.upserted).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-004] explicit bootstrap ids outside deploy token scope fail before deployment mutation", async () => {
    const repository = new MemorySourceLinkRepository(null);
    let deploymentCalled = false;
    const createDeploymentUseCase = {
      execute: async () => {
        deploymentCalled = true;
        return ok({ id: "dep_unexpected" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_blocked",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      authorizedTokenScope: {
        projectIds: ["prj_console"],
        environmentIds: ["env_prod"],
        resourceIds: ["res_www"],
        serverIds: ["srv_prod"],
        repositoryFullNames: [],
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "action_auth_forbidden",
        details: {
          missingScope: "project",
          phase: "action-authorization",
          projectId: "prj_blocked",
        },
      });
    }
    expect(deploymentCalled).toBe(false);
    expect(repository.upserted).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-020] explicit bootstrap ids conflict with existing source link before deployment mutation", async () => {
    const repository = new MemorySourceLinkRepository({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      updatedAt: "2026-05-09T00:00:00.000Z",
    });
    let deploymentCalled = false;
    const createDeploymentUseCase = {
      execute: async () => {
        deploymentCalled = true;
        return ok({ id: "dep_unexpected" });
      },
    };

    const result = await new CreateActionSourceLinkDeploymentUseCase(
      repository,
      createDeploymentUseCase as never,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_other",
      serverId: "srv_prod",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "action_deployment_target_conflict",
        details: {
          phase: "source-link-resolution",
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        },
      });
    }
    expect(deploymentCalled).toBe(false);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] resolves server config target through application command", async () => {
    const repository = new MemorySourceLinkRepository(null);

    const result = await new ResolveActionServerConfigDeploymentTargetUseCase(
      repository,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      trustedContext: {
        projectId: "prj_console",
        environmentId: "env_prod",
        resourceId: "res_www",
        serverId: "srv_prod",
      },
    });

    expect(result).toEqual(
      ok({
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        projectId: "prj_console",
        environmentId: "env_prod",
        resourceId: "res_www",
        serverId: "srv_prod",
        updatedAt: "2026-05-10T00:00:00.000Z",
        reason: "github-action-server-config-bootstrap",
      }),
    );
  });

  test("[CONTROL-PLANE-HANDSHAKE-018] resolves server config target from complete deploy token scope without ids", async () => {
    const repository = new MemorySourceLinkRepository(null);

    const result = await new ResolveActionServerConfigDeploymentTargetUseCase(
      repository,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      trustedContext: {
        repositoryFullName: "appaloft/www",
        ref: "refs/heads/main",
        revision: "sha_main",
      },
      authorizedTokenScope: {
        projectIds: ["prj_console"],
        environmentIds: ["env_prod"],
        resourceIds: ["res_www"],
        serverIds: ["srv_prod"],
        repositoryFullNames: ["appaloft/www"],
      },
    });

    expect(result).toEqual(
      ok({
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        projectId: "prj_console",
        environmentId: "env_prod",
        resourceId: "res_www",
        serverId: "srv_prod",
        updatedAt: "2026-05-10T00:00:00.000Z",
        reason: "github-action-token-scope",
      }),
    );
    expect(repository.upserted).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      reason: "github-action-token-scope",
    });
  });

  test("[CONFIG-FILE-ENTRY-021] preview source fingerprint does not fall back to production branch target", async () => {
    const repository = new MemorySourceLinkRepository({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      updatedAt: "2026-05-09T00:00:00.000Z",
    });

    const result = await new ResolveActionServerConfigDeploymentTargetUseCase(
      repository,
      fixedClock,
    ).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A14",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "action_deployment_target_unresolved",
        details: {
          sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A14",
        },
      });
    }
    expect(repository.upserted).toBeUndefined();
  });
});
