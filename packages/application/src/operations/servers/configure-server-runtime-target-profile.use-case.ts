import {
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
  RuntimeTargetProfile,
  ServerByIdSpec,
  safeTry,
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ServerRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ConfigureServerRuntimeTargetProfileCommandPayload,
  type ConfigureServerRuntimeTargetProfileResult,
} from "./configure-server-runtime-target-profile.schema";

function serverNotFound(serverId: string) {
  const error = domainError.notFound("server", serverId);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "runtime-target-profile-admission",
      serverId,
    },
  };
}

@injectable()
export class ConfigureServerRuntimeTargetProfileUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureServerRuntimeTargetProfileCommandPayload,
  ): Promise<Result<ConfigureServerRuntimeTargetProfileResult>> {
    const { clock, eventBus, logger, serverRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const profile = yield* RuntimeTargetProfile.create({
        connectionReference: input.connectionReference,
        ...(input.credentialReference ? { credentialReference: input.credentialReference } : {}),
        ...(input.placementPolicyReference
          ? { placementPolicyReference: input.placementPolicyReference }
          : {}),
        ...(input.routingPolicyReference
          ? { routingPolicyReference: input.routingPolicyReference }
          : {}),
        ...(input.registryCredentialReference
          ? { registryCredentialReference: input.registryCredentialReference }
          : {}),
        ...(input.capabilityPolicyReference
          ? { capabilityPolicyReference: input.capabilityPolicyReference }
          : {}),
      });
      const server = await serverRepository.findOne(
        repositoryContext,
        ServerByIdSpec.create(serverId),
      );

      if (!server || server.toState().lifecycleStatus.isDeleted()) {
        return err(serverNotFound(input.serverId));
      }

      const configuredAt = yield* UpdatedAt.create(clock.now());
      const configured = yield* server.configureRuntimeTargetProfile({ profile, configuredAt });

      if (configured.changed) {
        await serverRepository.upsert(
          repositoryContext,
          server,
          UpsertServerSpec.fromServer(server),
        );
        await publishDomainEventsAndReturn(context, eventBus, logger, server, undefined);
      }

      return ok({
        profile: server.toState().runtimeTargetProfile?.toSnapshot() ?? profile.toSnapshot(),
        changed: configured.changed,
      });
    });
  }
}
