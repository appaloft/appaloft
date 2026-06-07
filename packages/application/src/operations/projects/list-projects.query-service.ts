import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { constraintsByKind, scopeOperation } from "../../operation-guard";
import {
  AllowAllOperationScopePort,
  type OperationScopePort,
  type ProjectReadModel,
  type ProjectSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { boundedListLimit } from "../shared-schema";
import { type ListProjectsQuery } from "./list-projects.query";

const listProjectsOperation = findOperationCatalogEntryByKey("projects.list");
const defaultOperationScopePort = new AllowAllOperationScopePort();

@injectable()
export class ListProjectsQueryService {
  constructor(
    @inject(tokens.projectReadModel) private readonly readModel: ProjectReadModel,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async execute(
    context: ExecutionContext,
    query?: ListProjectsQuery,
  ): Promise<Result<{ items: ProjectSummary[] }>> {
    const organizationId = context.principal?.activeOrganization?.organizationId;
    const limit = boundedListLimit(query?.limit);
    const lifecycleStatus = query?.lifecycleStatus ?? "active";
    const operationScopePort = this.operationScopePort ?? defaultOperationScopePort;
    if (listProjectsOperation) {
      const scoped = await scopeOperation({
        context,
        entry: listProjectsOperation,
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
          return ok({ items: [] });
        }

        return ok({
          items: await this.readModel.list(toRepositoryContext(context), {
            ...(organizationIds ? { organizationIds } : {}),
            ...(projectIds ? { projectIds } : {}),
            limit,
            lifecycleStatus,
          }),
        });
      }
    }

    return ok({
      items: await this.readModel.list(toRepositoryContext(context), {
        ...(organizationId ? { organizationId } : {}),
        limit,
        lifecycleStatus,
      }),
    });
  }
}
