import { describe, expect, test } from "bun:test";

import {
  createQuickDeployGeneratedResourceName,
  createResourceInputSchema,
  normalizeQuickDeployGeneratedNameBase,
  type QuickDeployCreateResourceInput,
  type QuickDeployWorkflowInput,
  type QuickDeployWorkflowStep,
  type QuickDeployWorkflowStepOutput,
  runQuickDeployWorkflow,
} from "../src/index";

type StepKind = QuickDeployWorkflowStep["kind"];
type StepOf<TKind extends StepKind> = Extract<QuickDeployWorkflowStep, { kind: TKind }>;

class StepError extends Error {
  public readonly code: string;
  public readonly phase: string;

  public constructor(code: string, phase: string) {
    super(`${code}:${phase}`);
    this.code = code;
    this.phase = phase;
  }
}

type WorkflowRun = {
  result: Awaited<ReturnType<typeof runQuickDeployWorkflow>>;
  steps: QuickDeployWorkflowStep[];
};

type WorkflowCase = {
  id: string;
  name: string;
  input: QuickDeployWorkflowInput;
  expectedKinds?: StepKind[];
  assert?: (run: WorkflowRun) => void;
};

type FailureCase = {
  id: string;
  name: string;
  input: QuickDeployWorkflowInput;
  failAt: StepKind;
  error: StepError;
  expectedKindsBeforeFailure: StepKind[];
};

const forbiddenDeploymentInputKeys = [
  "sourceLocator",
  "source",
  "resource",
  "deploymentMethod",
  "method",
  "port",
  "networkProfile",
  "runtimeProfile",
  "domain",
  "domains",
  "tlsMode",
  "proxyKind",
  "kubernetesNamespace",
  "manifest",
  "helmValues",
  "ingressClass",
  "replicas",
  "pullSecret",
];

