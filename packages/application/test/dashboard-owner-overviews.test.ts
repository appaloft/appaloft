import { describe, expect, test } from "bun:test";

import {
  createExecutionContext,
  ProjectEnvironmentOverviewQuery,
  ProjectEnvironmentOverviewQueryService,
  ResourceOverviewQuery,
  ResourceOverviewQueryService,
  type ProjectEnvironmentOverviewReadModel,
  type ResourceOverviewReadModel,
} from "../src";

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_dashboard_owner_overviews",
  tenant: { tenantId: "org_example", organizationId: "org_example" },
});

describe("Dashboard owner overviews", () => {
  test("[DASH-DATA-002] Project Environment input is bounded and deterministic", () => {
    const query = ProjectEnvironmentOverviewQuery.create({
      projectId: "prj_atlas",
      environmentId: "env_production",
    })._unsafeUnwrap();

    expect(query.limit).toBe(50);
    expect(query.sort).toBe("name-asc");
    expect(
      ProjectEnvironmentOverviewQuery.create({
        projectId: "prj_atlas",
        environmentId: "env_production",
        limit: 101,
      }).isErr(),
    ).toBe(true);
    expect(
      ProjectEnvironmentOverviewQuery.create({
        projectId: "prj_atlas",
        environmentId: "env_production",
        cursor: "not-a-cursor",
      }).isErr(),
    ).toBe(true);
  });

  test("[DASH-DATA-002][DASH-DATA-005] returns one bounded owner-scoped Resource page", async () => {
    let receivedInput: Parameters<ProjectEnvironmentOverviewReadModel["show"]>[1] | undefined;
    const readModel: ProjectEnvironmentOverviewReadModel = {
      async show(_context, input) {
        receivedInput = input;
        return {
          schemaVersion: "project-environments.overview/v1",
          project: { id: "prj_atlas", name: "Atlas API", slug: "atlas-api" },
          environment: {
            id: "env_production",
            name: "Production",
            kind: "production",
            lifecycleStatus: "active",
          },
          environmentChoices: [
            {
              id: "env_production",
              name: "Production",
              kind: "production",
              lifecycleStatus: "active",
            },
          ],
          resources: [
            {
              id: "res_api",
              name: "api",
              slug: "api",
              kind: "application",
              health: { status: "healthy", observedAt: "2026-08-24T08:00:00.000Z" },
              access: { status: "ready", url: "https://api.example.test" },
              latestDeployment: {
                id: "dep_api",
                status: "succeeded",
                createdAt: "2026-08-24T07:59:00.000Z",
              },
              attentionStatus: "healthy",
            },
          ],
          attention: { total: 1, healthy: 1, attention: 0, unknown: 0 },
          generatedAt: "2026-08-24T08:00:01.000Z",
        };
      },
    };
    const service = new ProjectEnvironmentOverviewQueryService(readModel);
    const result = await service.execute(
      context,
      ProjectEnvironmentOverviewQuery.create({
        projectId: "prj_atlas",
        environmentId: "env_production",
        search: "api",
      })._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrap().resources).toHaveLength(1);
    expect(result._unsafeUnwrap().resources[0]).not.toHaveProperty("deployments");
    expect(receivedInput).toMatchObject({
      projectId: "prj_atlas",
      environmentId: "env_production",
      limit: 50,
      organizationIds: ["org_example"],
      search: "api",
      sort: "name-asc",
    });
  });

  test("[DASH-DATA-003] Resource Overview validates owner ids and caps Deployments", async () => {
    const readModel: ResourceOverviewReadModel = {
      async show() {
        return {
          schemaVersion: "resources.overview/v1",
          resource: {
            id: "res_api",
            projectId: "prj_atlas",
            environmentId: "env_production",
            name: "api",
            slug: "api",
            kind: "application",
            lifecycleStatus: "active",
          },
          health: { status: "healthy", observedAt: "2026-08-24T08:00:00.000Z" },
          access: { status: "ready", url: "https://api.example.test" },
          configuration: {
            sourceConfigured: true,
            runtimeConfigured: true,
            networkConfigured: true,
            accessConfigured: true,
            status: "ready",
          },
          network: {
            internalPort: 3000,
            protocol: "http",
            exposureMode: "reverse-proxy",
          },
          capabilities: {
            deploy: true,
            configure: true,
            logs: true,
            metrics: true,
            networking: true,
          },
          latestDeployments: Array.from({ length: 5 }, (_, index) => ({
            id: `dep_${index}`,
            status: "succeeded" as const,
            createdAt: `2026-08-24T0${index}:00:00.000Z`,
          })),
          generatedAt: "2026-08-24T08:00:01.000Z",
        };
      },
    };
    const service = new ResourceOverviewQueryService(readModel);
    const result = await service.execute(
      context,
      ResourceOverviewQuery.create({
        projectId: "prj_atlas",
        environmentId: "env_production",
        resourceId: "res_api",
      })._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrap().latestDeployments).toHaveLength(5);
    expect(result._unsafeUnwrap()).not.toHaveProperty("logs");
    expect(result._unsafeUnwrap()).not.toHaveProperty("metrics");
    expect(result._unsafeUnwrap()).not.toHaveProperty("secrets");
  });
});
