import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeployTokenReadModel, type DeployTokenSummary } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowDeployTokenQuery } from "./show-deploy-token.query";

@injectable()
export class ShowDeployTokenQueryService {
  constructor(
    @inject(tokens.deployTokenReadModel)
    private readonly readModel: DeployTokenReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowDeployTokenQuery,
  ): Promise<Result<DeployTokenSummary>> {
    const { readModel } = this;
    const repositoryContext = toRepositoryContext(context);

    const summary = await readModel.findOne(repositoryContext, {
      organizationId: query.organizationId,
      tokenId: query.tokenId,
    });

    if (!summary) {
      const notFound = domainError.notFound("Deploy token", query.tokenId);
      return err({
        ...notFound,
        details: {
          ...(notFound.details ?? {}),
          phase: "deploy-token-read",
          tokenId: query.tokenId,
        },
      });
    }

    return ok(summary);
  }
}
