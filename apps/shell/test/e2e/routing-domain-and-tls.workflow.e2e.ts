import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createRoutingDomainTlsFixture,
  type DeploymentSummary,
  findDeployment,
  type RoutingDomainTlsFixture,
  waitForCliDomainBindingStatus,
  waitForCliDurableRoute,
} from "./support/routing-domain-tls-fixture";
import { expectCliSuccess, parseJson, runShellCli } from "./support/shell-e2e-fixture";

const fixtureDir = new URL("../fixtures/workspace-http-app", import.meta.url).pathname;

describe("routing/domain/TLS workflow e2e", () => {
  let fixture: RoutingDomainTlsFixture;

  beforeAll(() => {
    fixture = createRoutingDomainTlsFixture({
      appVersion: "0.1.0-routing-domain-tls-workflow-e2e",
      prefix: "appaloft-routing-domain-tls-workflow-",
      proxyKind: "traefik",
    });
  }, 60000);

  afterAll(() => {
    fixture?.cleanup();
  }, 60000);

  test("[ROUTE-TLS-WORKFLOW-001] CLI binds a TLS-disabled domain before redeploy and observes a deployable runtime route", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const appPort = 5100 + Math.floor(Math.random() * 100);
    const context = fixture.deployWorkspaceResource({
      appPort,
      suffix,
    });
    const domainName = `${suffix}.workflow.example`;
    const expectedUrl = `http://${domainName}`;

    const created = runShellCli(
      [
        "domain-binding",
        "create",
        domainName,
        "--project-id",
        context.projectId,
        "--environment-id",
        context.environmentId,
        "--resource-id",
        context.resourceId,
        "--server-id",
        context.serverId,
        "--destination-id",
        context.destinationId,
        "--proxy-kind",
        "traefik",
        "--tls-mode",
        "disabled",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(created, "create workflow domain binding");
    const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

    const confirmed = runShellCli(
      ["domain-binding", "confirm-ownership", domainBindingId],
      fixture.cliOptions,
    );
    expectCliSuccess(confirmed, "confirm workflow domain ownership");

    const redeployed = runShellCli(
      [
        "deploy",
        fixtureDir,
        "--project",
        context.projectId,
        "--server",
        context.serverId,
        "--destination",
        context.destinationId,
        "--environment",
        context.environmentId,
        "--resource",
        context.resourceId,
        "--method",
        "workspace-commands",
        "--start",
        "node server.js",
        "--port",
        String(appPort),
        "--health-path",
        "/health",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(redeployed, "redeploy resource with durable domain route");
    const redeploymentId = parseJson<{ id: string }>(redeployed.stdout).id;
    fixture.addDeploymentId(redeploymentId);

    const deployments = runShellCli(["deployments", "list", "--project", context.projectId], {
      ...fixture.cliOptions,
    });
    expectCliSuccess(deployments, "list workflow deployments");
    const redeployment = findDeployment({
      deploymentId: redeploymentId,
      items: parseJson<{ items: DeploymentSummary[] }>(deployments.stdout).items,
    });
    expect(redeployment.runtimePlan.execution.accessRoutes?.[0]).toEqual(
      expect.objectContaining({
        domains: [domainName],
        pathPrefix: "/",
        proxyKind: "traefik",
        tlsMode: "disabled",
      }),
    );
    expect(redeployment.runtimePlan.execution.metadata).toEqual(
      expect.objectContaining({
        "access.domainBindingId": domainBindingId,
        "access.hostname": domainName,
        "access.routeSource": "durable-domain-binding",
        "access.scheme": "http",
      }),
    );

    const resource = await waitForCliDurableRoute({
      expectedUrl,
      options: fixture.cliOptions,
      resourceId: context.resourceId,
    });
    await waitForCliDomainBindingStatus({
      domainBindingId,
      options: fixture.cliOptions,
      resourceId: context.resourceId,
      status: "ready",
    });
    expect(resource.accessSummary?.latestDurableDomainRoute).toEqual(
      expect.objectContaining({
        deploymentId: redeploymentId,
        hostname: domainName,
        scheme: "http",
        url: expectedUrl,
      }),
    );
  }, 120000);
});
