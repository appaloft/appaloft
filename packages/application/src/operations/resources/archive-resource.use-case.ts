import {
  ArchivedAt,
  ArchiveReason,
  type DomainError,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type ResourceRepository,
  type ResourceRuntimeControlCommandResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ArchiveResourceCommandInput } from "./archive-resource.command";

interface ArchiveRuntimeStopper {
  execute(
    context: ExecutionContext,
    input: {
      operation: "stop";
      resourceId: string;
      reason?: string;
      idempotencyKey?: string;
    },
  ): Promise<Result<ResourceRuntimeControlCommandResult>>;
}

function safeRuntimeStopReason(reason: string | undefined): string | undefined {
  return reason ? `archive: ${reason}` : "archive";
}

function archiveRuntimeStopFailed(input: {
  resourceId: string;
  runtimeControlAttemptId?: string;
  status?: string;
  runtimeState?: string;
  errorCode?: string;
}): DomainError {
  return domainError.provider(
    "Resource runtime stop failed before archive",
    {
      phase: "resource-archive-runtime-stop",
      resourceId: input.resourceId,
      ...(input.runtimeControlAttemptId
        ? { runtimeControlAttemptId: input.runtimeControlAttemptId }
        : {}),
      ...(input.status ? { runtimeControlStatus: input.status } : {}),
      ...(input.runtimeState ? { runtimeState: input.runtimeState } : {}),
      ...(input.errorCode ? { safeAdapterErrorCode: input.errorCode } : {}),
    },
    true,
  );
}

function isNoRuntimeStopNeeded(error: DomainError): boolean {
  if (error.code === "resource_runtime_metadata_missing") {
    return true;
  }

  if (
    error.code === "resource_runtime_control_blocked" &&
    error.details?.blockedReason === "runtime-control-target-unsupported"
  ) {
    return true;
  }

  if (
    error.code === "resource_runtime_already_in_state" &&
    error.details?.runtimeState === "stopped"
  ) {
    return true;
  }

  return false;
}

@injectable()
export class ArchiveResourceUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.resourceRuntimeControlUseCase)
    private readonly runtimeStopper: ArchiveRuntimeStopper,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ArchiveResourceCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, logger, resourceRepository, runtimeStopper } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", input.resourceId));
      }

      const reason = yield* ArchiveReason.fromOptional(input.reason);
      const runtimeStopReason = safeRuntimeStopReason(reason?.value);
      const stopResult = await runtimeStopper.execute(context, {
        operation: "stop",
        resourceId: resourceId.value,
        ...(runtimeStopReason ? { reason: runtimeStopReason } : {}),
        ...(input.idempotencyKey
          ? { idempotencyKey: `archive-runtime-stop:${input.idempotencyKey}` }
          : {}),
      });
      if (stopResult.isErr()) {
        if (!isNoRuntimeStopNeeded(stopResult.error)) {
          return err(stopResult.error);
        }
      } else if (stopResult.value.status !== "succeeded") {
        return err(
          archiveRuntimeStopFailed({
            resourceId: resourceId.value,
            runtimeControlAttemptId: stopResult.value.runtimeControlAttemptId,
            status: stopResult.value.status,
            runtimeState: stopResult.value.runtimeState,
            ...(stopResult.value.errorCode ? { errorCode: stopResult.value.errorCode } : {}),
          }),
        );
      }

      const archivedAt = yield* ArchivedAt.create(clock.now());
      const archiveResult = yield* resource.archive({
        archivedAt,
        ...(reason ? { reason } : {}),
      });

      if (!archiveResult.changed) {
        return ok({ id: resourceId.value });
      }

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok({ id: resourceId.value });
    });
  }
}
