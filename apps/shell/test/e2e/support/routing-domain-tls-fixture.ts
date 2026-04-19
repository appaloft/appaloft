import { expect } from "bun:test";
import {
  cleanupLocalDockerDeployment,
  cleanupWorkspace,
  createShellE2eWorkspace,
  expectCliSuccess,
  fixturePath,
  parseJson,
  runShellCli,
  type ShellCliOptions,
} from "./shell-e2e-fixture";

const workspaceHttpAppFixture = fixturePath("workspace-http-app");

export interface DeploymentSummary {
  destinationId: string;
  environmentId: string;
  id: string;
  projectId: string;
  resourceId: string;
  runtimePlan: {
    execution: {
      accessRoutes?: Array<{
        domains: string[];
        pathPrefix: string;
        proxyKind: string;
        tlsMode: string;
      }>;
      metadata?: Record<string, string>;
    };
  };
  serverId: string;
}

export interface DomainBindingSummary {
  dnsObservation?: {
    checkedAt?: string;
    expectedTargets: string[];
    message?: string;
    observedTargets: string[];
    status: string;
  };
  domainName: string;
  id: string;
  redirectStatus?: 301 | 302 | 307 | 308;
  redirectTo?: string;
  resourceId: string;
  status: string;
  verificationAttemptCount: number;
}

export interface CertificateSummary {
  challengeType: string;
  domainBindingId: string;
  domainName: string;
  id: string;
  latestAttempt?: {
    errorCode?: string;
    failurePhase?: string;
    id: string;
    reason: string;
    retriable?: boolean;
    status: string;
  };
  providerKey: string;
  status: string;
}

export interface ResourceSummary {
  accessSummary?: {
    latestDurableDomainRoute?: {
      deploymentId?: string;
      hostname: string;
      scheme: "http" | "https";
      url: string;
    };
  };
  id: string;
}

export interface RoutingDomainTlsFixture {
  addDeploymentId: (deploymentId: string) => void;
  cleanup: () => void;
  cliOptions: ShellCliOptions;
  deployWorkspaceResource: (input: {
    appPort: number;
    resourceName?: string;
    suffix: string;
  }) => DeploymentSummary;
  environmentId: string;
  projectId: string;
  serverId: string;
  workspaceDir: string;
}

export function createRoutingDomainTlsFixture(input: {
  appVersion?: string;
  prefix: string;
  proxyKind?: "none" | "traefik";
}): RoutingDomainTlsFixture {
  const workspace = createShellE2eWorkspace(input.prefix, {
    appVersion: input.appVersion ?? "0.1.0-routing-domain-tls-e2e",
  });
  const suffix = crypto.randomUUID().slice(0, 8);
  const deploymentIds: string[] = [];
  const proxyKind = input.proxyKind ?? "traefik";

  const project = runShellCli(
    ["project", "create", "--name", `Routing Domain ${suffix}`],
    workspace.cliOptions,
  );
  expectCliSuccess(project, "create routing/domain project");
  const projectId = parseJson<{ id: string }>(project.stdout).id;

  const server = runShellCli(
    [
      "server",
      "register",
      "--name",
      `routing-domain-${suffix}`,
      "--host",
      "127.0.0.1",
      "--provider",
      "local-shell",
      "--proxy-kind",
      proxyKind,
    ],
    workspace.cliOptions,
  );
  expectCliSuccess(server, "register routing/domain server");
  const serverId = parseJson<{ id: string }>(server.stdout).id;

  const environment = runShellCli(
    ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
    workspace.cliOptions,
  );
  expectCliSuccess(environment, "create routing/domain environment");
  const environmentId = parseJson<{ id: string }>(environment.stdout).id;

  return {
    addDeploymentId(deploymentId) {
      deploymentIds.push(deploymentId);
    },
    cleanup() {
      for (const deploymentId of deploymentIds) {
        cleanupLocalDockerDeployment(deploymentId);
      }
      cleanupWorkspace(workspace.workspaceDir);
    },
    cliOptions: workspace.cliOptions,
    deployWorkspaceResource(resourceInput) {
      const deployment = runShellCli(
        [
          "deploy",
          workspaceHttpAppFixture,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--resource-name",
          resourceInput.resourceName ?? `app-${resourceInput.suffix}`,
          "--method",
          "workspace-commands",
          "--start",
          "node server.js",
          "--port",
          String(resourceInput.appPort),
          "--health-path",
          "/health",
        ],
        workspace.cliOptions,
      );
      expectCliSuccess(deployment, "deploy routing/domain resource");
      const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
      deploymentIds.push(deploymentId);

      const deployments = runShellCli(["deployments", "list", "--project", projectId], {
        ...workspace.cliOptions,
      });
      expectCliSuccess(deployments, "list routing/domain deployments");

      return findDeployment({
        deploymentId,
        items: parseJson<{ items: DeploymentSummary[] }>(deployments.stdout).items,
      });
    },
    environmentId,
    projectId,
    serverId,
    workspaceDir: workspace.workspaceDir,
  };
}

