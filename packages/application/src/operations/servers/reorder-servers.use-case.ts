import {
  DeploymentTargetByIdSpec,
  DeploymentTargetDisplayOrder,
  DeploymentTargetId,
  defaultSelfHostedOrganizationId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type EventBus,
  type OperationGuardPort,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ReorderServersCommandInput } from "./reorder-servers.command";

const reorderServersOperation = findOperationCatalogEntryByKey("servers.reorder");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

@injectable()
export class ReorderServersUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ReorderServersCommandInput,
  ): Promise<Result<{ reorderedServerIds: string[] }>> {
    const { clock, eventBus, logger, operationGuardPort, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverIds = input.serverIds;
      const startOffset = input.startOffset ?? 0;
      if (new Set(serverIds).size !== serverIds.length) {
        return err(
          domainError.validation("Server ids must be unique", {
            phase: "command-validation",
            field: "serverIds",
          }),
        );
      }

      const servers = [];
      for (const rawServerId of serverIds) {
        const serverId = yield* DeploymentTargetId.create(rawServerId);
        const server = await serverRepository.findOne(
          repositoryContext,
          DeploymentTargetByIdSpec.create(serverId),
        );

        if (!server) {
          return err(domainError.notFound("server", rawServerId));
        }

        servers.push(server);
      }

      const organizationId =
        context.principal?.activeOrganization?.organizationId ?? defaultSelfHostedOrganizationId;
      const firstServerId = serverIds[0];
      if (!firstServerId) {
        return err(domainError.validation("Server ids are required"));
      }
      if (reorderServersOperation) {
        const checked = await checkOperationGuards({
          context,
          entry: reorderServersOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          organizationId,
          resourceRefs: {
            serverId: firstServerId,
          },
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const reorderedAt = yield* UpdatedAt.create(clock.now());
      const normalizedStartOffset =
        typeof startOffset === "number" && Number.isFinite(startOffset) ? startOffset : 0;
      const changedServers = [];
      for (const [index, server] of servers.entries()) {
        const displayOrder = yield* DeploymentTargetDisplayOrder.create(
          normalizedStartOffset + index,
        );
        const reorderResult = yield* server.reorder({
          displayOrder,
          reorderedAt,
        });

        if (reorderResult.changed) {
          changedServers.push(server);
        }
      }

      for (const server of changedServers) {
        await serverRepository.upsert(
          repositoryContext,
          server,
          UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);
      }

      return ok({ reorderedServerIds: serverIds });
    });
  }
}
