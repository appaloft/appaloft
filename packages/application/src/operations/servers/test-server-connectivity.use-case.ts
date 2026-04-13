import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  type Result,
  safeTry,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type ServerConnectivityChecker,
  type ServerConnectivityResult,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type TestServerConnectivityCommandInput } from "./test-server-connectivity.command";

@injectable()
export class TestServerConnectivityUseCase {
  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.serverConnectivityChecker)
    private readonly connectivityChecker: ServerConnectivityChecker,
  ) {}

  async execute(
    context: ExecutionContext,
    input: TestServerConnectivityCommandInput,
  ): Promise<Result<ServerConnectivityResult>> {
    const { connectivityChecker, serverRepository } = this;
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

      return await connectivityChecker.test(context, {
        server: server.toState(),
      });
    });
  }
}
