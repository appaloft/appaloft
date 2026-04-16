import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const shellRoot = new URL("../..", import.meta.url).pathname;
const fixtureDir = new URL("../fixtures/workspace-http-app", import.meta.url).pathname;

type CliOptions = {
  dataDir: string;
  httpPort: string;
  pgliteDataDir: string;
};

type DeploymentSummary = {
  id: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
  runtimePlan: {
    execution: {
      accessRoutes?: Array<{
        proxyKind: string;
        domains: string[];
        pathPrefix: string;
        tlsMode: string;
      }>;
      metadata?: Record<string, string>;
    };
  };
};

type DomainBindingSummary = {
  id: string;
  domainName: string;
  resourceId: string;
  status: string;
  verificationAttemptCount: number;
};

type DomainBindingListResponse = {
  items: DomainBindingSummary[];
};

type CertificateSummary = {
  id: string;
  domainBindingId: string;
  domainName: string;
  status: string;
  providerKey: string;
  challengeType: string;
  latestAttempt?: {
    id: string;
    status: string;
    reason: string;
  };
};

type CertificateListResponse = {
  items: CertificateSummary[];
};

type ResourceSummary = {
  id: string;
  accessSummary?: {
    latestDurableDomainRoute?: {
      url: string;
      hostname: string;
      scheme: "http" | "https";
      deploymentId?: string;
    };
  };
};

type ResourceListResponse = {
  items: ResourceSummary[];
};

function createWorkspace(name: string) {
  const workspaceDir = mkdtempSync(join(tmpdir(), name));
  const dataDir = join(workspaceDir, ".yundu", "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const httpPort = String(3600 + Math.floor(Math.random() * 500));

  return {
    cliOptions: {
      dataDir,
      httpPort,
      pgliteDataDir,
    },
    workspaceDir,
  };
}

function runCli(
  args: string[],
  options: CliOptions,
): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      YUNDU_APP_VERSION: "0.1.0-domain-binding-test",
      YUNDU_DATABASE_DRIVER: "pglite",
      YUNDU_DATA_DIR: options.dataDir,
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: options.httpPort,
      YUNDU_PGLITE_DATA_DIR: options.pgliteDataDir,
      YUNDU_WEB_STATIC_DIR: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

function expectCliOk(result: { exitCode: number }): void {
  expect(result.exitCode).toBe(0);
}

function cleanupDeploymentRuntime(deploymentId: string | undefined): void {
  if (!deploymentId) {
    return;
  }

  Bun.spawnSync(["docker", "rm", "-f", `yundu-${deploymentId}`], {
    stderr: "ignore",
    stdout: "ignore",
  });
  Bun.spawnSync(["docker", "image", "rm", "-f", `yundu-image-${deploymentId}:latest`], {
    stderr: "ignore",
    stdout: "ignore",
  });
}

async function waitForHealth(url: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await Bun.sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function findDeployment(args: {
  deploymentId: string;
  items: DeploymentSummary[];
}): DeploymentSummary {
  const deployment = args.items.find((item) => item.id === args.deploymentId);

  if (!deployment) {
    throw new Error(`Deployment ${args.deploymentId} was not listed`);
  }

  return deployment;
}

function findDomainBinding(args: {
  domainBindingId: string;
  items: DomainBindingSummary[];
}): DomainBindingSummary {
  const binding = args.items.find((item) => item.id === args.domainBindingId);

  if (!binding) {
    throw new Error(`Domain binding ${args.domainBindingId} was not listed`);
  }

  return binding;
}

function findCertificate(args: {
  certificateId: string;
  items: CertificateSummary[];
}): CertificateSummary {
  const certificate = args.items.find((item) => item.id === args.certificateId);

  if (!certificate) {
    throw new Error(`Certificate ${args.certificateId} was not listed`);
  }

  return certificate;
}

async function waitForCliDomainBindingStatus(args: {
  options: CliOptions;
  resourceId: string;
  domainBindingId: string;
  status: string;
}): Promise<DomainBindingSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const listed = runCli(["domain-binding", "list", "--resource", args.resourceId], args.options);
    expectCliOk(listed);
    lastOutput = listed.stdout;

    const binding = findDomainBinding({
      domainBindingId: args.domainBindingId,
      items: parseJson<DomainBindingListResponse>(listed.stdout).items,
    });

    if (binding.status === args.status) {
      return binding;
    }

    await Bun.sleep(250);
  }

  throw new Error(
    `Timed out waiting for binding ${args.domainBindingId} to become ${args.status}. Last output: ${lastOutput}`,
  );
}

