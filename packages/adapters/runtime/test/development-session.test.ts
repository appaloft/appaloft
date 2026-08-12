import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  developmentSessionDirectory,
  LocalDevelopmentSessionRuntime,
  loadDevelopmentEnvironment,
  parseDevelopmentCommandIntent,
} from "../src/development-session";

async function waitForSession(
  runtime: LocalDevelopmentSessionRuntime,
  sourceRoot: string,
  predicate: (value: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await runtime.status({ sourceRoot });
    if (status.isOk() && status.value && typeof status.value === "object") {
      const value = status.value as Record<string, unknown>;
      if (predicate(value)) return value;
    }
    await Bun.sleep(25);
  }
  throw new Error("Development Session did not reach the expected state");
}

function sourceSupervisorRuntime(input: {
  appaloftHome: string;
  stateRoot: string;
}): LocalDevelopmentSessionRuntime {
  return new LocalDevelopmentSessionRuntime({
    planResolver: async () => {
      throw new Error("not used");
    },
    supervisorEntrypoint: [
      process.execPath,
      fileURLToPath(new URL("../../../../apps/shell/src/index.ts", import.meta.url)),
    ],
    stateRoot: input.stateRoot,
    environment: { ...process.env, APPALOFT_HOME: input.appaloftHome },
    startupTimeoutMs: 20_000,
  });
}

