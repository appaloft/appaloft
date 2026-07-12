import { mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

type CliResult = { exitCode: number; stdout: string; stderr: string };
type Proof = {
  verdict: "verified" | "partially-verified" | "unverified" | "stale" | "failed";
  deploymentId: string;
  resourceId: string;
  planned: { configuration: { fingerprint: string } };
  observed: {
    workload: { identity?: string; generation?: string };
    artifact: { resolvedIdentity?: string };
    health: { status: string };
    access: { status: string };
  };
  mismatches: Array<{ reasonCode: string }>;
};

async function reservePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("port unavailable"));
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
    server.on("error", reject);
  });
}

function run(args: string[], cwd = process.cwd()): CliResult {
  const result = Bun.spawnSync(args, { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function expectSuccess(result: CliResult, label: string): string {
  if (result.exitCode !== 0) throw new Error(`${label} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function json<T>(raw: string): T {
  const start = raw.indexOf("{");
  const nextDocument = raw.indexOf("\n{", start + 1);
  const end = nextDocument >= 0 ? raw.lastIndexOf("}", nextDocument) : raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`CLI did not return JSON: ${JSON.stringify(raw)}`);
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch (error) {
    throw new Error(`CLI JSON was invalid: ${JSON.stringify(raw)}`, { cause: error });
  }
}

async function waitFor(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      /* retry */
    }
    await Bun.sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main(): Promise<void> {
  const suffix = crypto.randomUUID().slice(0, 8);
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone smoke honors the host temp directory.
  const workspace = join(process.env.TMPDIR ?? "/tmp", `appaloft-deployment-proof-${suffix}`);
  const dataDir = join(workspace, "data");
  const pgliteDataDir = join(dataDir, "pglite");
  const controlPlanePort = await reservePort();
  const image = `appaloft-deployment-proof:${suffix}`;
  const fixture = resolve("scripts/smoke/fixtures/deployment-proof");
  mkdirSync(workspace, { recursive: true });
  const cliEnv = {
    ...process.env,
    OTEL_SDK_DISABLED: "true",
    APPALOFT_DATABASE_DRIVER: "pglite",
    APPALOFT_DATA_DIR: dataDir,
    APPALOFT_PGLITE_DATA_DIR: pgliteDataDir,
    APPALOFT_HTTP_HOST: "127.0.0.1",
    APPALOFT_HTTP_PORT: String(controlPlanePort),
    APPALOFT_APP_VERSION: "deployment-proof-smoke",
    APPALOFT_WEB_STATIC_DIR: "",
    APPALOFT_CONTROL_PLANE_MODE: "none",
  };
  const runCli = (args: string[]): CliResult => {
    const result = Bun.spawnSync([process.execPath, "run", "src/index.ts", ...args], {
      cwd: resolve("apps/shell"),
      env: cliEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };
  let serverProcess: Bun.Subprocess | undefined;
  let resourceId = "";

  try {
    expectSuccess(run(["docker", "build", "-t", image, fixture]), "build proof fixture image");
    serverProcess = Bun.spawn([process.execPath, "run", "src/index.ts", "serve"], {
      cwd: resolve("apps/shell"),
      env: cliEnv,
      stdout: "ignore",
      stderr: "ignore",
    });
    await waitFor(`http://127.0.0.1:${controlPlanePort}/api/health`);

    const projectId = json<{ id: string }>(
      expectSuccess(runCli(["project", "create", "--name", `Proof ${suffix}`]), "create project"),
    ).id;
    const serverId = json<{ id: string }>(
      expectSuccess(
        runCli([
          "server",
          "register",
          "--name",
          `proof-${suffix}`,
          "--host",
          "127.0.0.1",
          "--provider",
          "local-shell",
        ]),
        "register server",
      ),
    ).id;
    const environmentId = json<{ id: string }>(
      expectSuccess(
        runCli(["env", "create", "--project", projectId, "--name", "proof", "--kind", "local"]),
        "create environment",
      ),
    ).id;

    const firstDeploymentId = json<{ id: string }>(
      expectSuccess(
        runCli([
          "deploy",
          `docker://${image}`,
          "--project",
          projectId,
          "--server",
          serverId,
          "--environment",
          environmentId,
          "--method",
          "prebuilt-image",
          "--port",
          "3000",
          "--health-path",
          "/health",
        ]),
        "deploy v1",
      ),
    ).id;
    const firstDetail = json<{ deployment: { resourceId: string } }>(
      expectSuccess(runCli(["deployments", "show", firstDeploymentId]), "show v1"),
    );
    resourceId = firstDetail.deployment.resourceId;
    const firstProof = json<Proof>(
      expectSuccess(runCli(["deployments", "proof", firstDeploymentId]), "proof v1"),
    );
    if (firstProof.verdict !== "verified")
      throw new Error(`v1 proof was ${firstProof.verdict}: ${JSON.stringify(firstProof)}`);

    expectSuccess(
      runCli([
        "resource",
        "set-variable",
        "--kind",
        "plain-config",
        "--exposure",
        "runtime",
        resourceId,
        "APP_VERSION",
        "v2",
      ]),
      "set v2 configuration",
    );
    const secondDeploymentId = json<{ id: string }>(
      expectSuccess(
        runCli([
          "deployments",
          "redeploy",
          "--project",
          projectId,
          "--environment",
          environmentId,
          "--server",
          serverId,
          "--source-deployment",
          firstDeploymentId,
          resourceId,
        ]),
        "redeploy v2",
      ),
    ).id;
    const secondProof = json<Proof>(
      expectSuccess(runCli(["deployments", "proof", secondDeploymentId]), "proof v2"),
    );
    if (secondProof.verdict !== "verified")
      throw new Error(`v2 proof was ${secondProof.verdict}: ${JSON.stringify(secondProof)}`);
    if (secondProof.observed.workload.identity === firstProof.observed.workload.identity)
      throw new Error("workload identity did not change");
    if (
      secondProof.planned.configuration.fingerprint === firstProof.planned.configuration.fingerprint
    )
      throw new Error("configuration fingerprint did not change");

    const currentContainer = expectSuccess(
      run(["docker", "ps", "-q", "--filter", `label=appaloft.resource-id=${resourceId}`]),
      "find v2 container",
    )
      .trim()
      .split(/\s+/u)[0];
    if (!currentContainer) throw new Error("v2 container not found");
    expectSuccess(
      run(["docker", "rm", "-f", currentContainer]),
      "remove v2 container for negative smoke",
    );
    const negativeName = `appaloft-proof-negative-${suffix}`;
    expectSuccess(
      run([
        "docker",
        "run",
        "-d",
        "--name",
        negativeName,
        "-p",
        "127.0.0.1::3000",
        "-e",
        "APP_VERSION=v1",
        "--label",
        "appaloft.managed=true",
        "--label",
        `appaloft.resource-id=${resourceId}`,
        "--label",
        `appaloft.deployment-id=${firstDeploymentId}`,
        "--label",
        `appaloft.configuration-fingerprint=${firstProof.planned.configuration.fingerprint}`,
        image,
      ]),
      "start stale healthy workload",
    );
    const negativePort = expectSuccess(
      run(["docker", "port", negativeName, "3000/tcp"]),
      "read negative port",
    )
      .trim()
      .split(":")
      .at(-1);
    const negativeHealth = (await (
      await waitFor(`http://127.0.0.1:${negativePort}/health`)
    ).json()) as { status: string; version: string };
    if (negativeHealth.status !== "ok" || negativeHealth.version !== "v1")
      throw new Error("negative workload was not healthy v1");
    const staleProof = json<Proof>(
      expectSuccess(runCli(["deployments", "proof", secondDeploymentId]), "proof stale v2"),
    );
    if (staleProof.verdict !== "stale")
      throw new Error(`healthy old workload produced ${staleProof.verdict}`);
    if (!staleProof.mismatches.some((item) => item.reasonCode === "workload_generation_mismatch"))
      throw new Error("stale proof missed workload generation mismatch");

    console.log(
      JSON.stringify(
        {
          schemaVersion: "deployment-proof-smoke/v1",
          positive: {
            firstDeploymentId,
            secondDeploymentId,
            verdict: secondProof.verdict,
            workloadChanged: true,
            configurationFingerprintChanged: true,
            resolvedArtifactIdentity: secondProof.observed.artifact.resolvedIdentity,
            health: secondProof.observed.health.status,
            access: secondProof.observed.access.status,
          },
          negative: {
            healthStatus: negativeHealth.status,
            servedVersion: negativeHealth.version,
            proofVerdict: staleProof.verdict,
            mismatches: staleProof.mismatches.map((item) => item.reasonCode),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    serverProcess?.kill();
    await serverProcess?.exited;
    if (resourceId) {
      const ids = run([
        "docker",
        "ps",
        "-aq",
        "--filter",
        `label=appaloft.resource-id=${resourceId}`,
      ])
        .stdout.trim()
        .split(/\s+/u)
        .filter(Boolean);
      if (ids.length) run(["docker", "rm", "-f", ...ids]);
    }
    run(["docker", "image", "rm", "-f", image]);
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main();