async function waitForCliDurableRoute(args: {
  options: CliOptions;
  resourceId: string;
  expectedUrl: string;
}): Promise<ResourceSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const listed = runCli(["resource", "list"], args.options);
    expectCliOk(listed);
    lastOutput = listed.stdout;

    const resource = parseJson<ResourceListResponse>(listed.stdout).items.find(
      (item) => item.id === args.resourceId,
    );

    if (resource?.accessSummary?.latestDurableDomainRoute?.url === args.expectedUrl) {
      return resource;
    }

    await Bun.sleep(250);
  }

  throw new Error(
    `Timed out waiting for durable route ${args.expectedUrl}. Last output: ${lastOutput}`,
  );
}

function createDeploymentContext(
  options: CliOptions,
  input: {
    appPort: number;
    suffix: string;
  },
): DeploymentSummary {
  const project = runCli(
    ["project", "create", "--name", `Domain Binding ${input.suffix}`],
    options,
  );
  expectCliOk(project);
  const projectId = parseJson<{ id: string }>(project.stdout).id;

  const server = runCli(
    [
      "server",
      "register",
      "--name",
      `domain-binding-${input.suffix}`,
      "--host",
      "127.0.0.1",
      "--provider",
      "local-shell",
      "--proxy-kind",
      "traefik",
    ],
    options,
  );
  expectCliOk(server);
  const serverId = parseJson<{ id: string }>(server.stdout).id;

  const environment = runCli(
    ["env", "create", "--project", projectId, "--name", "local", "--kind", "local"],
    options,
  );
  expectCliOk(environment);
  const environmentId = parseJson<{ id: string }>(environment.stdout).id;

  const deployment = runCli(
    [
      "deploy",
      fixtureDir,
      "--project",
      projectId,
      "--server",
      serverId,
      "--environment",
      environmentId,
      "--resource-name",
      `app-${input.suffix}`,
      "--method",
      "workspace-commands",
      "--start",
      "node server.js",
      "--port",
      String(input.appPort),
      "--health-path",
      "/health",
    ],
    options,
  );
  expectCliOk(deployment);
  const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;

  const deployments = runCli(["deployments", "list", "--project", projectId], options);
  expectCliOk(deployments);

  return findDeployment({
    deploymentId,
    items: parseJson<{ items: DeploymentSummary[] }>(deployments.stdout).items,
  });
}