describe("quick deploy workflow", () => {
  const workflowPassCases: WorkflowCase[] = [
    {
      id: "[QUICK-DEPLOY-WF-001]",
      name: "existing context quick deploy dispatches only deployments.create",
      input: existingContextInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ result, steps }) => {
        expect(result).toEqual(existingContextResult());
        expect(findStep(steps, "deployments.create").input).toMatchObject({
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-002]",
      name: "existing project and server defaults do not create replacement context",
      input: workflowInput({
        project: existingProject(),
        server: existingServer(),
        environment: { mode: "create", input: { name: "local", kind: "local" } },
        resource: existingResource(),
      }),
      expectedKinds: ["environments.create", "deployments.create"],
      assert: ({ steps }) => {
        expectNoStep(steps, "projects.create");
        expectNoStep(steps, "servers.register");
        expect(findStep(steps, "environments.create").input.projectId).toBe("proj_existing");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-003]",
      name: "empty project default bootstrap creates project before downstream context",
      input: workflowInput({
        project: { mode: "create", input: { name: "Local Workspace" } },
        server: existingServer(),
        environment: { mode: "create", input: { name: "local", kind: "local" } },
        resource: existingResource(),
      }),
      expectedKinds: ["projects.create", "environments.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "environments.create").input.projectId).toBe("proj_1");
        expect(findStep(steps, "deployments.create").input.projectId).toBe("proj_1");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-004]",
      name: "new project server and environment are created before first deployment",
      input: workflowInput({
        project: { mode: "create", input: { name: "Demo" } },
        server: {
          mode: "create",
          input: {
            name: "Local",
            host: "127.0.0.1",
            providerKey: "local-shell",
            proxyKind: "traefik",
          },
        },
        environment: { mode: "create", input: { name: "local", kind: "local" } },
        resource: existingResource(),
      }),
      expectedKinds: [
        "projects.create",
        "servers.register",
        "environments.create",
        "deployments.create",
      ],
      assert: ({ steps }) => {
        expect(findStep(steps, "deployments.create").input).toMatchObject({
          projectId: "proj_1",
          serverId: "srv_1",
          environmentId: "env_1",
          resourceId: "res_existing",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-005]",
      name: "new resource is created before deployments.create",
      input: workflowInput({
        resource: { mode: "create", input: resourceInput() },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          projectId: "proj_existing",
          environmentId: "env_existing",
        });
        expect(findStep(steps, "deployments.create").input.resourceId).toBe("res_1");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-008]",
      name: "environment variable is persisted before deployments.create",
      input: workflowInput({
        environmentVariable: {
          key: "PORT",
          value: "3000",
          kind: "plain-config",
          exposure: "runtime",
          scope: "environment",
        },
      }),
      expectedKinds: ["environments.setVariable", "deployments.create"],
      assert: ({ steps }) => {
        expectStepOrder(steps, "environments.setVariable", "deployments.create");
        expect(findStep(steps, "environments.setVariable").input.environmentId).toBe(
          "env_existing",
        );
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-009]",
      name: "domain TLS follow-up stays outside deployments.create input",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => expectDeploymentInputDoesNotContainWorkflowDrafts(steps),
    },
    {
      id: "[QUICK-DEPLOY-WF-010]",
      name: "source runtime and network drafts are sent through resources.create",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: { kind: "git-public", locator: "https://example.com/app.git" },
            runtimeProfile: {
              strategy: "workspace-commands",
              installCommand: "bun install",
              buildCommand: "bun run build",
              startCommand: "bun run start",
              healthCheckPath: "/ready",
            },
            networkProfile: {
              internalPort: 4173,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          source: { kind: "git-public", locator: "https://example.com/app.git" },
          runtimeProfile: {
            strategy: "workspace-commands",
            installCommand: "bun install",
            buildCommand: "bun run build",
            startCommand: "bun run start",
            healthCheckPath: "/ready",
          },
          networkProfile: { internalPort: 4173 },
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-011]",
      name: "Docker OCI substrate draft is resource-owned before deployment admission",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            kind: "compose-stack",
            services: [{ name: "web", kind: "web" }],
            source: { kind: "compose", locator: "compose.yaml" },
            runtimeProfile: { strategy: "docker-compose" },
            networkProfile: {
              internalPort: 8080,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
              targetServiceName: "web",
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          kind: "compose-stack",
          runtimeProfile: { strategy: "docker-compose" },
          networkProfile: { targetServiceName: "web" },
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[RES-CREATE-WF-007]",
      name: "static site first deploy creates resource before ids-only deployment",
      input: workflowInput({
        resource: {
          mode: "create",
          input: staticSiteResourceInput(),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          kind: "static-site",
          runtimeProfile: {
            strategy: "static",
            publishDirectory: "/dist",
          },
          networkProfile: {
            internalPort: 80,
            upstreamProtocol: "http",
            exposureMode: "reverse-proxy",
          },
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-012]",
      name: "runtime target stays target-owned and deployment input remains provider neutral",
      input: workflowInput({
        deployment: { destinationId: "dest_existing" },
        resource: { mode: "create", input: resourceInput() },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "deployments.create").input).toMatchObject({
          serverId: "srv_existing",
          destinationId: "dest_existing",
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-013]",
      name: "HTTP health check policy is resource runtime input",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            runtimeProfile: {
              strategy: "auto",
              healthCheck: {
                enabled: true,
                type: "http",
                intervalSeconds: 5,
                timeoutSeconds: 5,
                retries: 10,
                startPeriodSeconds: 3,
                http: {
                  method: "GET",
                  scheme: "http",
                  host: "localhost",
                  path: "/healthz",
                  expectedStatusCode: 204,
                },
              },
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.runtimeProfile).toMatchObject({
          healthCheck: {
            type: "http",
            http: { path: "/healthz", expectedStatusCode: 204 },
          },
        });
        expect(findStep(steps, "deployments.create").input).not.toHaveProperty("healthCheck");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-014]",
      name: "GitHub tree URL source is dispatched as a normalized resource source",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "git-public",
              locator: "https://github.com/coollabsio/coolify-examples",
              gitRef: "v4.x",
              baseDirectory: "/bun",
              originalLocator: "https://github.com/coollabsio/coolify-examples/tree/v4.x/bun",
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.source).toMatchObject({
          locator: "https://github.com/coollabsio/coolify-examples",
          gitRef: "v4.x",
          baseDirectory: "/bun",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-016]",
      name: "local folder base directory stays on the resource source",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: { kind: "local-folder", locator: "/workspace", baseDirectory: "/apps/api" },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.source).toMatchObject({
          kind: "local-folder",
          locator: "/workspace",
          baseDirectory: "/apps/api",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-017]",
      name: "Docker image tag source is resource source identity",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "docker-image",
              locator: "ghcr.io/acme/api:1.2.3",
              imageName: "ghcr.io/acme/api",
              imageTag: "1.2.3",
            },
            runtimeProfile: { strategy: "prebuilt-image" },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.source).toMatchObject({
          imageName: "ghcr.io/acme/api",
          imageTag: "1.2.3",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-018]",
      name: "Docker image digest source is immutable resource identity",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "docker-image",
              locator: "ghcr.io/acme/api@sha256:abc",
              imageName: "ghcr.io/acme/api",
              imageDigest: "sha256:abc",
            },
            runtimeProfile: { strategy: "prebuilt-image" },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.source).toMatchObject({
          imageName: "ghcr.io/acme/api",
          imageDigest: "sha256:abc",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-019]",
      name: "build file path draft stays out of deployments.create",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "git-public",
              locator: "https://example.com/app.git",
              baseDirectory: "/services/web",
            },
            runtimeProfile: { strategy: "dockerfile" },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          source: { baseDirectory: "/services/web" },
          runtimeProfile: { strategy: "dockerfile" },
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-021]",
      name: "generic UI CLI port label is normalized to networkProfile.internalPort",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            networkProfile: {
              internalPort: 8088,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.networkProfile).toMatchObject({
          internalPort: 8088,
        });
        expect(findStep(steps, "deployments.create").input).not.toHaveProperty("port");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-022]",
      name: "accepted workflow returns ids needed for generated access observation",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ result }) => {
        expect(result.resourceId).toBe("res_1");
        expect(result.deploymentId).toBe("dep_1");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-023]",
      name: "generated access skipped path does not add host-port fallback to deployment input",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            networkProfile: { internalPort: 3000, upstreamProtocol: "http", exposureMode: "none" },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input.networkProfile).toMatchObject({
          exposureMode: "none",
        });
        expect(findStep(steps, "deployments.create").input).not.toHaveProperty("hostPort");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-025]",
      name: "accepted workflow returns ids needed for diagnostic summary follow-up",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ result }) => {
        expect(result).toMatchObject({
          resourceId: "res_existing",
          deploymentId: "dep_1",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-026]",
      name: "diagnostic follow-up can use stable ids even when access or logs are unavailable",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ result }) => {
        expect(result.resourceId).toBeTruthy();
        expect(result.deploymentId).toBeTruthy();
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-028]",
      name: "CLI TTY prompt completion enters the same explicit workflow sequence",
      input: workflowInput({
        project: { mode: "create", input: { name: "Prompted Project" } },
        server: existingServer(),
        environment: { mode: "create", input: { name: "local", kind: "local" } },
        resource: { mode: "create", input: resourceInput({ name: "prompted-app" }) },
      }),
      expectedKinds: [
        "projects.create",
        "environments.create",
        "resources.create",
        "deployments.create",
      ],
    },
    {
      id: "[QUICK-DEPLOY-WF-030]",
      name: "Web missing source preflight remains entry-owned before shared workflow execution",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ steps }) => {
        expect(steps.length).toBe(1);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-034]",
      name: "post-acceptance runtime failure does not change original accepted workflow result",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ result }) => {
        expect(result.deploymentId).toBe("dep_1");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-036]",
      name: "duplicate natural match is resolved before shared workflow receives existing ids",
      input: existingContextInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ steps }) => {
        expectNoStep(steps, "projects.create");
        expectNoStep(steps, "servers.register");
        expectNoStep(steps, "environments.create");
        expectNoStep(steps, "resources.create");
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-037]",
      name: "shared workflow creates all prerequisites and threads returned ids",
      input: fullCreateInput(),
      expectedKinds: [
        "projects.create",
        "servers.register",
        "credentials.ssh.create",
        "servers.configureCredential",
        "environments.create",
        "resources.create",
        "environments.setVariable",
        "deployments.create",
      ],
      assert: ({ result, steps }) => {
        expect(findStep(steps, "servers.configureCredential").input).toMatchObject({
          serverId: "srv_1",
          credential: {
            kind: "stored-ssh-private-key",
            credentialId: "cred_1",
            username: "root",
          },
        });
        expect(findStep(steps, "resources.create").input).toMatchObject({
          projectId: "proj_1",
          environmentId: "env_1",
          networkProfile: {
            internalPort: 3000,
            upstreamProtocol: "http",
            exposureMode: "reverse-proxy",
          },
        });
        expect(findStep(steps, "deployments.create").input).toEqual({
          projectId: "proj_1",
          serverId: "srv_1",
          environmentId: "env_1",
          resourceId: "res_1",
        });
        expect(result).toEqual({
          projectId: "proj_1",
          serverId: "srv_1",
          environmentId: "env_1",
          resourceId: "res_1",
          deploymentId: "dep_1",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-038]",
      name: "shared workflow uses existing ids without creating prerequisite records",
      input: existingContextInput({ deployment: { destinationId: "dest_existing" } }),
      expectedKinds: ["deployments.create"],
      assert: ({ result, steps }) => {
        expect(findStep(steps, "deployments.create").input).toEqual({
          projectId: "proj_existing",
          serverId: "srv_existing",
          destinationId: "dest_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
        });
        expect(result).toEqual(existingContextResult());
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-010A]",
      name: "shared workflow configures existing resource runtime profile before ids-only deployment",
      input: workflowInput({
        resource: {
          mode: "existing",
          id: "res_existing",
          configureRuntime: {
            runtimeProfile: {
              strategy: "workspace-commands",
              runtimeName: "preview-125",
            },
          },
        },
      }),
      expectedKinds: ["resources.configureRuntime", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.configureRuntime").input).toEqual({
          resourceId: "res_existing",
          runtimeProfile: {
            strategy: "workspace-commands",
            runtimeName: "preview-125",
          },
        });
        expect(findStep(steps, "deployments.create").input).toEqual({
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_existing",
        });
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-039]",
      name: "workflow executor can report per-step progress and stop on failed steps",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(steps.map((step) => step.kind)).toEqual(["resources.create", "deployments.create"]);
      },
    },
    {
      id: "[QUICK-DEPLOY-WF-040]",
      name: "static site first deploy maps static draft to resources.create",
      input: workflowInput({
        resource: {
          mode: "create",
          input: staticSiteResourceInput(),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ result, steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          kind: "static-site",
          runtimeProfile: {
            strategy: "static",
            buildCommand: "pnpm build",
            publishDirectory: "/dist",
          },
          networkProfile: {
            internalPort: 80,
          },
        });
        expect(findStep(steps, "deployments.create").input).toEqual({
          projectId: "proj_existing",
          serverId: "srv_existing",
          environmentId: "env_existing",
          resourceId: "res_1",
        });
        expect(result.resourceId).toBe("res_1");
      },
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-009]",
      name: "framework detection draft enters resources.create and stays out of deployments.create",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "local-folder",
              locator: "/workspace",
              baseDirectory: "/apps/web",
            },
            runtimeProfile: {
              strategy: "workspace-commands",
              installCommand: "bun install",
              buildCommand: "bun run build",
              startCommand: "bun run start",
            },
            networkProfile: {
              internalPort: 3000,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
          }),
        },
      }),
      expectedKinds: ["resources.create", "deployments.create"],
      assert: ({ steps }) => {
        expect(findStep(steps, "resources.create").input).toMatchObject({
          source: {
            baseDirectory: "/apps/web",
          },
          runtimeProfile: {
            strategy: "workspace-commands",
            installCommand: "bun install",
            buildCommand: "bun run build",
            startCommand: "bun run start",
          },
          networkProfile: {
            internalPort: 3000,
          },
        });
        expectDeploymentInputDoesNotContainWorkflowDrafts(steps);
      },
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-001]",
      name: "id-only deploy path can skip source while create-resource paths require entry preflight",
      input: existingContextInput(),
      expectedKinds: ["deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-002]",
      name: "new project entry dispatches projects.create explicitly",
      input: workflowInput({ project: { mode: "create", input: { name: "New Project" } } }),
      expectedKinds: ["projects.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-003]",
      name: "new server entry dispatches servers.register explicitly",
      input: workflowInput({
        server: {
          mode: "create",
          input: {
            name: "Target",
            host: "127.0.0.1",
            providerKey: "local-shell",
            proxyKind: "traefik",
          },
        },
      }),
      expectedKinds: ["servers.register", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-004]",
      name: "new environment entry dispatches environments.create explicitly",
      input: workflowInput({
        environment: { mode: "create", input: { name: "prod", kind: "production" } },
      }),
      expectedKinds: ["environments.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-005]",
      name: "new resource entry dispatches resources.create explicitly",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      expectedKinds: ["resources.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-006]",
      name: "final deploy entry dispatches deployments.create",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-ENTRY-007]",
      name: "domain TLS entry remains a separate follow-up surface",
      input: workflowInput(),
      expectedKinds: ["deployments.create"],
      assert: ({ steps }) => expectDeploymentInputDoesNotContainWorkflowDrafts(steps),
    },
  ];

  test.each(workflowPassCases)("$id $name", async (workflowCase) => {
    const run = await runWorkflow(workflowCase.input);
    if (workflowCase.expectedKinds) {
      expect(run.steps.map((step) => step.kind)).toEqual(workflowCase.expectedKinds);
    }
    workflowCase.assert?.(run);
  });

  test("[QUICK-DEPLOY-WF-006] generates resource names from source names with a random suffix", () => {
    expect(normalizeQuickDeployGeneratedNameBase("Render Examples / Bun Docker.git")).toBe(
      "render-examples-bun-docker",
    );
    expect(createQuickDeployGeneratedResourceName("bun-docker", "a1b2c3")).toBe(
      "bun-docker-a1b2c3",
    );
  });

  test("[QUICK-DEPLOY-ENTRY-008] static site draft validates through shared resources.create schema", () => {
    const parsed = createResourceInputSchema.safeParse({
      projectId: "proj_existing",
      environmentId: "env_existing",
      ...staticSiteResourceInput(),
    });

    expect(parsed.success).toBe(true);
  });

  const workflowFailureCases: FailureCase[] = [
    {
      id: "[QUICK-DEPLOY-WF-007]",
      name: "duplicate resource name stops at resources.create and does not deploy",
      input: workflowInput({
        resource: { mode: "create", input: resourceInput({ name: "taken" }) },
      }),
      failAt: "resources.create",
      error: new StepError("resource_slug_conflict", "resource-admission"),
      expectedKindsBeforeFailure: ["resources.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-015]",
      name: "slash-containing Git ref without provider proof stops before deployment",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({
            source: {
              kind: "git-public",
              locator: "https://github.com/acme/app",
              originalLocator: "https://github.com/acme/app/tree/feature/slash/path",
            },
          }),
        },
      }),
      failAt: "resources.create",
      error: new StepError("validation_error", "resource-source-resolution"),
      expectedKindsBeforeFailure: ["resources.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-020]",
      name: "missing resource port for inbound app stops before accepted deployment",
      input: workflowInput({
        resource: {
          mode: "create",
          input: resourceInput({ networkProfile: undefined }),
        },
      }),
      failAt: "resources.create",
      error: new StepError("validation_error", "resource-network-resolution"),
      expectedKindsBeforeFailure: ["resources.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-024]",
      name: "generated access route unavailable surfaces deployment route error",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      failAt: "deployments.create",
      error: new StepError("proxy_not_ready", "proxy-readiness"),
      expectedKindsBeforeFailure: ["resources.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-027]",
      name: "incompatible source runtime draft fails at final deployment admission",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      failAt: "deployments.create",
      error: new StepError("validation_error", "runtime-plan-resolution"),
      expectedKindsBeforeFailure: ["resources.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-029]",
      name: "missing source outside CLI TTY remains entry-owned before shared workflow execution",
      input: workflowInput(),
      failAt: "deployments.create",
      error: new StepError("validation_error", "input-collection"),
      expectedKindsBeforeFailure: ["deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-031]",
      name: "server registration failure stops before deployment",
      input: workflowInput({
        server: {
          mode: "create",
          input: {
            name: "Bad Target",
            host: "192.0.2.10",
            providerKey: "generic-ssh",
            proxyKind: "traefik",
          },
        },
      }),
      failAt: "servers.register",
      error: new StepError("provider_error", "server-registration"),
      expectedKindsBeforeFailure: ["servers.register"],
    },
    {
      id: "[QUICK-DEPLOY-WF-032]",
      name: "credential configuration failure preserves prior server step and stops deployment",
      input: workflowInput({
        server: {
          mode: "create",
          input: {
            name: "Target",
            host: "127.0.0.1",
            providerKey: "generic-ssh",
            proxyKind: "traefik",
          },
          credential: {
            mode: "configure",
            credential: { kind: "ssh-private-key", username: "root", privateKey: "secret" },
          },
        },
      }),
      failAt: "servers.configureCredential",
      error: new StepError("credential_attach_failed", "credential-configuration"),
      expectedKindsBeforeFailure: ["servers.register", "servers.configureCredential"],
    },
    {
      id: "[QUICK-DEPLOY-WF-033]",
      name: "deployment admission failure keeps created context and returns command error",
      input: workflowInput({ resource: { mode: "create", input: resourceInput() } }),
      failAt: "deployments.create",
      error: new StepError("validation_error", "deployment-admission"),
      expectedKindsBeforeFailure: ["resources.create", "deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-035]",
      name: "duplicate submit with active deployment is guarded by deployments.create",
      input: existingContextInput(),
      failAt: "deployments.create",
      error: new StepError("deployment_not_redeployable", "redeploy-guard"),
      expectedKindsBeforeFailure: ["deployments.create"],
    },
    {
      id: "[QUICK-DEPLOY-WF-041]",
      name: "static site missing publish directory stops before accepted deployment",
      input: workflowInput({
        resource: {
          mode: "create",
          input: staticSiteResourceInput({
            runtimeProfile: {
              strategy: "static",
            } as never,
          }),
        },
      }),
      failAt: "resources.create",
      error: new StepError("validation_error", "resource-runtime-resolution"),
      expectedKindsBeforeFailure: ["resources.create"],
    },
  ];

  test.each(workflowFailureCases)("$id $name", async (workflowCase) => {
    const run = await runWorkflowExpectingFailure(
      workflowCase.input,
      workflowCase.failAt,
      workflowCase.error,
    );

    expect(run.steps.map((step) => step.kind)).toEqual(workflowCase.expectedKindsBeforeFailure);
    expect(run.error).toBe(workflowCase.error);
    expectNoStepAfterFailure(run.steps, workflowCase.failAt, "deployments.create");
  });
});

function existingProject(): QuickDeployWorkflowInput["project"] {
  return { mode: "existing", id: "proj_existing" };
}

function existingServer(): QuickDeployWorkflowInput["server"] {
  return { mode: "existing", id: "srv_existing" };
}

function existingEnvironment(): QuickDeployWorkflowInput["environment"] {
  return { mode: "existing", id: "env_existing" };
}

function existingResource(): QuickDeployWorkflowInput["resource"] {
  return { mode: "existing", id: "res_existing" };
}

function resourceInput(
  overrides: Partial<QuickDeployCreateResourceInput> = {},
): QuickDeployCreateResourceInput {
  const base: QuickDeployCreateResourceInput = {
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
  };

  return {
    ...base,
    ...overrides,
    source: overrides.source ?? base.source,
    runtimeProfile:
      overrides.runtimeProfile === undefined
        ? base.runtimeProfile
        : { ...base.runtimeProfile, ...overrides.runtimeProfile },
    networkProfile:
      overrides.networkProfile === undefined ? base.networkProfile : overrides.networkProfile,
  };
}

function staticSiteResourceInput(
  overrides: Partial<QuickDeployCreateResourceInput> = {},
): QuickDeployCreateResourceInput {
  return resourceInput({
    name: "docs-site",
    kind: "static-site",
    source: {
      kind: "local-folder",
      locator: ".",
      baseDirectory: "/site",
    },
    runtimeProfile: {
      strategy: "static",
      buildCommand: "pnpm build",
      publishDirectory: "/dist",
    } as never,
    networkProfile: {
      internalPort: 80,
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
    ...overrides,
  });
}

function workflowInput(
  overrides: Partial<QuickDeployWorkflowInput> = {},
): QuickDeployWorkflowInput {
  return {
    project: existingProject(),
    server: existingServer(),
    environment: existingEnvironment(),
    resource: existingResource(),
    ...overrides,
  };
}

function existingContextInput(
  overrides: Partial<QuickDeployWorkflowInput> = {},
): QuickDeployWorkflowInput {
  return workflowInput(overrides);
}

function fullCreateInput(): QuickDeployWorkflowInput {
  return {
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
      input: resourceInput(),
    },
    environmentVariable: {
      key: "PORT",
      value: "3000",
      kind: "plain-config",
      exposure: "runtime",
      scope: "environment",
    },
  };
}

function existingContextResult(): WorkflowRun["result"] {
  return {
    projectId: "proj_existing",
    serverId: "srv_existing",
    environmentId: "env_existing",
    resourceId: "res_existing",
    deploymentId: "dep_1",
  };
}

async function runWorkflow(input: QuickDeployWorkflowInput): Promise<WorkflowRun> {
  const steps: QuickDeployWorkflowStep[] = [];
  const result = await runQuickDeployWorkflow(input, (step) => {
    steps.push(step);
    return outputForStep(step);
  });

  return { result, steps };
}

async function runWorkflowExpectingFailure(
  input: QuickDeployWorkflowInput,
  failAt: StepKind,
  error: StepError,
): Promise<{ error: unknown; steps: QuickDeployWorkflowStep[] }> {
  const steps: QuickDeployWorkflowStep[] = [];
  let caught: unknown;

  try {
    await runQuickDeployWorkflow(input, (step) => {
      steps.push(step);
      if (step.kind === failAt) {
        throw error;
      }
      return outputForStep(step);
    });
  } catch (current) {
    caught = current;
  }

  return { error: caught, steps };
}

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
    case "resources.configureRuntime":
      return { id: "res_1" };
    case "environments.setVariable":
      return;
    case "deployments.create":
      return { id: "dep_1" };
  }
}

function findStep<TKind extends StepKind>(
  steps: QuickDeployWorkflowStep[],
  kind: TKind,
): StepOf<TKind> {
  const step = steps.find((candidate) => candidate.kind === kind);
  if (!step) {
    throw new Error(`Missing workflow step ${kind}`);
  }
  return step as StepOf<TKind>;
}

function expectNoStep(steps: QuickDeployWorkflowStep[], kind: StepKind): void {
  expect(steps.some((step) => step.kind === kind)).toBe(false);
}

function expectStepOrder(
  steps: QuickDeployWorkflowStep[],
  earlier: StepKind,
  later: StepKind,
): void {
  const kinds = steps.map((step) => step.kind);
  expect(kinds.indexOf(earlier)).toBeGreaterThanOrEqual(0);
  expect(kinds.indexOf(later)).toBeGreaterThan(kinds.indexOf(earlier));
}

function expectNoStepAfterFailure(
  steps: QuickDeployWorkflowStep[],
  failedStep: StepKind,
  disallowedAfterFailure: StepKind,
): void {
  const failedIndex = steps.findIndex((step) => step.kind === failedStep);
  const disallowedIndex = steps.findIndex((step) => step.kind === disallowedAfterFailure);
  if (disallowedIndex >= 0) {
    expect(disallowedIndex).toBeLessThanOrEqual(failedIndex);
  }
}

function expectDeploymentInputDoesNotContainWorkflowDrafts(steps: QuickDeployWorkflowStep[]): void {
  const deploymentInput = findStep(steps, "deployments.create").input as Record<string, unknown>;

  for (const key of forbiddenDeploymentInputKeys) {
    expect(deploymentInput).not.toHaveProperty(key);
  }
}
