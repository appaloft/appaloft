import { describe, expect, test } from "bun:test";

import { type AppaloftSdkFacadeMethod, createAppaloftClient } from "../src";
import {
  createAppaloftFacadeClient,
  createAppaloftSdkClient,
  type SdkOperationDescriptor,
} from "../src/internal";

const operations = [
  {
    operationKey: "projects.create",
    operationGroup: "projects",
    operationMethod: "create",
    facadePath: ["projects", "create"],
    facadeDefault: true,
    operationId: "projects.create",
    kind: "command",
    domain: "projects",
    messageName: "CreateProjectCommand",
    route: {
      method: "POST",
      path: "/projects",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: false,
  },
  {
    operationKey: "projects.list",
    operationGroup: "projects",
    operationMethod: "list",
    facadePath: ["projects", "list"],
    facadeDefault: true,
    operationId: "projects.list",
    kind: "query",
    domain: "projects",
    messageName: "ListProjectsQuery",
    route: {
      method: "GET",
      path: "/projects",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: false,
  },
  {
    operationKey: "projects.show",
    operationGroup: "projects",
    operationMethod: "show",
    facadePath: ["projects", "show"],
    facadeDefault: true,
    operationId: "projects.show",
    kind: "query",
    domain: "projects",
    messageName: "ShowProjectQuery",
    route: {
      method: "GET",
      path: "/projects/{projectId}",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: false,
  },
  {
    operationKey: "dependency-resources.provisioning.plan",
    operationGroup: "dependency-resources",
    operationMethod: "provisioningPlan",
    facadePath: ["dependencyResources", "provisioning", "plan"],
    facadeDefault: true,
    operationId: "dependencyResources.provisioning.plan",
    kind: "query",
    domain: "dependency-resources",
    messageName: "PlanDependencyResourceProvisioningQuery",
    route: {
      method: "GET",
      path: "/dependency-resources/provisioning/plan",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: false,
  },
  {
    operationKey: "deployments.timeline",
    operationGroup: "deployments",
    operationMethod: "timeline",
    facadePath: ["deployments", "timeline"],
    facadeDefault: true,
    operationId: "deployments.timeline",
    kind: "query",
    domain: "deployments",
    messageName: "DeploymentTimelineQuery",
    route: {
      method: "GET",
      path: "/deployments/{deploymentId}/timeline",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: false,
  },
  {
    operationKey: "deployments.timeline.stream",
    operationGroup: "deployments",
    operationMethod: "timelineStream",
    facadePath: ["deployments", "timeline", "stream"],
    facadeDefault: true,
    operationId: "deployments.timeline.stream",
    kind: "query",
    domain: "deployments",
    messageName: "StreamDeploymentTimelineQuery",
    route: {
      method: "GET",
      path: "/deployments/{deploymentId}/timeline/stream",
    },
    authPolicy: "product-session",
    errorFamily: "structured-platform-error",
    streaming: true,
  },
] as const satisfies readonly SdkOperationDescriptor[];

interface RepresentativeFacade {
  readonly projects: {
    readonly create: AppaloftSdkFacadeMethod;
    readonly list: AppaloftSdkFacadeMethod;
    readonly show: AppaloftSdkFacadeMethod;
  };
  readonly dependencyResources: {
    readonly provisioning: {
      readonly plan: AppaloftSdkFacadeMethod;
    };
  };
  readonly deployments: {
    readonly timeline: AppaloftSdkFacadeMethod & {
      readonly stream: AppaloftSdkFacadeMethod;
    };
  };
}

describe("Appaloft typed facade client", () => {
  test("[TS-SDK-FACADE-001] dispatches representative create/list/show operations", async () => {
    const capturedRequests: Request[] = [];
    const appaloft = createAppaloftFacadeClient(
      createAppaloftSdkClient({
        baseUrl: "https://appaloft.example/api",
        fetch: async (request) => {
          capturedRequests.push(request);
          return Response.json(
            { id: "prj_demo" },
            { status: request.method === "POST" ? 201 : 200 },
          );
        },
      }),
      operations,
    ) as unknown as RepresentativeFacade;

    const created = await appaloft.projects.create({ name: "Demo" });
    const listed = await appaloft.projects.list({ limit: 20 });
    const shown = await appaloft.projects.show({ projectId: "prj_demo" });

    expect(created).toMatchObject({ ok: true, status: 201, data: { id: "prj_demo" } });
    expect(listed).toMatchObject({ ok: true, status: 200 });
    expect(shown).toMatchObject({ ok: true, status: 200 });
    expect(await capturedRequests[0]?.text()).toBe('{"name":"Demo"}');
    expect(capturedRequests[1]?.url).toBe("https://appaloft.example/api/projects?limit=20");
    expect(capturedRequests[2]?.url).toBe("https://appaloft.example/api/projects/prj_demo");
  });

  test("[TS-SDK-FACADE-001] supports nested kebab-case operation groups", async () => {
    let capturedRequest: Request | undefined;
    const appaloft = createAppaloftFacadeClient(
      createAppaloftSdkClient({
        baseUrl: "https://appaloft.example/api",
        fetch: async (request) => {
          capturedRequest = request;
          return Response.json({ items: [] });
        },
      }),
      operations,
    ) as unknown as RepresentativeFacade;

    await appaloft.dependencyResources.provisioning.plan({
      projectId: "prj_demo",
      environmentId: "env_demo",
    });

    expect(capturedRequest?.url).toBe(
      "https://appaloft.example/api/dependency-resources/provisioning/plan?projectId=prj_demo&environmentId=env_demo",
    );
  });

  test("[TS-SDK-FACADE-001] keeps explicit pathParams query and body escape hatches", async () => {
    let capturedRequest: Request | undefined;
    const appaloft = createAppaloftFacadeClient(
      createAppaloftSdkClient({
        baseUrl: "https://appaloft.example/api",
        fetch: async (request) => {
          capturedRequest = request;
          return Response.json({ id: "prj_demo" });
        },
      }),
      operations,
    ) as unknown as RepresentativeFacade;

    await appaloft.projects.show({
      pathParams: { projectId: "prj_demo" },
      query: { includeArchived: true },
    });

    expect(capturedRequest?.url).toBe(
      "https://appaloft.example/api/projects/prj_demo?includeArchived=true",
    );
  });

  test("[TS-SDK-FACADE-001] returns AsyncIterable for streaming facade operations", async () => {
    const appaloft = createAppaloftFacadeClient(
      createAppaloftSdkClient({
        baseUrl: "https://appaloft.example/api",
        fetch: async () =>
          new Response('{"kind":"heartbeat"}\n', {
            headers: {
              "content-type": "application/x-ndjson",
            },
          }),
      }),
      operations,
    ) as unknown as RepresentativeFacade;

    const envelopes: unknown[] = [];

    for await (const envelope of appaloft.deployments.timeline.stream({
      deploymentId: "dep_demo",
    })) {
      envelopes.push(envelope);
    }

    expect(envelopes).toEqual([{ kind: "heartbeat" }]);
  });

  test("[TS-SDK-FACADE-001] supports callable nodes that also own submethods", async () => {
    const capturedRequests: Request[] = [];
    const appaloft = createAppaloftFacadeClient(
      createAppaloftSdkClient({
        baseUrl: "https://appaloft.example/api",
        fetch: async (request) => {
          capturedRequests.push(request);
          return Response.json({ ok: true });
        },
      }),
      operations,
    ) as unknown as RepresentativeFacade;

    await appaloft.deployments.timeline({ deploymentId: "dep_demo", limit: 100 });
    for await (const _envelope of appaloft.deployments.timeline.stream({
      deploymentId: "dep_demo",
      follow: true,
    })) {
      break;
    }

    expect(capturedRequests[0]?.url).toBe(
      "https://appaloft.example/api/deployments/dep_demo/timeline?limit=100",
    );
    expect(capturedRequests[1]?.url).toBe(
      "https://appaloft.example/api/deployments/dep_demo/timeline/stream?follow=true",
    );
  });

  test("[TS-SDK-FACADE-001] createAppaloftClient exposes generated operations", () => {
    const appaloft = createAppaloftClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () => Response.json({}),
    }) as unknown as RepresentativeFacade;

    expect(typeof appaloft.projects.create).toBe("function");
    expect(typeof appaloft.dependencyResources.provisioning.plan).toBe("function");
    expect(typeof appaloft.deployments.timeline).toBe("function");
    expect(typeof appaloft.deployments.timeline.stream).toBe("function");
  });
});
