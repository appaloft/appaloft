import {
  DeployTokenByIdSpec,
  DeployTokenId,
  domainError,
  err,
  ok,
  type Result,
  RevokeDeployTokenSpec,
  RevokedAt,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type DeployTokenRepository, type EventBus } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";

export interface RevokeDeployTokenUseCaseInput {
  tokenId: string;
  organizationId: string;
  confirmation: {
    tokenId: string;
  };
  idempotencyKey?: string;
  reason?: string;
}

export interface RevokeDeployTokenUseCaseResult {
  tokenId: string;
  revokedAt: string;
}

@injectable()
export class RevokeDeployTokenUseCase {
  constructor(
    @inject(tokens.deployTokenRepository)
    private readonly deployTokenRepository: DeployTokenRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RevokeDeployTokenUseCaseInput,
  ): Promise<Result<RevokeDeployTokenUseCaseResult>> {
    const { clock, deployTokenRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (input.confirmation.tokenId !== input.tokenId) {
        return err(
          domainError.validation("Deploy token revocation confirmation does not match token id", {
            phase: "deploy-token-revocation",
            tokenId: input.tokenId,
          }),
        );
      }

      const tokenId = yield* DeployTokenId.create(input.tokenId);
      const deployToken = await deployTokenRepository.findOne(
        repositoryContext,
        DeployTokenByIdSpec.create(tokenId),
      );

      if (!deployToken || deployToken.toState().organizationId.value !== input.organizationId) {
        return err(domainError.notFound("Deploy token", input.tokenId));
      }

      const currentState = deployToken.toState();
      if (deployToken.isRevoked() && currentState.revokedAt) {
        return ok({
          tokenId: currentState.id.value,
          revokedAt: currentState.revokedAt.value,
        });
      }

      const revokedAt = yield* RevokedAt.create(clock.now());
      yield* deployToken.revoke({ revokedAt });

      await deployTokenRepository.updateOne(
        repositoryContext,
        deployToken,
        RevokeDeployTokenSpec.fromDeployToken(deployToken),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployToken, undefined);

      return ok({
        tokenId: currentState.id.value,
        revokedAt: revokedAt.value,
      });
    });
  }
}
