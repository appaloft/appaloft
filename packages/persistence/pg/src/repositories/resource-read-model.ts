import {
  appaloftTraceAttributes,
  createReadModelSpanName,
  projectResourceAccessSummary,
  type RepositoryContext,
  type ResourceAccessSummaryDomainBinding,
  type ResourceReadModel,
  type ResourceSummary,
} from "@appaloft/application";
import {
  type ResourceByEnvironmentAndSlugSpec,
  type ResourceByIdSpec,
  type ResourceSelectionSpecVisitor,
} from "@appaloft/core";
import { type Kysely, type Selectable, type SelectQueryBuilder } from "kysely";

import { type Database } from "../schema";
import {
  normalizeTimestamp,
  resolveRepositoryExecutor,
  type SerializedResourceAccessProfile,
  type SerializedResourceNetworkProfile,
  type SerializedResourceService,
  type SerializedRuntimePlan,
} from "./shared";

type ResourceSummaryItem = Awaited<ReturnType<ResourceReadModel["list"]>>[number];
type ResourceSelectionQuery = SelectQueryBuilder<
  Database,
  "resources",
  Selectable<Database["resources"]>
>;
type ResourceRow = Selectable<Database["resources"]>;
type ResourceDeploymentRow = {
  id: string;
  resource_id: string;
  status: string;
  runtime_plan: unknown;
  created_at: string;
};
type ResourceDomainBindingRow = {
  id: string;
  resource_id: string;
  status: string;
  domain_name: string;
  path_prefix: string;
  proxy_kind: string;
  tls_mode: string;
  created_at: string;
};

class KyselyResourceSelectionVisitor
  implements ResourceSelectionSpecVisitor<ResourceSelectionQuery>
{
  visitResourceById(query: ResourceSelectionQuery, spec: ResourceByIdSpec): ResourceSelectionQuery {
    return query.where("id", "=", spec.id.value);
  }

  visitResourceByEnvironmentAndSlug(
    query: ResourceSelectionQuery,
    spec: ResourceByEnvironmentAndSlugSpec,
  ): ResourceSelectionQuery {
    return query
      .where("project_id", "=", spec.projectId.value)
      .where("environment_id", "=", spec.environmentId.value)
      .where("slug", "=", spec.slug.value);
  }
}

function toResourceSummary(
  row: ResourceRow,
  deploymentRows: ResourceDeploymentRow[],
  domainBindingRows: ResourceDomainBindingRow[],
): ResourceSummary {
  const services = (row.services ?? []) as unknown as SerializedResourceService[];
  const networkProfile = row.network_profile
    ? (row.network_profile as unknown as SerializedResourceNetworkProfile)
    : undefined;
  const accessProfile = row.access_profile
    ? (row.access_profile as unknown as SerializedResourceAccessProfile)
    : undefined;
  const deployments = deploymentRows.filter((deployment) => deployment.resource_id === row.id);
  const domainBindings = domainBindingRows.filter(
    (domainBinding) => domainBinding.resource_id === row.id,
  );
  const lastDeployment = deployments[0];
  const accessSummary = projectResourceAccessSummary(
    deployments.map((deployment) => {
      const runtimePlan = deployment.runtime_plan as unknown as SerializedRuntimePlan;
      return {
        id: deployment.id,
        status: deployment.status as NonNullable<ResourceSummaryItem["lastDeploymentStatus"]>,
        createdAt: normalizeTimestamp(deployment.created_at) ?? deployment.created_at,
        runtimePlan: {
          execution: {
            ...(runtimePlan.execution.accessRoutes
              ? {
                  accessRoutes: runtimePlan.execution.accessRoutes.map((route) => ({
                    proxyKind: route.proxyKind,
                    domains: route.domains,
                    pathPrefix: route.pathPrefix,
                    tlsMode: route.tlsMode,
                    ...(typeof route.targetPort === "number"
                      ? { targetPort: route.targetPort }
                      : {}),
                  })),
                }
              : {}),
            ...(runtimePlan.execution.metadata ? { metadata: runtimePlan.execution.metadata } : {}),
          },
        },
      };
    }),
    domainBindings.map((domainBinding) => ({
      id: domainBinding.id,
      status: domainBinding.status as ResourceAccessSummaryDomainBinding["status"],
      createdAt: normalizeTimestamp(domainBinding.created_at) ?? domainBinding.created_at,
      domainName: domainBinding.domain_name,
      pathPrefix: domainBinding.path_prefix,
      proxyKind: domainBinding.proxy_kind as ResourceAccessSummaryDomainBinding["proxyKind"],
      tlsMode: domainBinding.tls_mode as ResourceAccessSummaryDomainBinding["tlsMode"],
    })),
  );

  return {
    id: row.id,
    projectId: row.project_id,
    environmentId: row.environment_id,
    ...(row.destination_id ? { destinationId: row.destination_id } : {}),
    name: row.name,
    slug: row.slug,
    kind: row.kind as ResourceSummaryItem["kind"],
    ...(row.description ? { description: row.description } : {}),
    services: services.map((service) => ({
      name: service.name,
      kind: service.kind,
    })),
    ...(networkProfile
      ? {
          networkProfile: {
            internalPort: networkProfile.internalPort,
            upstreamProtocol: networkProfile.upstreamProtocol,
            exposureMode: networkProfile.exposureMode,
            ...(networkProfile.targetServiceName
              ? { targetServiceName: networkProfile.targetServiceName }
              : {}),
            ...(networkProfile.hostPort ? { hostPort: networkProfile.hostPort } : {}),
          },
        }
      : {}),
    ...(accessProfile
      ? {
          accessProfile: {
            generatedAccessMode: accessProfile.generatedAccessMode,
            pathPrefix: accessProfile.pathPrefix,
          },
        }
      : {}),
    deploymentCount: deployments.length,
    ...(lastDeployment
      ? {
          lastDeploymentId: lastDeployment.id,
          lastDeploymentStatus: lastDeployment.status as NonNullable<
            ResourceSummaryItem["lastDeploymentStatus"]
          >,
        }
      : {}),
    ...(accessSummary ? { accessSummary } : {}),
    createdAt: normalizeTimestamp(row.created_at) ?? row.created_at,
  };
}

