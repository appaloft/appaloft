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
  const curlPath = join(binDir, "curl");

  await mkdir(binDir, { recursive: true });
  await writeFile(
    dockerPath,
    `#!/usr/bin/env sh
printf '%s\\n' "$*" >> "$APPALOFT_FAKE_DOCKER_LOG"
case "$1" in
  version)
    exit 0
    ;;
  info)
    if [ "$2" = "--format" ]; then
      case "$3" in
        *LocalNodeState*) printf 'active\\n' ;;
        *ControlAvailable*) printf 'true\\n' ;;
      esac
    fi
    exit 0
    ;;
  compose)
    case "$*" in
      *" ps -q app"*) printf 'appaloft-app-1\\n' ;;
    esac
    exit 0
    ;;
  inspect)
    if [ "$1" = "inspect" ] && [ "$2" = "--format" ]; then
      case "$3" in
        *State.Health*) printf '%s\\n' "\${APPALOFT_FAKE_DOCKER_APP_HEALTH_STATUS:-healthy}" ;;
        *State.Status*) printf '%s\\n' "\${APPALOFT_FAKE_DOCKER_APP_STATUS:-running}" ;;
        *State.ExitCode*) printf '%s\\n' "\${APPALOFT_FAKE_DOCKER_APP_EXIT_CODE:-0}" ;;
      esac
      exit 0
    fi
    exit 0
    ;;
  network)
    if [ "$2" = "inspect" ]; then
      if [ "$APPALOFT_FAKE_DOCKER_EDGE_NETWORK_EXISTS" = "1" ]; then
        case "$4" in
          *com.docker.compose.network*) printf '%s\\n' "$APPALOFT_FAKE_DOCKER_EDGE_NETWORK_LABEL" ;;
          *com.docker.compose.project*) printf '%s\\n' "$APPALOFT_FAKE_DOCKER_EDGE_PROJECT_LABEL" ;;
        esac
        exit 0
      fi
      exit 1
    fi
    exit 0
    ;;
  container)
    if [ "$2" = "inspect" ]; then
      container_name="$3"
      format=""
      if [ "$3" = "--format" ]; then
        format="$4"
        container_name="$5"
      fi
      if [ "$container_name" = "appaloft-traefik" ] && [ "$APPALOFT_FAKE_DOCKER_TRAEFIK_CONTAINER_EXISTS" = "1" ]; then
        case "$format" in
          *com.docker.compose.service*) printf '%s\\n' "$APPALOFT_FAKE_DOCKER_TRAEFIK_SERVICE_LABEL" ;;
          *com.docker.compose.project*) printf '%s\\n' "$APPALOFT_FAKE_DOCKER_TRAEFIK_PROJECT_LABEL" ;;
        esac
        exit 0
      fi
      exit 1
    fi
    exit 0
    ;;
  service)
    if [ "$2" = "ls" ]; then
      printf '%s\\n' "\${APPALOFT_FAKE_DOCKER_SERVICE_REPLICAS:-1/1}"
      exit 0
    fi
    exit 0
    ;;
  stack | swarm)
    exit 0
    ;;
esac
exit 0
`,
  );
  await chmod(dockerPath, 0o755);
  await writeFile(
    curlPath,
    `#!/usr/bin/env sh
exit 0
`,
  );
  await chmod(curlPath, 0o755);

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
  expect(result.stdout).toContain("orchestrator: compose");
  expect(result.stdout).toContain("compose project: appaloft");
  expect(result.stdout).toContain("bind: 0.0.0.0:3721");
  expect(result.stdout).toContain("web origin: http://localhost:3721");
  expect(result.stdout).toContain("proxy: traefik");
  expect(result.stdout).toContain("database: postgres");
  expect(result.stdout).toContain("install docker: yes");
});

