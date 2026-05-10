import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { ApplyActionPreviewRouteUseCase } from "../src/operations/deployments/apply-action-preview-route.use-case";
import { ConfirmActionPreviewRouteUseCase } from "../src/operations/deployments/confirm-action-preview-route.use-case";
import {
  type DeploymentRepository,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type ServerAppliedRouteStateUpdateSpec,
  type ServerAppliedRouteStateUpsertSpec,
} from "../src/ports";

class CapturingRouteStateRepository implements ServerAppliedRouteStateRepository {
  record: ServerAppliedRouteDesiredStateRecord | undefined;

  async findOne(
    _spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async upsert(
    record: ServerAppliedRouteDesiredStateRecord,
    _spec: ServerAppliedRouteStateUpsertSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    this.record = record;
    return ok(record);
  }

  async updateOne(
    _spec: ServerAppliedRouteStateSelectionSpec,
    _updateSpec: ServerAppliedRouteStateUpdateSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async deleteOne(_spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<boolean>> {
    return ok(false);
  }

  async deleteMany(_spec: ServerAppliedRouteStateSelectionSpec): Promise<Result<number>> {
    return ok(0);
  }
}

function deploymentRepositoryWithRoutes(hasRealizedAccessRoute: boolean): DeploymentRepository {
  return {
    findOne: async (_context: RepositoryContext, _spec: unknown) =>
      ({
        hasRealizedAccessRoute: () => hasRealizedAccessRoute,
      }) as unknown,
  } as DeploymentRepository;
}

describe("Action preview route application", () => {
  const context = createExecutionContext({
    requestId: "req_action_preview_route_test",
    entrypoint: "system",
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] stores preview route as server-applied desired state", async () => {
    const repository = new CapturingRouteStateRepository();
    const result = await new ApplyActionPreviewRouteUseCase(repository).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A42:github:repo:.:appaloft.yml",
      projectId: "prj_console",
      environmentId: "env_preview",
      resourceId: "res_preview",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      host: "pr-42.preview.example.com",
      pathPrefix: "/",
      tlsMode: "disabled",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      previewUrl: "http://pr-42.preview.example.com",
    });
    expect(repository.record).toMatchObject({
      routeSetId: "prj_console:env_preview:res_preview:srv_prod:dst_prod",
      sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A42:github:repo:.:appaloft.yml",
      domains: [
        {
          host: "pr-42.preview.example.com",
          pathPrefix: "/",
          tlsMode: "disabled",
        },
      ],
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] rejects preview route intent without a server id", async () => {
    const repository = new CapturingRouteStateRepository();
    const result = await new ApplyActionPreviewRouteUseCase(repository).execute(context, {
      sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A42:github:repo:.:appaloft.yml",
      projectId: "prj_console",
      environmentId: "env_preview",
      resourceId: "res_preview",
      host: "pr-42.preview.example.com",
      pathPrefix: "/",
      tlsMode: "disabled",
    });

    expect(result).toEqual(
      err(
        domainError.validation("Action server config preview route requires a server id", {
          phase: "profile-application",
          resourceId: "res_preview",
        }),
      ),
    );
    expect(repository.record).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] rejects fallback routes when custom preview host was requested", async () => {
    const useCase = new ConfirmActionPreviewRouteUseCase(deploymentRepositoryWithRoutes(false));

    const result = await useCase.execute(context, {
      deploymentId: "dep_preview",
      host: "pr-42.preview.example.com",
      pathPrefix: "/",
      tlsMode: "disabled",
    });

    expect(result).toEqual(
      err(
        domainError.validation(
          "Action server config preview route was not realized; deployment did not use the requested preview domain",
          {
            phase: "preview-route-verification",
            deploymentId: "dep_preview",
            expectedHost: "pr-42.preview.example.com",
            expectedPathPrefix: "/",
            expectedTlsMode: "disabled",
          },
        ),
      ),
    );
  });
});
