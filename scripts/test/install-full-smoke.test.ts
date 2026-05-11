import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const installScript = join(root, "install.sh");
const dockerCliFallbackPaths = [
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "/opt/homebrew/opt/docker/bin/docker",
  "/usr/local/opt/docker/bin/docker",
  "/Applications/Docker.app/Contents/Resources/bin/docker",
] as const;

interface FirstAdminBootstrapOutput {
  email?: string;
  generatedPassword?: string;
  organizationId?: string;
  schemaVersion: "first-admin.bootstrap/v1";
}

interface DeployTokenBootstrapOutput {
  schemaVersion: "deploy-token.bootstrap/v1";
  token?: string;
}

interface IdCommandOutput {
  id?: string;
}

async function run(command: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(command, {
    cwd: root,
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

async function dockerComposeExec(
  home: string,
  projectName: string,
  env: Record<string, string>,
  command: string[],
) {
  return run(
    [
      "docker",
      "compose",
      "--env-file",
      join(home, ".env"),
      "-p",
      projectName,
      "-f",
      join(home, "docker-compose.yml"),
      "exec",
      "-T",
      "app",
      ...command,
    ],
    env,
  );
}

async function expectDockerComposeExec(
  home: string,
  projectName: string,
  env: Record<string, string>,
  command: string[],
) {
  const result = await dockerComposeExec(home, projectName, env, command);
  expect(result.exitCode, `${command.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(0);
  return result;
}

async function waitForOk(url: string, timeoutMs: number): Promise<Response> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error;
    }

    await Bun.sleep(1000);
  }

  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

function parseJsonObjectAt(text: string, start: number): unknown {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, index + 1));
      }
    }
  }

  throw new Error("Install output included an incomplete JSON object.");
}

function parseFirstAdminBootstrapOutput(stdout: string): FirstAdminBootstrapOutput {
  const markerIndex = stdout.indexOf("first-admin.bootstrap/v1");
  if (markerIndex === -1) {
    throw new Error("Install output did not include first-admin bootstrap handoff JSON.");
  }

  const start = stdout.lastIndexOf("{", markerIndex);
  if (start === -1) {
    throw new Error("Install output did not include a first-admin bootstrap JSON object.");
  }

  const parsed = parseJsonObjectAt(stdout, start);
  if (
    parsed &&
    typeof parsed === "object" &&
    "schemaVersion" in parsed &&
    parsed.schemaVersion === "first-admin.bootstrap/v1"
  ) {
    const record = parsed as Record<string, unknown>;
    return {
      schemaVersion: "first-admin.bootstrap/v1",
      ...(typeof record.email === "string" ? { email: record.email } : {}),
      ...(typeof record.generatedPassword === "string"
        ? { generatedPassword: record.generatedPassword }
        : {}),
      ...(typeof record.organizationId === "string"
        ? { organizationId: record.organizationId }
        : {}),
    };
  }

  throw new Error("Install output included invalid first-admin bootstrap handoff JSON.");
}

function parseDeployTokenBootstrapOutput(stdout: string): DeployTokenBootstrapOutput {
  const markerIndex = stdout.indexOf("deploy-token.bootstrap/v1");
  if (markerIndex === -1) {
    throw new Error("Install output did not include deploy-token bootstrap handoff JSON.");
  }

  const start = stdout.lastIndexOf("{", markerIndex);
  if (start === -1) {
    throw new Error("Install output did not include a deploy-token bootstrap JSON object.");
  }

  const parsed = parseJsonObjectAt(stdout, start);
  if (
    parsed &&
    typeof parsed === "object" &&
    "schemaVersion" in parsed &&
    parsed.schemaVersion === "deploy-token.bootstrap/v1"
  ) {
    const record = parsed as Record<string, unknown>;
    return {
      schemaVersion: "deploy-token.bootstrap/v1",
      ...(typeof record.token === "string" ? { token: record.token } : {}),
    };
  }

  throw new Error("Install output included invalid deploy-token bootstrap handoff JSON.");
}

async function expectJsonResponse(response: Response, expectedStatus: number): Promise<unknown> {
  const text = await response.text();
  expect(response.status, text).toBe(expectedStatus);
  return text ? JSON.parse(text) : {};
}

async function postProductJson(input: {
  body: unknown;
  cookie: string;
  expectedStatus?: number;
  url: string;
}): Promise<unknown> {
  return expectJsonResponse(
    await fetch(input.url, {
      method: "POST",
      headers: {
        cookie: input.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify(input.body),
    }),
    input.expectedStatus ?? 200,
  );
}

function sessionCookieHeader(headers: Headers): string {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) {
    return "";
  }

  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie))
    .join("; ");
}

async function findDockerCli(): Promise<string | null> {
  const pathCandidates = (Bun.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, "docker"));

  for (const candidate of [...pathCandidates, ...dockerCliFallbackPaths]) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  return null;
}

async function dockerCliMissingMessage(): Promise<string> {
  const diagnostics = [
    "Docker CLI is required for APPALOFT_INSTALL_FULL_SMOKE=1.",
    `Searched: ${dockerCliFallbackPaths.join(", ")} and PATH docker entries.`,
  ];
  const dockerCompose = await run(["which", "docker-compose"]);
  if (dockerCompose.exitCode === 0) {
    diagnostics.push(
      `Found standalone docker-compose at ${dockerCompose.stdout.trim()}, but install.sh requires the docker CLI with the compose plugin.`,
    );
  }

  const colima = await run(["which", "colima"]);
  if (colima.exitCode === 0) {
    const status = await run(["colima", "status"]);
    diagnostics.push(
      `Found colima at ${colima.stdout.trim()}; status exit=${status.exitCode}: ${(
        status.stdout || status.stderr
      ).trim()}`,
    );
  }

  diagnostics.push("Install Docker CLI and ensure `docker compose version` works, then rerun.");
  return diagnostics.join("\n");
}

function envWithDockerCli(dockerCli: string): Record<string, string> {
  return {
    PATH: [dirname(dockerCli), Bun.env.PATH].filter(Boolean).join(delimiter),
  };
}

async function dockerComposeDown(
  home: string,
  projectName: string,
  env: Record<string, string>,
): Promise<void> {
  await run(
    [
      "docker",
      "compose",
      "--env-file",
      join(home, ".env"),
      "-p",
      projectName,
      "-f",
      join(home, "docker-compose.yml"),
      "down",
      "-v",
      "--remove-orphans",
    ],
    env,
  );
}

const fullInstallSmokeTestTimeoutMs = Number(
  Bun.env.APPALOFT_INSTALL_FULL_SMOKE_TEST_TIMEOUT_MS ?? "600000",
);
const fullInstallSmokeTestName =
  "[SELF-HOSTED-AUTH-E2E-003] opt-in install.sh container smoke opens console and creates an Action deployment";

async function runFullInstallSmoke(): Promise<void> {
  const dockerCli = await findDockerCli();
  if (!dockerCli) {
    throw new Error(await dockerCliMissingMessage());
  }
  const dockerEnv = envWithDockerCli(dockerCli);
  const dockerVersion = await run(
    ["docker", "version", "--format", "{{.Server.Version}}"],
    dockerEnv,
  );
  expect(dockerVersion.exitCode, dockerVersion.stderr).toBe(0);

  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-install-full-smoke-"));
  const home = join(tempRoot, "home");
  const suffix = crypto.randomUUID().slice(0, 8);
  const projectName = `appaloft-install-smoke-${suffix}`;
  const configuredImage = Bun.env.APPALOFT_INSTALL_FULL_SMOKE_IMAGE;
  const image = configuredImage ?? `appaloft-install-auth-smoke:${suffix}`;
  const port = Bun.env.APPALOFT_INSTALL_FULL_SMOKE_PORT ?? "47321";
  const consoleUrl = `http://127.0.0.1:${port}`;
  const timeoutMs = Number(Bun.env.APPALOFT_INSTALL_FULL_SMOKE_TIMEOUT_MS ?? "120000");

  await mkdir(home, { recursive: true });

  try {
    if (!configuredImage) {
      const build = await run(
        ["docker", "build", "--build-arg", "APPALOFT_RUNTIME_INSTALL_OPENSSH=0", "-t", image, "."],
        dockerEnv,
      );
      expect(build.exitCode, `${build.stdout}\n${build.stderr}`).toBe(0);
    }

    const install = await run(
      [
        "sh",
        installScript,
        "--image",
        image,
        "--home",
        home,
        "--database",
        "pglite",
        "--proxy",
        "none",
        "--host",
        "127.0.0.1",
        "--port",
        port,
        "--web-origin",
        consoleUrl,
        "--project-name",
        projectName,
        "--skip-docker-install",
        "--bootstrap-deploy-token",
        "--first-admin-email",
        "admin@example.com",
        "--first-admin-name",
        "Admin User",
      ],
      {
        ...dockerEnv,
        APPALOFT_SKIP_IMAGE_PULL: "1",
      },
    );

    expect(install.exitCode, `${install.stdout}\n${install.stderr}`).toBe(0);
    expect(install.stdout).toContain(`Open console: ${consoleUrl}`);
    expect(install.stdout).toContain("first-admin.bootstrap/v1");
    expect(install.stdout).toContain("deploy-token.bootstrap/v1");
    expect(install.stdout).toContain("APPALOFT_TOKEN");

    const health = await waitForOk(`${consoleUrl}/api/health`, timeoutMs);
    expect(health.status).toBe(200);

    const bootstrapStatus = await waitForOk(`${consoleUrl}/api/bootstrap/auth/status`, timeoutMs);
    const bootstrapJson = await bootstrapStatus.json();
    expect(bootstrapJson).toMatchObject({
      bootstrapRequired: false,
      firstAdminConfigured: true,
    });

    const firstAdmin = parseFirstAdminBootstrapOutput(install.stdout);
    expect(firstAdmin.email).toBe("admin@example.com");
    expect(firstAdmin.generatedPassword).toBeTruthy();
    expect(firstAdmin.organizationId).toBeTruthy();
    const deployToken = parseDeployTokenBootstrapOutput(install.stdout);
    expect(deployToken.token).toBeTruthy();

    const signIn = await fetch(`${consoleUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        callbackURL: "/",
        email: firstAdmin.email,
        password: firstAdmin.generatedPassword,
      }),
    });
    expect(signIn.status).toBeLessThan(400);
    const cookie = sessionCookieHeader(signIn.headers);
    expect(cookie).toContain("session");

    const session = await fetch(`${consoleUrl}/api/auth/session`, {
      headers: {
        cookie,
      },
    });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({
      session: {
        user: {
          email: "admin@example.com",
        },
      },
    });

    await postProductJson({
      cookie,
      url: `${consoleUrl}/api/organizations/current-context/switch`,
      body: {
        organizationId: firstAdmin.organizationId,
      },
    });

    const actionSmokeSource = "/tmp/appaloft-action-smoke";
    await expectDockerComposeExec(home, projectName, dockerEnv, [
      "sh",
      "-c",
      `mkdir -p ${actionSmokeSource} && printf '%s\\n' '{"name":"appaloft-action-smoke"}' > ${actionSmokeSource}/package.json`,
    ]);

    const project = (await postProductJson({
      cookie,
      expectedStatus: 201,
      url: `${consoleUrl}/api/projects`,
      body: {
        name: "Action Smoke",
      },
    })) as IdCommandOutput;
    expect(project.id).toBeTruthy();

    const environment = (await postProductJson({
      cookie,
      expectedStatus: 201,
      url: `${consoleUrl}/api/environments`,
      body: {
        projectId: project.id,
        name: "Local",
        kind: "local",
      },
    })) as IdCommandOutput;
    expect(environment.id).toBeTruthy();

    const server = (await postProductJson({
      cookie,
      expectedStatus: 201,
      url: `${consoleUrl}/api/servers`,
      body: {
        name: "Local Shell",
        host: "127.0.0.1",
        port: 22,
        providerKey: "local-shell",
        targetKind: "single-server",
        proxyKind: "none",
      },
    })) as IdCommandOutput;
    expect(server.id).toBeTruthy();

    const resource = (await postProductJson({
      cookie,
      expectedStatus: 201,
      url: `${consoleUrl}/api/resources`,
      body: {
        projectId: project.id,
        environmentId: environment.id,
        name: "Action Smoke App",
        kind: "application",
        source: {
          kind: "local-folder",
          locator: actionSmokeSource,
          displayName: "Action Smoke Source",
        },
        runtimeProfile: {
          strategy: "workspace-commands",
          startCommand:
            "bun -e \"Bun.serve({ port: Number(process.env.PORT), fetch() { return new Response('ok'); } });\"",
        },
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
        },
      },
    })) as IdCommandOutput;
    expect(resource.id).toBeTruthy();

    const consoleDeployment = (await postProductJson({
      cookie,
      expectedStatus: 201,
      url: `${consoleUrl}/api/deployments`,
      body: {
        projectId: project.id,
        environmentId: environment.id,
        resourceId: resource.id,
        serverId: server.id,
      },
    })) as IdCommandOutput;
    expect(consoleDeployment.id).toEqual(expect.stringMatching(/^dep_/));

    const actionAdmission = await fetch(`${consoleUrl}/api/action/deployments/from-source-link`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deployToken.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceFingerprint:
          "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Faction-smoke:.:appaloft.yml",
        projectId: project.id,
        environmentId: environment.id,
        resourceId: resource.id,
        serverId: server.id,
      }),
    });
    expect(actionAdmission.status).not.toBe(401);
    expect(actionAdmission.status).not.toBe(403);
    const actionAdmissionJson = await expectJsonResponse(actionAdmission, 202);
    expect(actionAdmissionJson).toMatchObject({
      id: expect.stringMatching(/^dep_/),
      deploymentHref: expect.stringMatching(/^\/deployments\/dep_/),
    });

    const consolePage = await waitForOk(consoleUrl, timeoutMs);
    expect(await consolePage.text()).toContain("Appaloft");
  } finally {
    await dockerComposeDown(home, projectName, dockerEnv);
    if (!configuredImage) {
      await run(["docker", "image", "rm", "-f", image], dockerEnv);
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (Bun.env.APPALOFT_INSTALL_FULL_SMOKE === "1") {
  test(fullInstallSmokeTestName, runFullInstallSmoke, fullInstallSmokeTestTimeoutMs);
} else {
  test.skip(fullInstallSmokeTestName, runFullInstallSmoke);
}