test("install.sh dry-run reports a selected Docker Swarm stack", async () => {
  const home = join(tmpdir(), "appaloft-install-test-home");
  const result = await run(
    [
      "sh",
      installScript,
      "--dry-run",
      "--orchestrator",
      "swarm",
      "--stack-name",
      "appaloft-console",
      "--swarm-init",
    ],
    {
      APPALOFT_HOME: home,
    },
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("orchestrator: swarm");
  expect(result.stdout).toContain("swarm stack: appaloft-console");
  expect(result.stdout).toContain("swarm init: yes");
});

test("install.sh rejects unknown Docker orchestrators", async () => {
  const result = await run(["sh", installScript, "--dry-run", "--orchestrator", "kubernetes"], {
    APPALOFT_HOME: join(tmpdir(), "appaloft-install-test-home"),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("--orchestrator must be compose or swarm");
});

test("install.sh rejects unsafe console domains", async () => {
  const result = await run(["sh", installScript, "--dry-run", "--domain", "https://"], {
    APPALOFT_HOME: join(tmpdir(), "appaloft-install-test-home"),
  });

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("--domain must be a hostname");
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
    expect(install.stdout).toContain("==> Installing Appaloft Docker stack");
    expect(install.stdout).toContain("Image: ghcr.io/appaloft/appaloft:9.8.7");
    expect(install.stdout).toContain("HTTP: https://appaloft.example.test");
    expect(install.stdout).toContain("==> Appaloft install completed");
    expect(install.stdout).toContain("PPPP   PPPP");
    expect(install.stdout).toContain("Open console: https://appaloft.example.test");
    expect(install.stdout).toContain("Watch logs:");
    expect(install.stdout).toContain("Update/repair:");

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

test("install.sh can force colored progress and success output", async () => {
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
        "--web-origin",
        "https://appaloft.example.test",
        "--postgres-password",
        "fixture-password",
      ],
      {
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        APPALOFT_FORCE_COLOR: "1",
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("\u001b[36m==>\u001b[0m");
    expect(install.stdout).toContain("\u001b[32m\n      _       PPPP   PPPP");
    expect(install.stdout).toContain("\u001b[1mOpen console:\u001b[0m");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install.sh configures Traefik console domain bootstrap when a domain is supplied", async () => {
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
        "--domain",
        "https://console.appaloft.example.test/setup",
        "--postgres-password",
        "fixture-password",
      ],
      {
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("HTTP: https://console.appaloft.example.test");
    expect(install.stdout).toContain("Console domain: console.appaloft.example.test");
    expect(install.stdout).toContain("Proxy: traefik");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("container_name: appaloft-traefik");
    expect(compose).toContain("--providers.docker.network=$" + "{APPALOFT_EDGE_NETWORK_NAME}");
    expect(compose).not.toContain("--providers.swarm=true");
    expect(compose).toContain("traefik.http.routers.appaloft-console.rule");
    expect(compose).toContain("Host(`$" + "{APPALOFT_CONSOLE_DOMAIN}`)");
    expect(compose).toContain("traefik.http.routers.appaloft-console.tls.certresolver: appaloft");
    expect(compose).toContain("traefik.http.services.appaloft-console.loadbalancer.server.port");
    expect(compose).toContain("traefik-acme:");
    expect(compose).toContain("appaloft-edge:");

    const env = await Bun.file(join(home, ".env")).text();
    expect(env).toContain("APPALOFT_HTTP_PORT=3721");
    expect(env).toContain("APPALOFT_WEB_ORIGIN=https://console.appaloft.example.test");
    expect(env).toContain("APPALOFT_CONSOLE_DOMAIN=console.appaloft.example.test");
    expect(env).toContain("APPALOFT_SELF_HOST_PROXY=traefik");
    expect(env).toContain("APPALOFT_EDGE_NETWORK_NAME=appaloft-edge");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install.sh reuses an unmanaged existing Compose edge network", async () => {
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
        "--domain",
        "console.appaloft.example.test",
        "--postgres-password",
        "fixture-password",
      ],
      {
        APPALOFT_FAKE_DOCKER_EDGE_NETWORK_EXISTS: "1",
        APPALOFT_FAKE_DOCKER_EDGE_NETWORK_LABEL: "",
        APPALOFT_FAKE_DOCKER_EDGE_PROJECT_LABEL: "",
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Using existing Docker network appaloft-edge as external");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("appaloft-edge:");
    expect(compose).toContain("external: true");

    const dockerLog = await Bun.file(logPath).text();
    expect(dockerLog).toContain("network inspect --format");
    expect(dockerLog).toContain(`-f ${join(home, "docker-compose.yml")} up -d`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("install.sh reuses an unmanaged existing Compose Traefik container", async () => {
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
        "--domain",
        "console.appaloft.example.test",
        "--postgres-password",
        "fixture-password",
      ],
      {
        APPALOFT_FAKE_DOCKER_EDGE_NETWORK_EXISTS: "1",
        APPALOFT_FAKE_DOCKER_EDGE_NETWORK_LABEL: "",
        APPALOFT_FAKE_DOCKER_EDGE_PROJECT_LABEL: "",
        APPALOFT_FAKE_DOCKER_TRAEFIK_CONTAINER_EXISTS: "1",
        APPALOFT_FAKE_DOCKER_TRAEFIK_SERVICE_LABEL: "",
        APPALOFT_FAKE_DOCKER_TRAEFIK_PROJECT_LABEL: "",
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Using existing Docker network appaloft-edge as external");
    expect(install.stdout).toContain("Using existing appaloft-traefik container as external proxy");
    expect(install.stdout).toContain("Traefik: existing appaloft-traefik container");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("traefik.http.routers.appaloft-console.rule");
    expect(compose).toContain("external: true");
    expect(compose).not.toContain("container_name: appaloft-traefik");
    expect(compose).not.toContain("traefik-acme:");

    const dockerLog = await Bun.file(logPath).text();
    expect(dockerLog).toContain("container inspect appaloft-traefik");
    expect(dockerLog).toContain("container inspect --format");
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

test("install.sh writes a Docker Swarm PGlite stack and deploys it", async () => {
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
        "--orchestrator",
        "swarm",
        "--stack-name",
        "appaloft-console",
        "--web-origin",
        "https://console.appaloft.example.test",
      ],
      {
        APPALOFT_FAKE_DOCKER_LOG: logPath,
        PATH: `${binDir}:${process.env.PATH}`,
      },
    );

    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Orchestrator: swarm");
    expect(install.stdout).toContain("Watch logs:    docker service logs -f appaloft-console_app");

    const compose = await Bun.file(join(home, "docker-compose.yml")).text();
    expect(compose).toContain("APPALOFT_DATABASE_DRIVER: pglite");
    expect(compose).toContain("node.role == manager");
    expect(compose).toContain("--providers.swarm.network=$" + "{APPALOFT_EDGE_NETWORK_NAME}");
    expect(compose).not.toContain("--providers.docker=true");

    const env = await Bun.file(join(home, ".env")).text();
    expect(env).toContain("APPALOFT_SELF_HOST_ORCHESTRATOR=swarm");
    expect(env).toContain("APPALOFT_SWARM_STACK_NAME=appaloft-console");

    const dockerLog = await Bun.file(logPath).text();
    expect(dockerLog).toContain("info --format {{.Swarm.LocalNodeState}}");
    expect(dockerLog).toContain("info --format {{.Swarm.ControlAvailable}}");
    expect(dockerLog).toContain(
      `stack deploy -c ${join(home, "docker-compose.yml")} appaloft-console`,
    );
    expect(dockerLog).not.toContain("compose --env-file");
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