describe("Local Development Session runtime", () => {
  test("[DEV-PLAN-003] parses portable argv and rejects shell operators before spawn", () => {
    expect(parseDevelopmentCommandIntent('bun run dev --port "4310"')).toEqual([
      "bun",
      "run",
      "dev",
      "--port",
      "4310",
    ]);
    expect(() => parseDevelopmentCommandIntent("bun run dev | tee output.log")).toThrow(
      "shell operators",
    );
  });

  test("[DEV-ENV-006] applies config, env-file, and CLI overlay precedence", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-env-"));
    writeFileSync(join(root, ".env.dev"), "A=file\nB=file\nQUOTED='hello world'\n");

    const environment = await loadDevelopmentEnvironment({
      sourceRoot: root,
      base: { A: "config", C: "config" },
      envFiles: [".env.dev"],
      overlay: { B: "cli" },
    });

    expect(environment).toEqual({
      A: "file",
      B: "cli",
      C: "config",
      QUOTED: "hello world",
    });
  });

  test("[DEV-CLEAN-011] derives exact stable state ownership outside the source tree", () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "appaloft-dev-state-"));
    const sourceRoot = join(stateRoot, "source");
    mkdirSync(sourceRoot);

    const first = developmentSessionDirectory(stateRoot, sourceRoot);
    const second = developmentSessionDirectory(stateRoot, `${sourceRoot}/.`);

    expect(first).toBe(second);
    expect(first.startsWith(sourceRoot)).toBe(false);
  });

  test("[DEV-START-005][DEV-STATE-006][DEV-LOG-007][DEV-HEALTH-008][DEV-GATEWAY-009][DEV-STOP-012] runs and cleans an owned detached graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-runtime-"));
    const sourceRoot = join(root, "source");
    const appaloftHome = join(root, "home");
    const stateRoot = join(appaloftHome, "development");
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(
      join(sourceRoot, "server.ts"),
      [
        "const port = Number(process.env.PORT);",
        "console.log(`ready:${process.env.APP_SECRET}`);",
        "Bun.serve({ hostname: '127.0.0.1', port, fetch(request) {",
        "  return new Response(new URL(request.url).pathname === '/health' ? 'ok' : 'app');",
        "} });",
      ].join("\n"),
    );
    const unrelated = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("unrelated"),
    });
    const reservation = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("reserved"),
    });
    const servicePort = reservation.port;
    reservation.stop(true);
    const runtime = sourceSupervisorRuntime({ appaloftHome, stateRoot });
    const plan = {
      sourceRoot,
      configFilePath: null,
      deploymentGraph: {},
      services: [
        {
          key: "app",
          commandIntent: `${process.execPath} server.ts`,
          commandArgs: [process.execPath, "server.ts"],
          watch: "none" as const,
          workingDirectory: sourceRoot,
          environment: { PORT: String(servicePort) },
          port: servicePort,
          healthPath: "/health",
        },
      ],
    };
    try {
      const started = await runtime.start({
        plan,
        detach: true,
        envFiles: [],
        environmentOverlay: { APP_SECRET: "top-secret-value" },
      });
      expect(started.isOk()).toBe(true);
      if (started.isErr()) return;
      const running = started.value as Record<string, unknown>;
      expect(running.state).toBe("running");
      expect((running.services as Array<Record<string, unknown>>)[0]?.readiness).toBe("ready");

      const resumed = await runtime.start({
        plan,
        detach: true,
        envFiles: [],
        environmentOverlay: { APP_SECRET: "top-secret-value" },
      });
      expect(resumed.isOk()).toBe(true);
      if (resumed.isOk()) expect((resumed.value as { resumed?: boolean }).resumed).toBe(true);

      const gatewayUrl = String(running.gatewayUrl);
      expect(
        await (
          await fetch(gatewayUrl, { headers: { host: `app.localhost:${new URL(gatewayUrl).port}` } })
        ).text(),
      ).toBe("app");
      const logs = await runtime.logs({ sourceRoot, follow: false, tail: 50 });
      expect(logs.isOk()).toBe(true);
      expect(JSON.stringify(logs)).toContain("[REDACTED]");
      expect(JSON.stringify(logs)).not.toContain("top-secret-value");
      expect((await runtime.status({ sourceRoot })).isOk()).toBe(true);

      const stopped = await runtime.stop({ sourceRoot });
      expect(stopped.isOk()).toBe(true);
      expect(await (await fetch(`http://127.0.0.1:${unrelated.port}`)).text()).toBe("unrelated");
      expect((await runtime.reset({ sourceRoot })).isOk()).toBe(true);
      expect(existsSync(developmentSessionDirectory(stateRoot, sourceRoot))).toBe(false);
    } finally {
      await runtime.stop({ sourceRoot });
      unrelated.stop(true);
    }
  }, 30_000);

  test("[DEV-START-004] foreground supervision stops gracefully on its owned signal", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-foreground-"));
    const sourceRoot = join(root, "source");
    const appaloftHome = join(root, "home");
    const stateRoot = join(appaloftHome, "development");
    mkdirSync(sourceRoot, { recursive: true });
    const runtime = sourceSupervisorRuntime({ appaloftHome, stateRoot });
    const started = runtime.start({
      plan: {
        sourceRoot,
        configFilePath: null,
        deploymentGraph: {},
        services: [
          {
            key: "app",
            commandIntent: `${process.execPath} -e foreground`,
            commandArgs: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
            watch: "none",
            workingDirectory: sourceRoot,
          },
        ],
      },
      detach: false,
      envFiles: [],
      environmentOverlay: {},
    });
    try {
      const running = await waitForSession(runtime, sourceRoot, (value) => value.state === "running");
      await Bun.sleep(75);
      process.kill(Number(running.supervisorPid), "SIGTERM");
      const stopped = await started;
      if (stopped.isErr()) throw new Error(JSON.stringify(stopped.error));
      expect(stopped.isOk()).toBe(true);
      if (stopped.isOk()) expect(stopped.value.state).toBe("stopped");
    } finally {
      await runtime.reset({ sourceRoot });
    }
  }, 30_000);

  test("[DEV-TLS-010] keeps generated TLS local and records trust only after explicit confirmation", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-tls-"));
    const sourceRoot = join(root, "source");
    const appaloftHome = join(root, "home");
    const stateRoot = join(appaloftHome, "development");
    mkdirSync(sourceRoot, { recursive: true });
    const runtime = sourceSupervisorRuntime({ appaloftHome, stateRoot });
    const plan = {
      sourceRoot,
      configFilePath: null,
      deploymentGraph: {},
      services: [
        {
          key: "app",
          commandIntent: `${process.execPath} -e tls`,
          commandArgs: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
          watch: "none" as const,
          workingDirectory: sourceRoot,
        },
      ],
    };
    expect(
      (
        await runtime.start({
          plan,
          detach: true,
          envFiles: [],
          environmentOverlay: {},
          trust: true,
        })
      ).isErr(),
    ).toBe(true);
    try {
      const started = await runtime.start({
        plan,
        detach: true,
        envFiles: [],
        environmentOverlay: {},
        https: true,
        trust: true,
      });
      expect(started.isOk()).toBe(true);
      if (started.isOk()) {
        const value = started.value as Record<string, unknown>;
        expect(value.trust).toBe("explicitly-confirmed");
        expect(existsSync(String(value.certificatePath))).toBe(true);
        expect(String(value.certificatePath).startsWith(stateRoot)).toBe(true);
      }
    } finally {
      await runtime.reset({ sourceRoot });
    }
  }, 30_000);

  test("[DEV-WATCH-011] restart watch replaces only the changed service process", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-dev-watch-"));
    const sourceRoot = join(root, "source");
    const appaloftHome = join(root, "home");
    const stateRoot = join(appaloftHome, "development");
    mkdirSync(sourceRoot, { recursive: true });
    const sourceFile = join(sourceRoot, "watch.ts");
    writeFileSync(sourceFile, "setInterval(() => {}, 1000);\n");
    const runtime = sourceSupervisorRuntime({ appaloftHome, stateRoot });
    try {
      const started = await runtime.start({
        plan: {
          sourceRoot,
          configFilePath: null,
          deploymentGraph: {},
          services: [
            {
              key: "app",
              commandIntent: `${process.execPath} watch.ts`,
              commandArgs: [process.execPath, "watch.ts"],
              watch: "restart",
              workingDirectory: sourceRoot,
            },
          ],
        },
        detach: true,
        envFiles: [],
        environmentOverlay: {},
      });
      expect(started.isOk()).toBe(true);
      if (started.isErr()) return;
      const initialPid = Number(
        ((started.value as Record<string, unknown>).services as Array<Record<string, unknown>>)[0]
          ?.pid,
      );
      writeFileSync(sourceFile, "setInterval(() => {}, 1000); // changed\n");
      const restarted = await waitForSession(runtime, sourceRoot, (value) => {
        const pid = Number((value.services as Array<Record<string, unknown>> | undefined)?.[0]?.pid);
        return Number.isInteger(pid) && pid !== initialPid;
      });
      expect(
        Number((restarted.services as Array<Record<string, unknown>>)[0]?.pid),
      ).not.toBe(initialPid);
    } finally {
      await runtime.reset({ sourceRoot });
    }
  }, 30_000);

  test("[DEV-ERROR-014] fails the session when one supervised service exits unexpectedly", async () => {
    const stateRoot = mkdtempSync(join(tmpdir(), "appaloft-dev-supervisor-state-"));
    const sourceRoot = mkdtempSync(join(tmpdir(), "appaloft-dev-supervisor-source-"));
    const stateDirectory = developmentSessionDirectory(stateRoot, sourceRoot);
    mkdirSync(stateDirectory, { recursive: true });
    writeFileSync(
      join(stateDirectory, "plan.json"),
      JSON.stringify({
        schemaVersion: "development-plan/v1",
        sessionId: "dev-crash",
        createdAt: "2026-08-12T00:00:00.000Z",
        https: false,
        trustConfirmed: false,
        environmentFingerprint: "test",
        plan: {
          sourceRoot,
          configFilePath: null,
          deploymentGraph: {},
          services: [
            {
              key: "crash",
              commandIntent: `${process.execPath} -e crash`,
              commandArgs: [process.execPath, "-e", "setTimeout(() => process.exit(7), 20)"],
              watch: "none",
              workingDirectory: sourceRoot,
            },
            {
              key: "peer",
              commandIntent: `${process.execPath} -e peer`,
              commandArgs: [process.execPath, "-e", "setTimeout(() => process.exit(0), 250)"],
              watch: "none",
              workingDirectory: sourceRoot,
            },
          ],
        },
      }),
    );
    const runtime = new LocalDevelopmentSessionRuntime({
      planResolver: async () => {
        throw new Error("not used");
      },
      supervisorEntrypoint: [process.execPath],
      stateRoot,
      environment: {},
    });

    const supervised = await runtime.supervise({ stateDirectory });

    expect(supervised.isErr()).toBe(true);
    if (supervised.isErr()) expect(supervised.error.code).toBe("development_process_failed");
  });
});
