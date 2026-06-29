import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { CountDependencyResourcesQuery } from "../src/operations/dependency-resources/count-dependency-resources.query";
import { CountDependencyResourcesQueryService } from "../src/operations/dependency-resources/count-dependency-resources.query-service";
import { CountDeploymentsQuery } from "../src/operations/deployments/count-deployments.query";
import { CountDeploymentsQueryService } from "../src/operations/deployments/count-deployments.query-service";
import { ListDeploymentsQueryHandler } from "../src/operations/deployments/list-deployments.handler";
import { ListDeploymentsQuery } from "../src/operations/deployments/list-deployments.query";
import { ListDeploymentsQueryService } from "../src/operations/deployments/list-deployments.query-service";
import { CountEnvironmentsQuery } from "../src/operations/environments/count-environments.query";
import { CountEnvironmentsQueryService } from "../src/operations/environments/count-environments.query-service";
import { CountProjectsQueryService } from "../src/operations/projects/count-projects.query-service";
import { CountResourcesQuery } from "../src/operations/resources/count-resources.query";
import { CountResourcesQueryService } from "../src/operations/resources/count-resources.query-service";
import { CountServersQueryService } from "../src/operations/servers/count-servers.query-service";
import {
  type DependencyResourceReadModel,
  type DeploymentReadModel,
  type EnvironmentReadModel,
  type ProjectReadModel,
  type ResourceReadModel,
  type ServerReadModel,
} from "../src/ports";

const context = createExecutionContext({
  requestId: "req_count_query_test",
  entrypoint: "system",
});

function failList(): never {
  throw new Error("count query must not call list");
}

describe("read model count queries", () => {
  test("[READ-MODEL-COUNT-001] count query services delegate to readModel.count without listing rows", async () => {
    const projects: ProjectReadModel = {
      count: async () => 2,
      list: async () => failList(),
      findOne: async () => null,
    };
    const servers: ServerReadModel = {
      count: async () => 3,
      list: async () => failList(),
      findOne: async () => null,
    };
    const environments: EnvironmentReadModel = {
      count: async () => 4,
      list: async () => failList(),
      findOne: async () => null,
    };
    const resources: ResourceReadModel = {
      count: async () => 5,
      list: async () => failList(),
      findOne: async () => null,
    };
    const dependencyResources: DependencyResourceReadModel = {
      count: async () => 6,
      list: async () => failList(),
      findOne: async () => null,
    };
    const deployments: DeploymentReadModel = {
      count: async () => 7,
      list: async () => failList(),
      findOne: async () => null,
      findTimeline: async () => [],
    };

    const projectCount = await new CountProjectsQueryService(projects).execute(context);
    expect(projectCount.isOk()).toBe(true);
    expect(projectCount._unsafeUnwrap()).toEqual({ count: 2 });
    await expect(new CountServersQueryService(servers).execute(context)).resolves.toEqual({
      count: 3,
    });
    await expect(
      new CountEnvironmentsQueryService(environments).execute(
        context,
        new CountEnvironmentsQuery("prj_demo"),
      ),
    ).resolves.toEqual({ count: 4 });
    await expect(
      new CountResourcesQueryService(resources).execute(
        context,
        new CountResourcesQuery("prj_demo", "env_prod"),
      ),
    ).resolves.toEqual({ count: 5 });
    const dependencyResourceCount = await new CountDependencyResourcesQueryService(
      dependencyResources,
    ).execute(context, new CountDependencyResourcesQuery("prj_demo", "env_prod", "postgres"));
    expect(dependencyResourceCount.isOk()).toBe(true);
    expect(dependencyResourceCount._unsafeUnwrap()).toEqual({ count: 6 });
    await expect(
      new CountDeploymentsQueryService(deployments).execute(
        context,
        new CountDeploymentsQuery(undefined, undefined, false, false, undefined, ["running"]),
      ),
    ).resolves.toEqual({ count: 7 });
  });

  test("[READ-MODEL-COUNT-002] deployment count query preserves status filters for aggregate counts", async () => {
    let capturedInput: Parameters<DeploymentReadModel["count"]>[1];
    const deployments: DeploymentReadModel = {
      count: async (_context: RepositoryContext, input) => {
        capturedInput = input;
        return 1;
      },
      list: async () => failList(),
      findOne: async () => null,
      findTimeline: async () => [],
    };

    await new CountDeploymentsQueryService(deployments).execute(
      context,
      new CountDeploymentsQuery("prj_demo", undefined, false, true, undefined, [
        "created",
        "running",
      ]),
    );

    expect(capturedInput).toEqual({
      projectId: "prj_demo",
      includeArchived: false,
      activeResourcesOnly: true,
      statuses: ["created", "running"],
    });
  });

  test("[READ-MODEL-COUNT-003] deployment list query can require active resources at the read model boundary", async () => {
    let capturedInput: Parameters<DeploymentReadModel["list"]>[1];
    const deployments: DeploymentReadModel = {
      count: async () => 0,
      list: async (_context: RepositoryContext, input) => {
        capturedInput = input;
        return [];
      },
      findOne: async () => null,
      findTimeline: async () => [],
    };

    await new ListDeploymentsQueryService(deployments).execute(context, {
      projectId: "prj_demo",
      includeArchived: false,
      activeResourcesOnly: true,
      limit: 25,
    });

    expect(capturedInput).toEqual({
      projectId: "prj_demo",
      includeArchived: false,
      activeResourcesOnly: true,
      limit: 25,
    });
  });

  test("[READ-MODEL-COUNT-004] deployment list handler forwards activeResourcesOnly to the query service", async () => {
    let capturedInput: Parameters<ListDeploymentsQueryService["execute"]>[1];
    const queryService = {
      execute: async (
        _context: typeof context,
        input: Parameters<ListDeploymentsQueryService["execute"]>[1],
      ) => {
        capturedInput = input;
        return { items: [] };
      },
    } as unknown as ListDeploymentsQueryService;

    const query = ListDeploymentsQuery.create({ activeResourcesOnly: true })._unsafeUnwrap();
    await new ListDeploymentsQueryHandler(queryService).handle(context, query);

    expect(capturedInput?.activeResourcesOnly).toBe(true);
  });
});
