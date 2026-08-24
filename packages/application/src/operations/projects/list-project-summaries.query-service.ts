import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { constraintsByKind, scopeOperation } from "../../operation-guard";
import {
  AllowAllOperationScopePort,
  type OperationScopePort,
  type ProjectSummariesReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListProjectSummariesQuery } from "./list-project-summaries.query";

const listProjectSummariesOperation = findOperationCatalogEntryByKey("projects.list-summaries");
const defaultOperationScopePort = new AllowAllOperationScopePort();

@injectable()
export class ListProjectSummariesQueryService {
  constructor(
    @inject(tokens.projectSummariesReadModel)
    private readonly readModel: ProjectSummariesReadModel,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListProjectSummariesQuery,
  ): Promise<Result<Awaited<ReturnType<ProjectSummariesReadModel["list"]>>>> {
    const organizationId = context.principal?.activeOrganization?.organizationId;
    const baseInput = {
      limit: query.limit,
      sort: query.sort,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
    };
    const operationScopePort = this.operationScopePort ?? defaultOperationScopePort;

    if (listProjectSummariesOperation) {
      const scoped = await scopeOperation({
        context,
        entry: listProjectSummariesOperation,
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

        return ok(
          await this.readModel.list(toRepositoryContext(context), {
            ...baseInput,
            ...(organizationIds ? { organizationIds } : {}),
            ...(projectIds ? { projectIds } : {}),
          }),
        );
      }
    }

    return ok(
      await this.readModel.list(toRepositoryContext(context), {
        ...baseInput,
        ...(organizationId ? { organizationIds: [organizationId] } : {}),
      }),
    );
  }
}
