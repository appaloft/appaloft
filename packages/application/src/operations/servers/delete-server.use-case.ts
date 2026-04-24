import {
  DeletedAt,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
  ServerByIdSpec,
  safeTry,
  UpsertServerSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type ServerDeleteBlocker,
  type ServerDeletionBlockerReader,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeleteServerCommandInput } from "./delete-server.command";
import { activeServerDeleteBlocker, uniqueServerDeleteBlockerKinds } from "./server-delete-safety";

function deletionBlockedError(input: {
  serverId: string;
  lifecycleStatus: "active" | "inactive";
  blockers: ServerDeleteBlocker[];
}) {
  return domainError.serverDeleteBlocked("Server deletion is blocked by retained state", {
    phase: "server-lifecycle-guard",
    serverId: input.serverId,
    lifecycleStatus: input.lifecycleStatus,
    deletionBlockers: uniqueServerDeleteBlockerKinds(input.blockers),
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityId
      ? { relatedEntityId: input.blockers[0].relatedEntityId }
      : {}),
    ...(input.blockers.length === 1 && input.blockers[0]?.relatedEntityType
      ? { relatedEntityType: input.blockers[0].relatedEntityType }
      : {}),
    ...(input.blockers.length === 1 && typeof input.blockers[0]?.count === "number"
      ? { blockerCount: input.blockers[0].count }
      : {}),
  });
}

function confirmationMismatchError(input: { serverId: string; confirmationServerId: string }) {
  return domainError.validation("Server id confirmation does not match", {
    phase: "server-lifecycle-guard",
    serverId: input.serverId,
    expectedServerId: input.serverId,
    actualServerId: input.confirmationServerId,
  });
}

function serverNotFound(serverId: string) {
  const error = domainError.notFound("server", serverId);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "server-admission",
      serverId,
    },
  };
}

@injectable()
export class DeleteServerUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverDeletionBlockerReader)
    private readonly deletionBlockerReader: ServerDeletionBlockerReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteServerCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, deletionBlockerReader, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const server = await serverRepository.findOne(
        repositoryContext,
        ServerByIdSpec.create(serverId),
      );

      if (!server) {
        return err(serverNotFound(input.serverId));
      }

      const state = server.toState();
      if (state.lifecycleStatus.isDeleted()) {
        return ok({ id: serverId.value });
      }

      if (state.lifecycleStatus.isActive()) {
        return err(
          deletionBlockedError({
            serverId: serverId.value,
            lifecycleStatus: "active",
            blockers: [activeServerDeleteBlocker(serverId.value)],
          }),
        );
      }

      const confirmationServerId = yield* DeploymentTargetId.create(input.confirmation.serverId);
      if (!confirmationServerId.equals(serverId)) {
        return err(
          confirmationMismatchError({
            serverId: serverId.value,
            confirmationServerId: confirmationServerId.value,
          }),
        );
      }

      const blockers = yield* await deletionBlockerReader.findBlockers(repositoryContext, {
        serverId: serverId.value,
      });
      if (blockers.length > 0) {
        return err(
          deletionBlockedError({
            serverId: serverId.value,
            lifecycleStatus: "inactive",
            blockers,
          }),
        );
      }

      const deletedAt = yield* DeletedAt.create(clock.now());
      const deleteResult = yield* server.delete({ deletedAt });
      if (!deleteResult.changed) {
        return ok({ id: serverId.value });
      }

      await serverRepository.upsert(repositoryContext, server, UpsertServerSpec.fromServer(server));
      await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);

      return ok({ id: serverId.value });
    });
  }
}
