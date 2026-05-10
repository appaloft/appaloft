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

  async findOne(_spec: SourceLinkSelectionSpec): Promise<Result<SourceLinkRecord | null>> {
    return ok(this.record);
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
});
