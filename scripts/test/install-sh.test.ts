import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const installScript = join(root, "install.sh");

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

async function createFakeDocker(tempRoot: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = join(tempRoot, "bin");
  const logPath = join(tempRoot, "docker.log");
  const dockerPath = join(binDir, "docker");

  await mkdir(binDir, { recursive: true });
  await writeFile(
    dockerPath,
    `#!/usr/bin/env sh
printf '%s\\n' "$*" >> "$APPALOFT_FAKE_DOCKER_LOG"
case "$1" in
  version | info)
    exit 0
    ;;
  compose)
    exit 0
    ;;
esac
exit 0
`,
  );
  await chmod(dockerPath, 0o755);

  return { binDir, logPath };
}

test("install.sh is valid sh syntax", async () => {
  const result = await run(["sh", "-n", installScript]);

  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
});

test("install.sh dry-run reports the selected Docker stack", async () => {
  const home = join(tmpdir(), "appaloft-install-test-home");
  const result = await run(["sh", installScript, "--dry-run", "--version", "0.2.1"], {
    APPALOFT_HOME: home,
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Appaloft Docker install dry run");
  expect(result.stdout).toContain("version: 0.2.1");
  expect(result.stdout).toContain("image: ghcr.io/appaloft/appaloft:0.2.1");
  expect(result.stdout).toContain(`home: ${home}`);
  expect(result.stdout).toContain(`compose file: ${join(home, "docker-compose.yml")}`);
  expect(result.stdout).toContain("bind: 0.0.0.0:3001");
  expect(result.stdout).toContain("database: postgres");
  expect(result.stdout).toContain("install docker: yes");
});

test("install.sh dry-run accepts an existing full image ref and skipped Docker bootstrap", async () => {
  const result = await run(
    [
      "sh",
      installScript,
      "--dry-run",
      "--image",
      "registry.example.test/appaloft/appaloft:edge",
      "--skip-docker-install",
      "--port",
      "3900",
    ],
    {
      APPALOFT_HOME: join(tmpdir(), "appaloft-install-test-home"),
    },
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("image: registry.example.test/appaloft/appaloft:edge");
  expect(result.stdout).toContain("bind: 0.0.0.0:3900");
  expect(result.stdout).toContain("install docker: no");
});

test("install.sh writes a Compose self-host stack and starts it with Docker", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-install-test-"));

  try {
    const { binDir, logPath } = await createFakeDocker(tempRoot);
    const home = join(tempRoot, "appaloft");

    const install = await run(
      [
        "sh",
        installScript,
        "--version",
        "9.8.7",
        "--home",
        home,
        "--port",
        "3900",
        "--web-origin",
        "https://appaloft.example.test",
        "--postgres-password",
        "fixture-password",
      ],
      {
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Installing Appaloft Docker stack");
    expect(install.stdout).toContain("Image: ghcr.io/appaloft/appaloft:9.8.7");
    expect(install.stdout).toContain("HTTP: https://appaloft.example.test");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("image: $" + "{APPALOFT_IMAGE_REF}");
    expect(compose).toContain("postgres-data:/var/lib/postgresql/data");
    expect(compose).toContain('"$' + "{APPALOFT_HTTP_HOST}:$" + '{APPALOFT_HTTP_PORT}:3001"');
    expect(compose).not.toContain("build:");

    const env = await Bun.file(join(home, ".env")).text();
    expect(env).toContain("APPALOFT_IMAGE_REF=ghcr.io/appaloft/appaloft:9.8.7");
    expect(env).toContain("APPALOFT_HTTP_PORT=3900");
    expect(env).toContain("APPALOFT_WEB_ORIGIN=https://appaloft.example.test");
    expect(env).toContain("POSTGRES_PASSWORD=fixture-password");

    const dockerLog = await Bun.file(logPath).text();
    expect(dockerLog).toContain("compose --env-file");
    expect(dockerLog).toContain(`-f ${join(home, "docker-compose.yml")} pull`);
    expect(dockerLog).toContain(`-f ${join(home, "docker-compose.yml")} up -d`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install.sh writes a PGlite self-host stack with durable app data", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-install-test-"));

  try {
    const { binDir, logPath } = await createFakeDocker(tempRoot);
    const home = join(tempRoot, "appaloft");

    const install = await run(
      [
        "sh",
        installScript,
        "--version",
        "9.8.7",
        "--home",
        home,
        "--database",
        "pglite",
        "--web-origin",
        "https://console.appaloft.example.test",
      ],
      {
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Database: pglite");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("APPALOFT_DATABASE_DRIVER: pglite");
    expect(compose).toContain("APPALOFT_DATA_DIR: /appaloft-data");
    expect(compose).toContain("APPALOFT_PGLITE_DATA_DIR: /appaloft-data/pglite");
    expect(compose).toContain("appaloft-data:/appaloft-data");
    expect(compose).not.toContain("APPALOFT_DATABASE_URL");
    expect(compose).not.toContain("postgres:");

    const env = await Bun.file(join(home, ".env")).text();
    expect(env).toContain("APPALOFT_SELF_HOST_DATABASE=pglite");
    expect(env).not.toContain("POSTGRES_PASSWORD");

    const dockerLog = await Bun.file(logPath).text();
    expect(dockerLog).toContain(`-f ${join(home, "docker-compose.yml")} up -d`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install.sh preserves an existing PostgreSQL password on reinstall", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-install-test-"));

  try {
    const { binDir, logPath } = await createFakeDocker(tempRoot);
    const home = join(tempRoot, "appaloft");

    await mkdir(home, { recursive: true });
    await writeFile(join(home, ".env"), "POSTGRES_PASSWORD=existing-password\n");

    const install = await run(["sh", installScript, "--version", "9.8.7", "--home", home], {
      APPALOFT_FAKE_DOCKER_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH}`,
    });

    expect(install.exitCode).toBe(0);
    const env = await Bun.file(join(home, ".env")).text();
    expect(env).toContain("POSTGRES_PASSWORD=existing-password");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