export function findDeployment(input: {
  deploymentId: string;
  items: DeploymentSummary[];
}): DeploymentSummary {
  const deployment = input.items.find((item) => item.id === input.deploymentId);

  if (!deployment) {
    throw new Error(`Deployment ${input.deploymentId} was not listed`);
  }

  return deployment;
}

export function findDomainBinding(input: {
  domainBindingId: string;
  items: DomainBindingSummary[];
}): DomainBindingSummary {
  const binding = input.items.find((item) => item.id === input.domainBindingId);

  if (!binding) {
    throw new Error(`Domain binding ${input.domainBindingId} was not listed`);
  }

  return binding;
}

export function findCertificate(input: {
  certificateId: string;
  items: CertificateSummary[];
}): CertificateSummary {
  const certificate = input.items.find((item) => item.id === input.certificateId);

  if (!certificate) {
    throw new Error(`Certificate ${input.certificateId} was not listed`);
  }

  return certificate;
}

export async function waitForCliDomainBindingStatus(input: {
  domainBindingId: string;
  options: ShellCliOptions;
  resourceId: string;
  status: string;
}): Promise<DomainBindingSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const listed = runShellCli(["domain-binding", "list", "--resource", input.resourceId], {
      ...input.options,
    });
    expectCliSuccess(listed, "list domain bindings");
    lastOutput = listed.stdout;

    const binding = findDomainBinding({
      domainBindingId: input.domainBindingId,
      items: parseJson<{ items: DomainBindingSummary[] }>(listed.stdout).items,
    });

    if (binding.status === input.status) {
      return binding;
    }

    await Bun.sleep(500);
  }

  throw new Error(
    `Timed out waiting for binding ${input.domainBindingId} to become ${input.status}. Last output: ${lastOutput}`,
  );
}

export async function waitForCliDurableRoute(input: {
  expectedUrl: string;
  options: ShellCliOptions;
  resourceId: string;
}): Promise<ResourceSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const listed = runShellCli(["resource", "list"], input.options);
    expectCliSuccess(listed, "list resources");
    lastOutput = listed.stdout;

    const resource = parseJson<{ items: ResourceSummary[] }>(listed.stdout).items.find(
      (item) => item.id === input.resourceId,
    );

    if (resource?.accessSummary?.latestDurableDomainRoute?.url === input.expectedUrl) {
      return resource;
    }

    await Bun.sleep(500);
  }

  throw new Error(
    `Timed out waiting for durable route ${input.expectedUrl}. Last output: ${lastOutput}`,
  );
}

export function expectDomainBindingSummary(input: {
  binding: DomainBindingSummary;
  domainName: string;
  resourceId: string;
  status: string;
}): void {
  expect(input.binding).toEqual(
    expect.objectContaining({
      domainName: input.domainName,
      resourceId: input.resourceId,
      status: input.status,
      verificationAttemptCount: 1,
    }),
  );
}
