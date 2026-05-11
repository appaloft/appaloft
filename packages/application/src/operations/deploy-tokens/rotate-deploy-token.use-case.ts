import {
  DeployTokenByIdSpec,
  DeployTokenId,
  domainError,
  err,
  ok,
  type Result,
  RotateDeployTokenSpec,
  RotatedAt,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DeployTokenMaterialIssuer,
  type DeployTokenRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeployTokenScopeResult, mapDeployTokenScope } from "./deploy-token-result-mapper";

export interface RotateDeployTokenUseCaseInput {
  tokenId: string;
  organizationId: string;
  confirmation: {
    tokenId: string;
  };
  idempotencyKey?: string;
}

export interface RotateDeployTokenUseCaseResult {
  tokenId: string;
  token: string;
  rotatedAt: string;
  scopes: DeployTokenScopeResult;
}

@injectable()
export class RotateDeployTokenUseCase {
  constructor(
    @inject(tokens.deployTokenRepository)
    private readonly deployTokenRepository: DeployTokenRepository,
    @inject(tokens.deployTokenMaterialIssuer)
    private readonly deployTokenMaterialIssuer: DeployTokenMaterialIssuer,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RotateDeployTokenUseCaseInput,
  ): Promise<Result<RotateDeployTokenUseCaseResult>> {
    const { clock, deployTokenMaterialIssuer, deployTokenRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (input.confirmation.tokenId !== input.tokenId) {
        return err(
          domainError.validation("Deploy token rotation confirmation does not match token id", {
            phase: "deploy-token-rotation",
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

      const material = yield* await deployTokenMaterialIssuer.issue(context);
      const rotatedAt = yield* RotatedAt.create(clock.now());
      yield* deployToken.rotate({
        verifierDigest: material.verifierDigest,
        secretSuffix: material.secretSuffix,
        rotatedAt,
      });

      await deployTokenRepository.updateOne(
        repositoryContext,
        deployToken,
        RotateDeployTokenSpec.fromDeployToken(deployToken),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployToken, undefined);

      const state = deployToken.toState();
      return ok({
        tokenId: state.id.value,
        token: material.token,
        rotatedAt: rotatedAt.value,
        scopes: mapDeployTokenScope(state.scope),
      });
    });
  }
}
