import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const databaseUrl = process.env.YUNDU_DATABASE_URL;
const port = process.env.YUNDU_HTTP_PORT ?? "3101";
const baseUrl = `http://127.0.0.1:${port}`;
const shellRoot = new URL("../..", import.meta.url).pathname;
const fixtureDir = new URL("../fixtures/local-http-app", import.meta.url).pathname;
const useExternalServer = process.env.YUNDU_E2E_EXTERNAL_SERVER === "true";

let serverProcess: Bun.Subprocess | null = null;

function runCli(args: string[]): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
    cwd: shellRoot,
    env: {
      ...process.env,
      YUNDU_DATABASE_URL: databaseUrl ?? "",
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: port,
      YUNDU_APP_VERSION: "0.1.0-test",
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

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

describe("shell CLI + HTTP e2e", () => {
  if (!databaseUrl) {
    test("skips external PostgreSQL flow when YUNDU_DATABASE_URL is missing", () => {
      expect(databaseUrl).toBeUndefined();
    });
    return;
  }

  beforeAll(async () => {
    const migration = runCli(["db", "migrate"]);
    expect(migration.exitCode).toBe(0);

    if (useExternalServer) {
      await waitForHealth(`${baseUrl}/api/health`);
      return;
    }

    serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
      cwd: shellRoot,
      env: {
        ...process.env,
        YUNDU_DATABASE_URL: databaseUrl,
        YUNDU_HTTP_HOST: "127.0.0.1",
        YUNDU_HTTP_PORT: port,
        YUNDU_APP_VERSION: "0.1.0-test",
        YUNDU_WEB_STATIC_DIR: "",
      },
      stdout: "ignore",
      stderr: "ignore",
    });

    await waitForHealth(`${baseUrl}/api/health`);
  });

  afterAll(async () => {
    if (useExternalServer) {
      return;
    }

    serverProcess?.kill();
    await serverProcess?.exited;
  });

  test("runs project, server, environment, deployment, rollback, and registry flows", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);

    const doctor = runCli(["doctor"]);
    expect(doctor.exitCode).toBe(0);
    expect(parseJson<{ readiness: { status: string } }>(doctor.stdout).readiness.status).toBe(
      "ready",
    );

    const project = runCli(["project", "create", "--name", `Demo ${suffix}`]);
    const projectId = parseJson<{ id: string }>(project.stdout).id;
    expect(project.exitCode).toBe(0);

    const server = runCli([
      "server",
      "register",
      "--name",
      `server-${suffix}`,
      "--host",
      "127.0.0.1",
      "--provider",
      "generic-ssh",
    ]);
    const serverId = parseJson<{ id: string }>(server.stdout).id;
    expect(server.exitCode).toBe(0);

    const environment = runCli([
      "env",
      "create",
      "--project",
      projectId,
      "--name",
      "production",
      "--kind",
      "production",
    ]);
    const environmentId = parseJson<{ id: string }>(environment.stdout).id;
    expect(environment.exitCode).toBe(0);

    expect(
      runCli([
        "env",
        "set",
        environmentId,
        "PUBLIC_SITE_NAME",
        "yundu",
        "--kind",
        "plain-config",
        "--exposure",
        "build-time",
      ]).exitCode,
    ).toBe(0);
    expect(
      runCli([
        "env",
        "set",
        environmentId,
        "DATABASE_URL",
        "postgres://masked",
        "--kind",
        "secret",
        "--exposure",
        "runtime",
        "--secret",
      ]).exitCode,
    ).toBe(0);

    const environmentDetail = runCli(["env", "show", environmentId]);
    expect(environmentDetail.exitCode).toBe(0);
    expect(environmentDetail.stdout).toContain("****");

    const promotion = runCli(["env", "promote", environmentId, "staging", "--kind", "staging"]);
    const promotedId = parseJson<{ id: string }>(promotion.stdout).id;
    expect(promotion.exitCode).toBe(0);

    const diff = runCli(["env", "diff", environmentId, promotedId]);
    expect(diff.exitCode).toBe(0);
    expect(parseJson<unknown[]>(diff.stdout).length).toBeGreaterThan(0);

    const deployment = runCli([
      "deploy",
      fixtureDir,
      "--project",
      projectId,
      "--server",
      serverId,
      "--environment",
      environmentId,
      "--method",
      "workspace-commands",
      "--build",
      "node build.mjs",
      "--start",
      "node dist/server.js",
    ]);
    const deploymentId = parseJson<{ id: string }>(deployment.stdout).id;
    expect(deployment.exitCode).toBe(0);

    const logs = runCli(["logs", deploymentId]);
    expect(logs.exitCode).toBe(0);
    expect(parseJson<{ logs: Array<{ phase: string }> }>(logs.stdout).logs.length).toBeGreaterThan(
      0,
    );

    const rollback = runCli(["rollback", deploymentId]);
    expect(rollback.exitCode).toBe(0);

    const providersResponse = await fetch(`${baseUrl}/api/providers`);
    const projectsResponse = await fetch(`${baseUrl}/api/projects`);
    const environmentsResponse = await fetch(`${baseUrl}/api/environments`);
    const deploymentsResponse = await fetch(`${baseUrl}/api/deployments`);
    const pluginsResponse = await fetch(`${baseUrl}/api/plugins`);

    expect(providersResponse.ok).toBe(true);
    expect(projectsResponse.ok).toBe(true);
    expect(environmentsResponse.ok).toBe(true);
    expect(deploymentsResponse.ok).toBe(true);
    expect(pluginsResponse.ok).toBe(true);

    expect(((await providersResponse.json()) as { items: unknown[] }).items.length).toBeGreaterThan(
      0,
    );
    expect(((await projectsResponse.json()) as { items: Array<{ id: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );
    expect(((await environmentsResponse.json()) as { items: Array<{ id: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: environmentId })]),
    );
    expect(((await deploymentsResponse.json()) as { items: Array<{ id: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: deploymentId })]),
    );
    expect(((await pluginsResponse.json()) as { items: Array<{ name: string }> }).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "builtin-fake-runtime" })]),
    );
  }, 15000);

  test("returns a non-zero exit code when deployment input is invalid", () => {
    const suffix = crypto.randomUUID().slice(0, 6);

    const project = runCli(["project", "create", "--name", `Invalid ${suffix}`]);
    const projectId = parseJson<{ id: string }>(project.stdout).id;
    expect(project.exitCode).toBe(0);

    const server = runCli([
      "server",
      "register",
      "--name",
      `invalid-${suffix}`,
      "--host",
      "127.0.0.1",
      "--provider",
      "generic-ssh",
    ]);
    const serverId = parseJson<{ id: string }>(server.stdout).id;
    expect(server.exitCode).toBe(0);

    const environment = runCli([
      "env",
      "create",
      "--project",
      projectId,
      "--name",
      "local",
      "--kind",
      "local",
    ]);
    const environmentId = parseJson<{ id: string }>(environment.stdout).id;
    expect(environment.exitCode).toBe(0);

    const invalidDeployment = runCli([
      "deploy",
      ".",
      "--project",
      projectId,
      "--server",
      serverId,
      "--environment",
      environmentId,
      "--method",
      "workspace-commands",
    ]);

    expect(invalidDeployment.exitCode).toBe(1);
    expect(invalidDeployment.stderr).toContain("validation_error");
    expect(invalidDeployment.stdout.trim()).toBe("");
  });
});
