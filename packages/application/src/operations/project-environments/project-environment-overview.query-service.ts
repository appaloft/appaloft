import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { constraintsByKind, scopeOperation } from "../../operation-guard";
import {
  AllowAllOperationScopePort,
  type OperationScopePort,
  type ProjectEnvironmentOverview,
  type ProjectEnvironmentOverviewReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ProjectEnvironmentOverviewQuery } from "./project-environment-overview.query";

const operation = findOperationCatalogEntryByKey("project-environments.overview");
const allowAll = new AllowAllOperationScopePort();

@injectable()
export class ProjectEnvironmentOverviewQueryService {
  constructor(
    @inject(tokens.projectEnvironmentOverviewReadModel)
    private readonly readModel: ProjectEnvironmentOverviewReadModel,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ProjectEnvironmentOverviewQuery,
  ): Promise<Result<ProjectEnvironmentOverview>> {
    const organizationId =
      context.principal?.activeOrganization?.organizationId ?? context.tenant?.organizationId;
    let organizationIds = organizationId ? [organizationId] : undefined;
    let projectIds: readonly string[] | undefined;

    if (operation) {
      const scoped = await scopeOperation({
        context,
        entry: operation,
        operationScopePort: this.operationScopePort ?? allowAll,
        ...(organizationId ? { organizationId } : {}),
        resourceRefs: { projectId: query.projectId, environmentId: query.environmentId },
      });
      if (scoped.isErr()) return err(scoped.error);
      if (scoped.value.effect === "allow" && scoped.value.visibility === "constrained") {
        organizationIds = constraintsByKind(scoped.value.constraints, "organization");
        projectIds = constraintsByKind(scoped.value.constraints, "project");
        if (!organizationIds?.length && !projectIds?.length) {
          return err(domainError.notFound("project", query.projectId));
        }
      }
    }

    const overview = await this.readModel.show(toRepositoryContext(context), {
      projectId: query.projectId,
      environmentId: query.environmentId,
      limit: query.limit,
      sort: query.sort,
      health: query.health,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(organizationIds ? { organizationIds } : {}),
      ...(projectIds ? { projectIds } : {}),
    });

    return overview
      ? ok(overview)
      : err(domainError.notFound("project_environment", query.environmentId));
  }
}
