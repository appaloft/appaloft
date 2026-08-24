import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { constraintsByKind, scopeOperation } from "../../operation-guard";
import {
  AllowAllOperationScopePort,
  type OperationScopePort,
  type ResourceOverview,
  type ResourceOverviewReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceOverviewQuery } from "./resource-overview.query";

const operation = findOperationCatalogEntryByKey("resources.overview");
const allowAll = new AllowAllOperationScopePort();

@injectable()
export class ResourceOverviewQueryService {
  constructor(
    @inject(tokens.resourceOverviewReadModel)
    private readonly readModel: ResourceOverviewReadModel,
    @inject(tokens.operationScopePort)
    private readonly operationScopePort?: OperationScopePort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceOverviewQuery,
  ): Promise<Result<ResourceOverview>> {
    const organizationId =
      context.principal?.activeOrganization?.organizationId ?? context.tenant?.organizationId;
    let organizationIds = organizationId ? [organizationId] : undefined;
    let projectIds: readonly string[] | undefined;
    let resourceIds: readonly string[] | undefined;

    if (operation) {
      const scoped = await scopeOperation({
        context,
        entry: operation,
        operationScopePort: this.operationScopePort ?? allowAll,
        ...(organizationId ? { organizationId } : {}),
        resourceRefs: {
          projectId: query.projectId,
          environmentId: query.environmentId,
          resourceId: query.resourceId,
        },
      });
      if (scoped.isErr()) return err(scoped.error);
      if (scoped.value.effect === "allow" && scoped.value.visibility === "constrained") {
        organizationIds = constraintsByKind(scoped.value.constraints, "organization");
        projectIds = constraintsByKind(scoped.value.constraints, "project");
        resourceIds = constraintsByKind(scoped.value.constraints, "resource");
        if (!organizationIds?.length && !projectIds?.length && !resourceIds?.length) {
          return err(domainError.notFound("resource", query.resourceId));
        }
      }
    }

    const overview = await this.readModel.show(toRepositoryContext(context), {
      projectId: query.projectId,
      environmentId: query.environmentId,
      resourceId: query.resourceId,
      ...(organizationIds ? { organizationIds } : {}),
      ...(projectIds ? { projectIds } : {}),
      ...(resourceIds ? { resourceIds } : {}),
    });

    return overview ? ok(overview) : err(domainError.notFound("resource", query.resourceId));
  }
}
