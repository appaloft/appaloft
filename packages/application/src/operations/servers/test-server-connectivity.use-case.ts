import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  type DeploymentTargetState,
  domainError,
  err,
  HostAddress,
  PortNumber,
  ProviderKey,
  type Result,
  safeTry,
  UpdatedAt,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ServerConnectivityChecker,
  type ServerConnectivityResult,
  type ServerRepository,
  type SshCredentialRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { resolveDeploymentTargetCredentialState } from "./deployment-target-credential-input";
import { type ParsedTestServerConnectivityCommandInput } from "./test-server-connectivity.command";

@injectable()
export class TestServerConnectivityUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.sshCredentialRepository)
    private readonly sshCredentialRepository: SshCredentialRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.serverConnectivityChecker)
    private readonly connectivityChecker: ServerConnectivityChecker,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedTestServerConnectivityCommandInput,
  ): Promise<Result<ServerConnectivityResult>> {
    const { clock, connectivityChecker, serverRepository, sshCredentialRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      let serverState: DeploymentTargetState;

      if ("serverId" in input) {
        const serverId = yield* DeploymentTargetId.create(input.serverId);
        const server = await serverRepository.findOne(
          repositoryContext,
          DeploymentTargetByIdSpec.create(serverId),
        );

        if (!server) {
          return err(domainError.notFound("server", input.serverId));
        }

        serverState = server.toState();
      } else {
        const draft = input.server;
        const now = clock.now();
        const createdAt = yield* CreatedAt.create(now);
        const configuredAt = yield* UpdatedAt.create(now);
        const server = yield* DeploymentTarget.register({
          id: yield* DeploymentTargetId.create("draft_server"),
          name: yield* DeploymentTargetName.create(draft.name ?? draft.host),
          host: yield* HostAddress.create(draft.host),
          port: yield* PortNumber.create(draft.port ?? 22),
          providerKey: yield* ProviderKey.create(draft.providerKey),
          createdAt,
        });

        if (draft.credential) {
          const credential = yield* await resolveDeploymentTargetCredentialState({
            credential: draft.credential,
            repositoryContext,
            sshCredentialRepository,
          });

          yield* server.configureCredential({
            credential,
            configuredAt,
          });
        }

        serverState = server.toState();
      }

      return await connectivityChecker.test(context, {
        server: serverState,
      });
    });
  }
}