export class PgResourceReadModel implements ResourceReadModel {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    context: RepositoryContext,
    input?: {
      projectId?: string;
      environmentId?: string;
    },
  ) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource", "list"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource",
        },
      },
      async () => {
        let query = executor
          .selectFrom("resources")
          .selectAll()
          .where("lifecycle_status", "!=", "deleted")
          .orderBy("created_at", "desc");

        if (input?.projectId) {
          query = query.where("project_id", "=", input.projectId);
        }

        if (input?.environmentId) {
          query = query.where("environment_id", "=", input.environmentId);
        }

        const rows = await query.execute();
        const deploymentRows =
          rows.length > 0
            ? await executor
                .selectFrom("deployments")
                .select(["id", "resource_id", "status", "runtime_plan", "created_at"])
                .where(
                  "resource_id",
                  "in",
                  rows.map((row) => row.id),
                )
                .orderBy("created_at", "desc")
                .execute()
            : [];
        const domainBindingRows =
          rows.length > 0
            ? await executor
                .selectFrom("domain_bindings")
                .select([
                  "id",
                  "resource_id",
                  "status",
                  "domain_name",
                  "path_prefix",
                  "proxy_kind",
                  "tls_mode",
                  "created_at",
                ])
                .where(
                  "resource_id",
                  "in",
                  rows.map((row) => row.id),
                )
                .orderBy("created_at", "desc")
                .execute()
            : [];

        return rows.map((row) => toResourceSummary(row, deploymentRows, domainBindingRows));
      },
    );
  }

  async findOne(context: RepositoryContext, spec: Parameters<ResourceReadModel["findOne"]>[1]) {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createReadModelSpanName("resource", "find_one"),
      {
        attributes: {
          [appaloftTraceAttributes.readModelName]: "resource",
          [appaloftTraceAttributes.selectionSpecName]: spec.constructor.name,
        },
      },
      async () => {
        const row = await spec
          .accept(
            executor.selectFrom("resources").selectAll().where("lifecycle_status", "!=", "deleted"),
            new KyselyResourceSelectionVisitor(),
          )
          .executeTakeFirst();

        if (!row) {
          return null;
        }

        const [deploymentRows, domainBindingRows] = await Promise.all([
          executor
            .selectFrom("deployments")
            .select(["id", "resource_id", "status", "runtime_plan", "created_at"])
            .where("resource_id", "=", row.id)
            .orderBy("created_at", "desc")
            .execute(),
          executor
            .selectFrom("domain_bindings")
            .select([
              "id",
              "resource_id",
              "status",
              "domain_name",
              "path_prefix",
              "proxy_kind",
              "tls_mode",
              "created_at",
            ])
            .where("resource_id", "=", row.id)
            .orderBy("created_at", "desc")
            .execute(),
        ]);

        return toResourceSummary(row, deploymentRows, domainBindingRows);
      },
    );
  }
}
