import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type RuntimeTargetBackendRegistry,
  type RuntimeTargetReadinessInspection,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type InspectServerRuntimeReadinessQuery } from "./inspect-server-runtime-readiness.query";

function blocked(input: {
  serverId: string;
  checkedAt: string;
  reasonCode: string;
  message: string;
}): RuntimeTargetReadinessInspection {
  return {
    schemaVersion: "servers.runtime-readiness/v1",
    serverId: input.serverId,
    targetKind: "orchestrator-cluster",
    status: "blocked",
    checks: [
      {
        capability: "api-reachability",
        status: "blocked",
        reasonCode: input.reasonCode,
        message: input.message,
      },
    ],
    checkedAt: input.checkedAt,
  };
}

@injectable()
export class InspectServerRuntimeReadinessQueryService {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.runtimeTargetBackendRegistry)
    private readonly backendRegistry: RuntimeTargetBackendRegistry,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: InspectServerRuntimeReadinessQuery,
  ): Promise<Result<RuntimeTargetReadinessInspection>> {
    const serverId = DeploymentTargetId.create(query.serverId);
    if (serverId.isErr()) {
      return err(serverId.error);
    }

    const server = await this.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server || server.toState().lifecycleStatus.isDeleted()) {
      const error = domainError.notFound("server", query.serverId);
      return err({
        ...error,
        details: {
          ...(error.details ?? {}),
          queryName: "servers.runtime-readiness",
          phase: "server-read",
          serverId: query.serverId,
        },
      });
    }

    const state = server.toState();
    if (state.targetKind.value !== "orchestrator-cluster") {
      return err(
        domainError.runtimeTargetUnsupported(
          "Runtime readiness requires an orchestrator cluster target",
          {
            queryName: "servers.runtime-readiness",
            phase: "runtime-target-readiness-admission",
            serverId: query.serverId,
            targetKind: state.targetKind.value,
          },
        ),
      );
    }

    const checkedAt = this.clock.now();
    if (!state.runtimeTargetProfile) {
      return ok(
        blocked({
          serverId: query.serverId,
          checkedAt,
          reasonCode: "runtime-target-profile-missing",
          message: "Configure the runtime target profile before inspecting readiness",
        }),
      );
    }

    const selected = this.backendRegistry.find({
      targetKind: state.targetKind.value,
      providerKey: state.providerKey.value,
      requiredCapabilities: ["runtime.readiness"],
    });
    if (selected.isErr()) {
      return ok(
        blocked({
          serverId: query.serverId,
          checkedAt,
          reasonCode: "runtime-target-backend-unavailable",
          message: "No exact runtime target readiness backend is registered",
        }),
      );
    }

    if (!selected.value.inspectReadiness) {
      return ok(
        blocked({
          serverId: query.serverId,
          checkedAt,
          reasonCode: "runtime-target-readiness-unavailable",
          message: "The selected backend does not implement readiness inspection",
        }),
      );
    }

    const inspection = await selected.value.inspectReadiness(context, state);
    if (inspection.isErr()) {
      return err({
        ...inspection.error,
        details: {
          ...(inspection.error.details ?? {}),
          queryName: "servers.runtime-readiness",
          phase: "runtime-target-readiness",
          serverId: query.serverId,
        },
      });
    }

    return ok({
      schemaVersion: "servers.runtime-readiness/v1",
      serverId: query.serverId,
      targetKind: "orchestrator-cluster",
      status: inspection.value.checks.every((check) => check.status === "ready")
        ? "ready"
        : "blocked",
      checks: inspection.value.checks.map((check) => ({ ...check })),
      checkedAt,
    });
  }
}