describe("domain binding ownership e2e", () => {
  test("[ROUTE-TLS-ENTRY-010] CLI confirms ownership and CLI list observes the bound binding", () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-domain-binding-cli-");
    let deploymentId: string | undefined;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const context = createDeploymentContext(cliOptions, {
        appPort: 4600 + Math.floor(Math.random() * 100),
        suffix,
      });
      deploymentId = context.id;
      const domainName = `${suffix}.example.com`;

      const created = runCli(
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
          "auto",
        ],
        cliOptions,
      );
      expectCliOk(created);
      const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

      const confirmed = runCli(
        [
          "domain-binding",
          "confirm-ownership",
          domainBindingId,
          "--confirmed-by",
          "cli-e2e",
          "--evidence",
          "manual DNS ownership confirmed",
        ],
        cliOptions,
      );
      expectCliOk(confirmed);
      expect(parseJson<{ id: string; verificationAttemptId: string }>(confirmed.stdout)).toEqual({
        id: domainBindingId,
        verificationAttemptId: expect.stringMatching(/^dva_/),
      });

      const listed = runCli(
        ["domain-binding", "list", "--resource", context.resourceId],
        cliOptions,
      );
      expectCliOk(listed);
      expect(
        findDomainBinding({
          domainBindingId,
          items: parseJson<DomainBindingListResponse>(listed.stdout).items,
        }),
      ).toEqual(
        expect.objectContaining({
          domainName,
          resourceId: context.resourceId,
          status: "bound",
          verificationAttemptCount: 1,
        }),
      );
    } finally {
      cleanupDeploymentRuntime(deploymentId);
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);

  test("[ROUTE-TLS-ENTRY-011] HTTP confirms ownership and HTTP list observes the bound binding", async () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-domain-binding-http-");
    const baseUrl = `http://127.0.0.1:${cliOptions.httpPort}`;
    let deploymentId: string | undefined;
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const context = createDeploymentContext(cliOptions, {
        appPort: 4700 + Math.floor(Math.random() * 100),
        suffix,
      });
      deploymentId = context.id;
      const domainName = `${suffix}.example.net`;

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: {
          ...process.env,
          YUNDU_APP_VERSION: "0.1.0-domain-binding-test",
          YUNDU_DATABASE_DRIVER: "pglite",
          YUNDU_DATA_DIR: cliOptions.dataDir,
          YUNDU_HTTP_HOST: "127.0.0.1",
          YUNDU_HTTP_PORT: cliOptions.httpPort,
          YUNDU_PGLITE_DATA_DIR: cliOptions.pgliteDataDir,
          YUNDU_WEB_STATIC_DIR: "",
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      const created = await fetch(`${baseUrl}/api/domain-bindings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: context.projectId,
          environmentId: context.environmentId,
          resourceId: context.resourceId,
          serverId: context.serverId,
          destinationId: context.destinationId,
          domainName,
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
        }),
      });
      expect(created.status).toBe(201);
      const domainBindingId = ((await created.json()) as { id: string }).id;

      const confirmed = await fetch(
        `${baseUrl}/api/domain-bindings/${domainBindingId}/ownership-confirmations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            domainBindingId,
            confirmedBy: "http-e2e",
            evidence: "manual DNS ownership confirmed",
          }),
        },
      );
      expect(confirmed.status).toBe(200);
      expect((await confirmed.json()) as { id: string; verificationAttemptId: string }).toEqual({
        id: domainBindingId,
        verificationAttemptId: expect.stringMatching(/^dva_/),
      });

      const listed = await fetch(`${baseUrl}/api/domain-bindings?resourceId=${context.resourceId}`);
      expect(listed.ok).toBe(true);
      expect(
        findDomainBinding({
          domainBindingId,
          items: ((await listed.json()) as DomainBindingListResponse).items,
        }),
      ).toEqual(
        expect.objectContaining({
          domainName,
          resourceId: context.resourceId,
          status: "bound",
          verificationAttemptCount: 1,
        }),
      );
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      cleanupDeploymentRuntime(deploymentId);
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);

  test("[ROUTE-TLS-ENTRY-012] CLI observes a TLS-disabled ready durable route through resource list", async () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-domain-binding-ready-cli-");
    let deploymentId: string | undefined;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const context = createDeploymentContext(cliOptions, {
        appPort: 4800 + Math.floor(Math.random() * 100),
        suffix,
      });
      deploymentId = context.id;
      const domainName = `${suffix}.example.org`;
      const expectedUrl = `http://${domainName}`;

      const created = runCli(
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
        cliOptions,
      );
      expectCliOk(created);
      const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

      const confirmed = runCli(
        ["domain-binding", "confirm-ownership", domainBindingId],
        cliOptions,
      );
      expectCliOk(confirmed);

      expect(
        await waitForCliDomainBindingStatus({
          options: cliOptions,
          resourceId: context.resourceId,
          domainBindingId,
          status: "ready",
        }),
      ).toEqual(
        expect.objectContaining({
          domainName,
          resourceId: context.resourceId,
          status: "ready",
          verificationAttemptCount: 1,
        }),
      );

      const resource = await waitForCliDurableRoute({
        options: cliOptions,
        resourceId: context.resourceId,
        expectedUrl,
      });

      expect(resource.accessSummary?.latestDurableDomainRoute).toEqual(
        expect.objectContaining({
          url: expectedUrl,
          hostname: domainName,
          scheme: "http",
        }),
      );
    } finally {
      cleanupDeploymentRuntime(deploymentId);
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);

  test("[ROUTE-TLS-WORKFLOW-001] CLI binds a TLS-disabled domain before redeploy and observes a deployable runtime route", async () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-domain-binding-workflow-cli-");
    const deploymentIds: string[] = [];

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const appPort = 5100 + Math.floor(Math.random() * 100);
      const context = createDeploymentContext(cliOptions, {
        appPort,
        suffix,
      });
      deploymentIds.push(context.id);
      const domainName = `${suffix}.workflow.example`;
      const expectedUrl = `http://${domainName}`;

      const created = runCli(
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
        cliOptions,
      );
      expectCliOk(created);
      const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

      const confirmed = runCli(
        ["domain-binding", "confirm-ownership", domainBindingId],
        cliOptions,
      );
      expectCliOk(confirmed);
      await waitForCliDomainBindingStatus({
        options: cliOptions,
        resourceId: context.resourceId,
        domainBindingId,
        status: "ready",
      });

      const redeployed = runCli(
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
        cliOptions,
      );
      expectCliOk(redeployed);
      const redeploymentId = parseJson<{ id: string }>(redeployed.stdout).id;
      deploymentIds.push(redeploymentId);

      const deployments = runCli(
        ["deployments", "list", "--project", context.projectId],
        cliOptions,
      );
      expectCliOk(deployments);
      const redeployment = findDeployment({
        deploymentId: redeploymentId,
        items: parseJson<{ items: DeploymentSummary[] }>(deployments.stdout).items,
      });
      expect(redeployment.runtimePlan.execution.accessRoutes?.[0]).toEqual(
        expect.objectContaining({
          proxyKind: "traefik",
          domains: [domainName],
          pathPrefix: "/",
          tlsMode: "disabled",
        }),
      );
      expect(redeployment.runtimePlan.execution.metadata).toEqual(
        expect.objectContaining({
          "access.routeSource": "durable-domain-binding",
          "access.domainBindingId": domainBindingId,
          "access.hostname": domainName,
          "access.scheme": "http",
        }),
      );

      const resource = await waitForCliDurableRoute({
        options: cliOptions,
        resourceId: context.resourceId,
        expectedUrl,
      });
      expect(resource.accessSummary?.latestDurableDomainRoute).toEqual(
        expect.objectContaining({
          url: expectedUrl,
          hostname: domainName,
          scheme: "http",
          deploymentId: redeploymentId,
        }),
      );
    } finally {
      for (const deploymentId of deploymentIds) {
        cleanupDeploymentRuntime(deploymentId);
      }
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 60000);

  test("[ROUTE-TLS-ENTRY-013] CLI requests a certificate and CLI list observes provider-unavailable state", () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-certificate-cli-");
    let deploymentId: string | undefined;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const context = createDeploymentContext(cliOptions, {
        appPort: 4900 + Math.floor(Math.random() * 100),
        suffix,
      });
      deploymentId = context.id;
      const domainName = `${suffix}.example.dev`;

      const created = runCli(
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
          "auto",
        ],
        cliOptions,
      );
      expectCliOk(created);
      const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

      const confirmed = runCli(
        ["domain-binding", "confirm-ownership", domainBindingId],
        cliOptions,
      );
      expectCliOk(confirmed);

      const requested = runCli(
        ["certificate", "issue-or-renew", domainBindingId, "--reason", "issue"],
        cliOptions,
      );
      expectCliOk(requested);
      const certificateResult = parseJson<{ certificateId: string; attemptId: string }>(
        requested.stdout,
      );
      expect(certificateResult).toEqual({
        certificateId: expect.stringMatching(/^crt_/),
        attemptId: expect.stringMatching(/^cat_/),
      });

      const listed = runCli(
        ["certificate", "list", "--domain-binding", domainBindingId],
        cliOptions,
      );
      expectCliOk(listed);
      expect(
        findCertificate({
          certificateId: certificateResult.certificateId,
          items: parseJson<CertificateListResponse>(listed.stdout).items,
        }),
      ).toEqual(
        expect.objectContaining({
          domainBindingId,
          domainName,
          status: "failed",
          providerKey: "acme",
          challengeType: "http-01",
          latestAttempt: expect.objectContaining({
            id: certificateResult.attemptId,
            status: "retry_scheduled",
            reason: "issue",
            errorCode: "certificate_provider_unavailable",
            failurePhase: "provider-request",
            retriable: true,
          }),
        }),
      );
    } finally {
      cleanupDeploymentRuntime(deploymentId);
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);

  test("[ROUTE-TLS-ENTRY-014] HTTP requests a certificate and HTTP list observes provider-unavailable state", async () => {
    const { cliOptions, workspaceDir } = createWorkspace("yundu-certificate-http-");
    const baseUrl = `http://127.0.0.1:${cliOptions.httpPort}`;
    let deploymentId: string | undefined;
    let serverProcess: Bun.Subprocess | null = null;

    try {
      const suffix = crypto.randomUUID().slice(0, 6);
      const context = createDeploymentContext(cliOptions, {
        appPort: 5000 + Math.floor(Math.random() * 100),
        suffix,
      });
      deploymentId = context.id;
      const domainName = `${suffix}.example.io`;

      serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
        cwd: shellRoot,
        env: {
          ...process.env,
          YUNDU_APP_VERSION: "0.1.0-certificate-test",
          YUNDU_DATABASE_DRIVER: "pglite",
          YUNDU_DATA_DIR: cliOptions.dataDir,
          YUNDU_HTTP_HOST: "127.0.0.1",
          YUNDU_HTTP_PORT: cliOptions.httpPort,
          YUNDU_PGLITE_DATA_DIR: cliOptions.pgliteDataDir,
          YUNDU_WEB_STATIC_DIR: "",
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      await waitForHealth(`${baseUrl}/api/health`);

      const created = await fetch(`${baseUrl}/api/domain-bindings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          projectId: context.projectId,
          environmentId: context.environmentId,
          resourceId: context.resourceId,
          serverId: context.serverId,
          destinationId: context.destinationId,
          domainName,
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
        }),
      });
      expect(created.status).toBe(201);
      const domainBindingId = ((await created.json()) as { id: string }).id;

      const confirmed = await fetch(
        `${baseUrl}/api/domain-bindings/${domainBindingId}/ownership-confirmations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ domainBindingId }),
        },
      );
      expect(confirmed.status).toBe(200);

      const requested = await fetch(`${baseUrl}/api/certificates/issue-or-renew`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          domainBindingId,
          reason: "issue",
        }),
      });
      expect(requested.status).toBe(202);
      const certificateResult = (await requested.json()) as {
        certificateId: string;
        attemptId: string;
      };
      expect(certificateResult).toEqual({
        certificateId: expect.stringMatching(/^crt_/),
        attemptId: expect.stringMatching(/^cat_/),
      });

      const listed = await fetch(`${baseUrl}/api/certificates?domainBindingId=${domainBindingId}`);
      expect(listed.ok).toBe(true);
      expect(
        findCertificate({
          certificateId: certificateResult.certificateId,
          items: ((await listed.json()) as CertificateListResponse).items,
        }),
      ).toEqual(
        expect.objectContaining({
          domainBindingId,
          domainName,
          status: "failed",
          providerKey: "acme",
          challengeType: "http-01",
          latestAttempt: expect.objectContaining({
            id: certificateResult.attemptId,
            status: "retry_scheduled",
            reason: "issue",
            errorCode: "certificate_provider_unavailable",
            failurePhase: "provider-request",
            retriable: true,
          }),
        }),
      );
    } finally {
      serverProcess?.kill();
      await serverProcess?.exited;
      cleanupDeploymentRuntime(deploymentId);
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);
});
