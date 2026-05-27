import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { constraintsByKind, scopeOperation } from "../../operation-guard";
import {
  AllowAllOperationScopePort,
  type OperationScopePort,
  type ProjectReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CountProjectsQuery } from "./count-projects.query";

const countProjectsOperation = findOperationCatalogEntryByKey("projects.count");
const defaultOperationScopePort = new AllowAllOperationScopePort();

@injectable()
export class CountProjectsQueryService {
  constructor(
    @inject(tokens.projectReadModel) private readonly readModel: ProjectReadModel,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async execute(
    context: ExecutionContext,
    _query?: CountProjectsQuery,
  ): Promise<Result<{ count: number }>> {
    const organizationId = context.principal?.activeOrganization?.organizationId;
    const operationScopePort = this.operationScopePort ?? defaultOperationScopePort;
    if (countProjectsOperation) {
      const scoped = await scopeOperation({
        context,
        entry: countProjectsOperation,
        operationScopePort,
        ...(organizationId ? { organizationId } : {}),
      });

      if (scoped.isErr()) {
        return err(scoped.error);
      }

      const decision = scoped.value;
      if (decision.effect === "allow" && decision.visibility === "constrained") {
        const organizationIds = constraintsByKind(decision.constraints, "organization");
        const projectIds = constraintsByKind(decision.constraints, "project");
        if (!organizationIds?.length && !projectIds?.length) {
          return ok({ count: 0 });
        }

        return ok({
          count: await this.readModel.count(toRepositoryContext(context), {
            ...(organizationIds ? { organizationIds } : {}),
            ...(projectIds ? { projectIds } : {}),
          }),
        });
      }
    }

    return ok({
      count: await this.readModel.count(toRepositoryContext(context), {
        ...(organizationId ? { organizationId } : {}),
      }),
    });
  }
}
