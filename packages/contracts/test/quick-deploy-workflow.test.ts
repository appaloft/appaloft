import { describe, expect, test } from "bun:test";

import {
  type QuickDeployWorkflowStep,
  type QuickDeployWorkflowStepOutput,
  runQuickDeployWorkflow,
} from "../src/index";

describe("quick deploy workflow", () => {
  test("threads created context ids into later workflow steps", async () => {
    const steps: QuickDeployWorkflowStep[] = [];

    const result = await runQuickDeployWorkflow(
      {
        project: {
          mode: "create",
          input: {
            name: "Demo",
          },
        },
        server: {
          mode: "create",
          input: {
            name: "Local",
            host: "127.0.0.1",
            providerKey: "local-shell",
            proxyKind: "traefik",
          },
          credential: {
            mode: "create-ssh-and-configure",
            input: {
              name: "local key",
              kind: "ssh-private-key",
              username: "root",
              privateKey: "test-private-key",
            },
          },
        },
        environment: {
          mode: "create",
          input: {
            name: "local",
            kind: "local",
          },
        },
        resource: {
          mode: "create",
          input: {
            name: "app",
            kind: "application",
            source: {
              kind: "local-folder",
              locator: ".",
            },
            runtimeProfile: {
              strategy: "auto",
            },
            networkProfile: {
              internalPort: 3000,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
          },
        },
        environmentVariable: {
          key: "PORT",
          value: "3000",
          kind: "plain-config",
          exposure: "runtime",
          scope: "environment",
        },
      },
      (step) => {
        steps.push(step);
        return outputForStep(step);
      },
    );

    expect(steps.map((step) => step.kind)).toEqual([
      "projects.create",
      "servers.register",
      "credentials.ssh.create",
      "servers.configureCredential",
      "environments.create",
      "resources.create",
      "environments.setVariable",
      "deployments.create",
    ]);
    expect(steps.find((step) => step.kind === "environments.create")?.input).toMatchObject({
      projectId: "proj_1",
    });
    expect(steps.find((step) => step.kind === "servers.configureCredential")?.input).toMatchObject({
      serverId: "srv_1",
      credential: {
        kind: "stored-ssh-private-key",
        credentialId: "cred_1",
        username: "root",
      },
    });
    expect(steps.find((step) => step.kind === "resources.create")?.input).toMatchObject({
      projectId: "proj_1",
      environmentId: "env_1",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    const deploymentStep = steps.find((step) => step.kind === "deployments.create");
    expect(deploymentStep?.input).toEqual({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
    });
    expect(deploymentStep?.input).not.toHaveProperty("sourceLocator");
    expect(deploymentStep?.input).not.toHaveProperty("source");
    expect(deploymentStep?.input).not.toHaveProperty("resource");
    expect(deploymentStep?.input).not.toHaveProperty("deploymentMethod");
    expect(result).toEqual({
      projectId: "proj_1",
      serverId: "srv_1",
      environmentId: "env_1",
      resourceId: "res_1",
      deploymentId: "dep_1",
    });
  });

  test("uses existing context ids without creating prerequisite records", async () => {
    const steps: QuickDeployWorkflowStep[] = [];

    const result = await runQuickDeployWorkflow(
      {
        project: {
          mode: "existing",
          id: "proj_existing",
        },
        server: {
          mode: "existing",
          id: "srv_existing",
        },
        environment: {
          mode: "existing",
          id: "env_existing",
        },
        resource: {
          mode: "existing",
          id: "res_existing",
        },
        deployment: {
          destinationId: "dest_existing",
        },
      },
      (step) => {
        steps.push(step);
        return outputForStep(step);
      },
    );

    expect(steps.map((step) => step.kind)).toEqual(["deployments.create"]);
    expect(steps[0]?.input).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      destinationId: "dest_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
    });
    expect(result).toEqual({
      projectId: "proj_existing",
      serverId: "srv_existing",
      environmentId: "env_existing",
      resourceId: "res_existing",
      deploymentId: "dep_1",
    });
  });
});

function outputForStep(step: QuickDeployWorkflowStep): QuickDeployWorkflowStepOutput {
  switch (step.kind) {
    case "projects.create":
      return { id: "proj_1" };
    case "servers.register":
      return { id: "srv_1" };
    case "credentials.ssh.create":
      return { id: "cred_1" };
    case "servers.configureCredential":
      return;
    case "environments.create":
      return { id: "env_1" };
    case "resources.create":
      return { id: "res_1" };
    case "environments.setVariable":
      return;
    case "deployments.create":
      return { id: "dep_1" };
  }
}
