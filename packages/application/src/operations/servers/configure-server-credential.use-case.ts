import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertDeploymentTargetSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type ServerRepository,
  type SshCredentialRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ConfigureServerCredentialCommandInput } from "./configure-server-credential.command";
import { resolveDeploymentTargetCredentialState } from "./deployment-target-credential-input";

@injectable()
export class ConfigureServerCredentialUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.sshCredentialRepository)
    private readonly sshCredentialRepository: SshCredentialRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureServerCredentialCommandInput,
  ): Promise<Result<null>> {
    const { clock, eventBus, logger, serverRepository, sshCredentialRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const serverId = yield* DeploymentTargetId.create(input.serverId);
      const server = await serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverId),
      );

      if (!server) {
        return err(domainError.notFound("server", input.serverId));
      }

      const configuredAt = yield* UpdatedAt.create(clock.now());
      const credential = yield* await resolveDeploymentTargetCredentialState({
        credential: input.credential,
        repositoryContext,
        sshCredentialRepository,
      });

      yield* server.configureCredential({
        credential,
        configuredAt,
      });

      await serverRepository.upsert(
        repositoryContext,
        server,
        UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, server, null);

      return ok(null);
    });
  }
}
