import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneProfile,
  createRemoteCliProgram,
  defaultPublicCloudControlPlaneUrl,
  findControlPlaneOperation,
  loginControlPlane,
  MemoryCliControlPlaneProfileStore,
  resolveCliExecutionTarget,
  runStandaloneControlPlaneCli,
  useControlPlaneProfile,
} from "../src";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function captureOutput() {
  let stdout = "";
  let stderr = "";

  return {
    stdout: {
      write: (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      },
    },
    read: () => ({ stderr, stdout }),
  };
}

async function captureProcessOutput<T>(callback: () => Promise<T>): Promise<{
  readonly result: T;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExitCode = process.exitCode;
  let stdout = "";
  let stderr = "";

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const result = await callback();
    return { result, stderr, stdout };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = originalExitCode ?? 0;
  }
}

function profile(name: string, baseUrl = "http://127.0.0.1:4310"): CliControlPlaneProfile {
  return {
    name,
    mode: "self-hosted",
    baseUrl,
    auth: {
      kind: "bearer",
      token: "tok_remote_secret_1234",
    },
    createdAt: "2026-05-17T00:00:00.000Z",
    updatedAt: "2026-05-17T00:00:00.000Z",
    lastHandshake: {
      checkedAt: "2026-05-17T00:00:00.000Z",
      apiVersion: "v1",
      version: "0.12.5-test",
    },
  };
}

function activeStore(profileName = "local") {
  const active = profile(profileName);
  return new MemoryCliControlPlaneProfileStore({
    activeProfile: active.name,
    profiles: {
      [active.name]: active,
    },
  });
}

function createControlPlaneFetch(
  requests: Request[],
  overrides?: Partial<Record<string, Response>>,
): AppaloftSdkFetch {
  return async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    const override = overrides?.[url.pathname];
    if (override) {
      return override;
    }

    if (url.pathname === "/api/version") {
      return jsonResponse({
        name: "Appaloft",
        version: "0.12.5-test",
        apiVersion: "v1",
        mode: "self-hosted",
      });
    }

    if (url.pathname === "/api/organizations/current-context") {
      return jsonResponse({
        currentOrganization: {
          organizationId: "org_self_hosted",
          name: "Self Hosted",
          slug: "self-hosted",
          role: "owner",
        },
      });
    }

    if (url.pathname === "/api/projects") {
      return jsonResponse({
        items: [
          {
            id: "prj_remote",
            name: "Remote Project",
            slug: "remote-project",
            lifecycleStatus: "active",
            createdAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      });
    }

    if (url.pathname === "/api/projects/prj_remote") {
      return jsonResponse({
        id: "prj_remote",
        name: "Remote Project",
        slug: "remote-project",
        lifecycleStatus: "active",
        createdAt: "2026-05-17T00:00:00.000Z",
      });
    }

    if (url.pathname === "/api/projects/prj_remote/rename") {
      return jsonResponse({
        id: "prj_remote",
      });
    }

    if (url.pathname === "/api/blueprints") {
      return jsonResponse({
        items: [
          {
            id: "pocketbase",
            name: "PocketBase",
            version: "0.22.0",
            summary: "Portable PocketBase Blueprint",
            sourcePath: "official:pocketbase",
            tags: ["backend"],
            variants: [],
          },
        ],
      });
    }

    if (url.pathname === "/api/blueprints/pocketbase") {
      return jsonResponse({
        entry: {
          id: "pocketbase",
          name: "PocketBase",
          version: "0.22.0",
          summary: "Portable PocketBase Blueprint",
          sourcePath: "official:pocketbase",
          tags: ["backend"],
          variants: [],
        },
        manifest: {
          schemaVersion: "appaloft.blueprint/v1",
          id: "pocketbase",
          name: "PocketBase",
          version: "0.22.0",
        },
      });
    }

    if (url.pathname === "/api/blueprints/pocketbase/install-plan") {
      return jsonResponse({
        entry: {
          id: "pocketbase",
          name: "PocketBase",
          version: "0.22.0",
          summary: "Portable PocketBase Blueprint",
          sourcePath: "official:pocketbase",
          tags: ["backend"],
          variants: [],
        },
        plan: {
          schemaVersion: "appaloft.blueprint.install-plan/v1",
          createsExternalResources: false,
          blueprint: {
            id: "pocketbase",
            name: "PocketBase",
            version: "0.22.0",
          },
          profile: "production",
          target: {
            projectName: "PocketBase",
            environmentName: "production",
            resourceSlugPrefix: "pocketbase",
          },
          operations: [],
          warnings: [],
        },
        applicationBundle: {
          schemaVersion: "appaloft.blueprint.application-bundle-plan/v1",
          createsExternalResources: false,
          application: {
            blueprintId: "pocketbase",
            blueprintName: "PocketBase",
            blueprintVersion: "0.22.0",
            projectName: "PocketBase",
            environmentName: "production",
            profile: "production",
          },
          components: [],
          dependencies: [],
          relationships: [],
          execution: {
            mode: "dry-run-only",
            requiredFollowUp: "accepted-install-command",
          },
          warnings: [],
        },
      });
    }

    if (url.pathname === "/api/blueprints/pocketbase/install") {
      return jsonResponse(
        {
          schemaVersion: "appaloft.blueprint.install-result/v1",
          duplicate: false,
          executionStatus: "ready",
          installedApplication: {
            applicationId: "app_pocketbase_remote",
            status: "ready",
          },
        },
        202,
      );
    }

    if (url.pathname === "/api/blueprints/installations/app_pocketbase_remote") {
      return jsonResponse({
        applicationId: "app_pocketbase_remote",
        marketplaceSlug: "pocketbase",
        status: "ready",
        components: [
          {
            componentId: "app",
            resource: {
              resourceId: "res_pocketbase_remote",
            },
            deployment: {
              deploymentId: "dep_pocketbase_remote",
            },
            endpoints: [
              {
                url: "https://pocketbase.example.test",
              },
            ],
          },
        ],
      });
    }

    if (url.pathname === "/api/system/doctor") {
      return jsonResponse({
        readiness: {
          status: "ready",
          checks: {
            database: true,
            migrations: true,
          },
          details: {
            databaseDriver: "postgres",
            databaseMode: "external",
          },
        },
        providers: [],
        plugins: [],
        maintenanceWorkers: [
          {
            key: "durable-worker-runtime",
            label: "Durable worker runtime",
            enabled: false,
            activation: "disabled-by-config",
            safetyMode: "durable-process-delivery",
            intervalSeconds: 0,
            runtimeTopology: {
              mode: "disabled",
              queueBackend: "database",
              workerCount: 0,
              workerGroup: "cloud-web",
              workerIds: [],
              coordinationRole: "disabled",
            },
            observedRuntimeHeartbeats: [
              {
                workerGroup: "cloud-worker",
                workerCount: 4,
                workerIds: [
                  "cloud-worker-replica-a",
                  "cloud-worker-replica-b",
                  "cloud-worker-replica-c",
                  "cloud-worker-replica-d",
                ],
                heartbeat: {
                  staleAfterSeconds: 15,
                  onlineWorkerCount: 4,
                  staleWorkerCount: 0,
                  lastSeenAt: "2026-05-17T00:00:00.000Z",
                  workers: [
                    {
                      workerId: "cloud-worker-replica-a",
                      workerGroup: "cloud-worker",
                      slot: 1,
                      status: "online",
                      online: true,
                      lastSeenAt: "2026-05-17T00:00:00.000Z",
                    },
                    {
                      workerId: "cloud-worker-replica-b",
                      workerGroup: "cloud-worker",
                      slot: 2,
                      status: "online",
                      online: true,
                      lastSeenAt: "2026-05-17T00:00:00.000Z",
                    },
                    {
                      workerId: "cloud-worker-replica-c",
                      workerGroup: "cloud-worker",
                      slot: 3,
                      status: "online",
                      online: true,
                      lastSeenAt: "2026-05-17T00:00:00.000Z",
                    },
                    {
                      workerId: "cloud-worker-replica-d",
                      workerGroup: "cloud-worker",
                      slot: 4,
                      status: "online",
                      online: true,
                      lastSeenAt: "2026-05-17T00:00:00.000Z",
                    },
                  ],
                },
              },
            ],
            configurationKeys: [
              "APPALOFT_WORKER_RUNTIME_MODE",
              "APPALOFT_WORKER_QUEUE_BACKEND",
              "APPALOFT_WORKER_COUNT",
              "APPALOFT_WORKER_GROUP",
              "APPALOFT_WORKER_OBSERVED_GROUPS",
            ],
            operationKeys: ["deployments.create", "operator-work.*"],
          },
        ],
      });
    }

    if (url.pathname === "/api/static-artifacts/publish-payload") {
      return jsonResponse(
        {
          publicationId: "pub_static_remote",
          artifactId: "artifact_remote",
          projectId: "project_docs",
          resourceId: "res_docs",
          url: "https://static.example.test/project_docs/res_docs/",
          manifestDigest: "d".repeat(64),
          fileCount: 1,
          totalBytes: 18,
          publishedAt: "2026-05-17T00:00:00.000Z",
          provider: "fake-static",
          promotedAlias: true,
        },
        201,
      );
    }

    if (url.pathname === "/api/servers") {
      return jsonResponse({
        items: [
          {
            id: "srv_remote",
            name: "Remote Server",
            providerKey: "ssh",
            lifecycleStatus: "active",
            createdAt: "2026-05-17T00:00:00.000Z",
          },
        ],
      });
    }

    if (url.pathname === "/api/servers/srv_remote/connectivity-tests") {
      return jsonResponse({
        status: "reachable",
        checks: [],
        testedAt: "2026-05-17T00:00:00.000Z",
      });
    }

    return jsonResponse(
      {
        code: "not_found",
        category: "user",
        message: "not found",
        retryable: false,
      },
      404,
    );
  };
}

type CliAuthPollStatus = "pending" | "authorized" | "denied" | "expired";

function createCliAuthExchangeFetch(
  requests: Request[],
  input: {
    readonly auth?:
      | { readonly kind: "bearer"; readonly token: string }
      | { readonly kind: "product-session"; readonly cookie: string };
    readonly exchangeStatus?: number;
    readonly overrides?: Partial<Record<string, Response>>;
    readonly sessionStatus?: number;
    readonly statuses?: CliAuthPollStatus[];
  } = {},
): AppaloftSdkFetch {
  const statuses = [...(input.statuses ?? ["authorized"])];
  const baseFetch = createControlPlaneFetch(requests, input.overrides);

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/cli-auth/sessions") {
      const verificationUri = `${url.origin}/cli-auth/authorize`;
      requests.push(request);
      return (
        input.overrides?.["/api/cli-auth/sessions"] ??
        jsonResponse(
          {
            deviceCode: "dev_cli_fixture",
            expiresIn: 600,
            interval: 0,
            userCode: "ABCD-EFGH",
            verificationUri,
            verificationUriComplete: `${verificationUri}?user_code=ABCD-EFGH`,
          },
          input.sessionStatus ?? 201,
        )
      );
    }

    if (url.pathname === "/api/cli-auth/sessions/dev_cli_fixture") {
      requests.push(request);
      return (
        input.overrides?.["/api/cli-auth/sessions/dev_cli_fixture"] ??
        jsonResponse({ status: statuses.shift() ?? "authorized", interval: 0 })
      );
    }

    if (url.pathname === "/api/cli-auth/sessions/dev_cli_fixture/exchange") {
      requests.push(request);
      return (
        input.overrides?.["/api/cli-auth/sessions/dev_cli_fixture/exchange"] ??
        jsonResponse(
          {
            auth: input.auth ?? {
              kind: "bearer",
              token: "tok_exchanged_secret_5678",
            },
          },
          input.exchangeStatus ?? 200,
        )
      );
    }

    if (url.pathname === "/api/cli-auth/sessions/dev_cli_fixture/cancel") {
      requests.push(request);
      return (
        input.overrides?.["/api/cli-auth/sessions/dev_cli_fixture/cancel"] ??
        jsonResponse({ canceled: true })
      );
    }

    return baseFetch(request);
  };
}

describe("CLI remote control-plane client", () => {
  test("[CONTROL-PLANE-CLI-010] catalog-backed remote operations default to product-session auth", () => {
    expect(findControlPlaneOperation("environments.create")._unsafeUnwrap()).toMatchObject({
      operationKey: "environments.create",
      authPolicy: "product-session",
    });
    expect(findControlPlaneOperation("source-events.ingest")._unsafeUnwrap()).toMatchObject({
      operationKey: "source-events.ingest",
      authPolicy: "webhook-signature",
    });
  });

  test("[CONTROL-PLANE-CLI-012] root help and version do not initialize the local runtime", async () => {
    const helpOutput = captureOutput();
    const versionOutput = captureOutput();

    const help = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "--help"],
      stderr: helpOutput.stderr,
      stdout: helpOutput.stdout,
    });
    const version = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "--version"],
      env: {
        APPALOFT_APP_VERSION: "1.2.3-test",
      },
      stderr: versionOutput.stderr,
      stdout: versionOutput.stdout,
    });

    expect(help).toEqual({ handled: true, exitCode: 0 });
    expect(version).toEqual({ handled: true, exitCode: 0 });
    expect(helpOutput.read()).toMatchObject({
      stdout: expect.stringContaining("Usage:"),
      stderr: "",
    });
    expect(versionOutput.read()).toMatchObject({
      stdout: "1.2.3-test\n",
      stderr: "",
    });
  });

  test("[CONTROL-PLANE-CLI-012] env credential login without --url defaults to the Appaloft Cloud profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "login", "--no-browser"],
      env: {
        APPALOFT_TOKEN: "tok_cloud_secret_1234",
      },
      fetch: createControlPlaneFetch(requests, {
        "/api/version": jsonResponse({
          name: "Appaloft Cloud",
          version: "0.12.5-test",
          apiVersion: "v1",
          mode: "cloud",
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(stored._unsafeUnwrap().activeProfile).toBe("cloud");
    expect(stored._unsafeUnwrap().profiles.cloud).toMatchObject({
      mode: "cloud",
      baseUrl: defaultPublicCloudControlPlaneUrl,
    });
    expect(requests.map((request) => new URL(request.url).origin)).toEqual([
      defaultPublicCloudControlPlaneUrl,
      defaultPublicCloudControlPlaneUrl,
    ]);
    expect(rendered.stdout).toContain(defaultPublicCloudControlPlaneUrl);
    expect(rendered.stdout).toContain("***1234");
    expect(rendered.stdout).not.toContain("tok_cloud_secret_1234");
    expect(rendered.stderr).toBe("");
  });

  test("[CONTROL-PLANE-CLI-012] browser auth exchange prints URL and code then writes the Cloud profile after exchange and current-context verification", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "login", "--no-browser"],
      env: {},
      fetch: createCliAuthExchangeFetch(requests, {
        statuses: ["pending", "authorized"],
      }),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(stored._unsafeUnwrap().activeProfile).toBe("cloud");
    expect(stored._unsafeUnwrap().profiles.cloud).toMatchObject({
      mode: "cloud",
      baseUrl: defaultPublicCloudControlPlaneUrl,
      auth: {
        kind: "bearer",
        token: "tok_exchanged_secret_5678",
      },
      currentOrganization: {
        organizationId: "org_self_hosted",
      },
    });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "POST /api/cli-auth/sessions",
        "GET /api/cli-auth/sessions/dev_cli_fixture",
        "GET /api/cli-auth/sessions/dev_cli_fixture",
        "POST /api/cli-auth/sessions/dev_cli_fixture/exchange",
        "GET /api/version",
        "GET /api/organizations/current-context",
      ],
    );
    expect(requests[5]?.headers.get("authorization")).toBe("Bearer tok_exchanged_secret_5678");
    expect(rendered.stdout).toContain(
      "https://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
    );
    expect(rendered.stdout).toContain("ABCD-EFGH");
    expect(rendered.stdout).toContain("***5678");
    expect(rendered.stdout).not.toContain("tok_exchanged_secret_5678");
    expect(rendered.stderr).toContain(
      "https://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
    );
  });

  test("[CONTROL-PLANE-CLI-012] browser open failure falls back to printed verification URL", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      {},
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests),
        now: () => "2026-05-17T00:00:00.000Z",
        openBrowser: () => Promise.reject(new Error("open failed")),
        store,
      },
    );

    const stored = await store.read();

    expect(result._unsafeUnwrap()).toMatchObject({
      name: "cloud",
      auth: {
        redacted: "***5678",
      },
    });
    expect(stored._unsafeUnwrap().activeProfile).toBe("cloud");
  });

  test("[CONTROL-PLANE-CLI-012] browser open disabled prints the verification URL without launching a browser", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      { openBrowser: false },
      {
        env: {},
        fetch: createCliAuthExchangeFetch([]),
        now: () => "2026-05-17T00:00:00.000Z",
        openBrowser: () => {
          throw new Error("browser should not open");
        },
        store,
      },
    );

    expect(result._unsafeUnwrap()).toMatchObject({
      login: {
        openedBrowser: false,
        openBrowserFailed: false,
        userCode: "ABCD-EFGH",
        verificationUriComplete: "https://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
      },
    });
    expect((await store.read())._unsafeUnwrap().activeProfile).toBe("cloud");
  });

  test("[CONTROL-PLANE-CLI-012] default browser auth waits for enter before opening the browser", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();
    const events: string[] = [];

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "login"],
      confirmOpenBrowser: (session) => {
        events.push(`confirm:${session.userCode}`);
        const rendered = output.read();
        expect(rendered.stderr).toContain("Press Enter to open the Appaloft CLI login page");
        expect(rendered.stderr).toContain("confirm that the page shows the same code");
        expect(rendered.stderr).toContain("Code: \u001b[1mABCD-EFGH\u001b[22m");
        return true;
      },
      env: {},
      fetch: createCliAuthExchangeFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
      openBrowser: (url) => {
        events.push(`open:${url}`);
        return true;
      },
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(events).toEqual([
      "confirm:ABCD-EFGH",
      "open:https://app.appaloft.com/cli-auth/authorize?user_code=ABCD-EFGH",
    ]);
    expect((await store.read())._unsafeUnwrap().activeProfile).toBe("cloud");
  });

  test("[CONTROL-PLANE-CLI-013] denied browser auth exchange writes no profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();

    const result = await loginControlPlane(
      { openBrowser: false },
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests, { statuses: ["denied"] }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );
    const stored = await store.read();

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_denied",
      details: {
        phase: "control-plane-auth",
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["POST /api/cli-auth/sessions", "GET /api/cli-auth/sessions/dev_cli_fixture"],
    );
  });

  test("[CONTROL-PLANE-CLI-013] expired browser auth exchange writes no profile", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      { openBrowser: false },
      {
        env: {},
        fetch: createCliAuthExchangeFetch([], { statuses: ["expired"] }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_expired",
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-013] timeout browser auth exchange writes no profile", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    let clock = 0;
    const result = await loginControlPlane(
      {
        openBrowser: false,
        pollTimeoutMs: 1,
      },
      {
        env: {},
        fetch: createCliAuthExchangeFetch([], { statuses: ["pending", "pending", "pending"] }),
        monotonicNow: () => clock,
        now: () => "2026-05-17T00:00:00.000Z",
        sleep: async () => {
          clock += 2;
        },
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_timeout",
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-013] interrupted browser auth exchange cancels and writes no profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      {
        openBrowser: false,
        signal: AbortSignal.abort(),
      },
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests, { statuses: ["pending"] }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_interrupted",
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["POST /api/cli-auth/sessions", "POST /api/cli-auth/sessions/dev_cli_fixture/cancel"],
    );
  });

  test("[CONTROL-PLANE-CLI-013] interrupted polling sleep cancels and writes no profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const abortController = new AbortController();
    const result = await loginControlPlane(
      {
        openBrowser: false,
        signal: abortController.signal,
      },
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests, { statuses: ["pending"] }),
        now: () => "2026-05-17T00:00:00.000Z",
        sleep: async () => {
          abortController.abort();
        },
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_interrupted",
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "POST /api/cli-auth/sessions",
        "GET /api/cli-auth/sessions/dev_cli_fixture",
        "POST /api/cli-auth/sessions/dev_cli_fixture/cancel",
      ],
    );
  });

  test("[CONTROL-PLANE-CLI-013] exchange failure writes no profile and does not leak raw material", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      { openBrowser: false },
      {
        env: {},
        fetch: createCliAuthExchangeFetch([], {
          exchangeStatus: 500,
          overrides: {
            "/api/cli-auth/sessions/dev_cli_fixture/exchange": jsonResponse(
              {
                code: "control_plane_auth_exchange_failed",
                category: "infra",
                message: "exchange failed",
                retryable: true,
                details: {
                  rawToken: "tok_should_not_render",
                },
              },
              500,
            ),
          },
        }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_exchange_failed",
      details: {
        phase: "control-plane-auth",
      },
    });
    expect(JSON.stringify(result._unsafeUnwrapErr())).not.toContain("tok_should_not_render");
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-013] current-context verification failure after exchange writes no profile", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      { openBrowser: false },
      {
        env: {},
        fetch: createCliAuthExchangeFetch([], {
          overrides: {
            "/api/organizations/current-context": jsonResponse(
              {
                code: "product_auth_invalid",
                category: "user",
                message: "invalid session",
                retryable: false,
              },
              401,
            ),
          },
        }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_invalid",
      details: {
        phase: "control-plane-auth",
      },
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-012] self-hosted explicit URL uses the same browser auth exchange contract", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      {
        url: "http://127.0.0.1:4310",
        openBrowser: false,
      },
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrap()).toMatchObject({
      name: "127-0-0-1-4310",
      mode: "self-hosted",
      baseUrl: "http://127.0.0.1:4310",
      auth: {
        redacted: "***5678",
      },
    });
    expect(requests.map((request) => new URL(request.url).origin)).toEqual([
      "http://127.0.0.1:4310",
      "http://127.0.0.1:4310",
      "http://127.0.0.1:4310",
      "http://127.0.0.1:4310",
      "http://127.0.0.1:4310",
    ]);
    expect((await store.read())._unsafeUnwrap().activeProfile).toBe("127-0-0-1-4310");
  });

  test("[CONTROL-PLANE-CLI-014] self-hosted login returns structured unsupported when CLI auth exchange is unavailable", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await loginControlPlane(
      {
        url: "http://127.0.0.1:4310",
        openBrowser: false,
      },
      {
        env: {},
        fetch: createCliAuthExchangeFetch(requests, {
          overrides: {
            "/api/cli-auth/sessions": jsonResponse(
              {
                code: "not_found",
                category: "user",
                message: "not found",
                retryable: false,
              },
              404,
            ),
          },
        }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_auth_unsupported",
      details: {
        phase: "control-plane-auth",
      },
    });
    expect((await store.read())._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-001][CONTROL-PLANE-CLI-012] explicit self-hosted login still requires a URL", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "login", "--mode", "self-hosted", "--no-browser"],
      env: {
        APPALOFT_TOKEN: "tok_self_hosted_secret_1234",
      },
      fetch: createControlPlaneFetch([]),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 1 });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
    expect(rendered.stderr).toContain("Self-hosted control-plane login requires --url");
    expect(rendered.stderr).toContain("validation_error");
    expect(rendered.stdout).toBe("");
  });

  test("[CONTROL-PLANE-CLI-012] default Cloud URL cannot be logged in as self-hosted", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: [
        "node",
        "appaloft",
        "login",
        "--mode",
        "self-hosted",
        "--url",
        defaultPublicCloudControlPlaneUrl,
        "--no-browser",
      ],
      env: {
        APPALOFT_TOKEN: "tok_self_hosted_secret_1234",
      },
      fetch: createControlPlaneFetch([]),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 1 });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
    expect(rendered.stderr).toContain("The default Appaloft Cloud endpoint requires cloud mode");
    expect(rendered.stderr).toContain("validation_error");
    expect(rendered.stdout).toBe("");
  });

  test("[CONTROL-PLANE-CLI-001][CONTROL-PLANE-CLI-004][CONTROL-PLANE-CLI-009] auth login writes an active redacted self-hosted profile after handshake", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();
    const output = captureOutput();

    const result = await runStandaloneControlPlaneCli({
      argv: [
        "node",
        "appaloft",
        "auth",
        "login",
        "--url",
        "http://127.0.0.1:4310",
        "--profile",
        "local",
      ],
      env: {
        APPALOFT_TOKEN: "tok_remote_secret_1234",
      },
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
      store,
      stderr: output.stderr,
      stdout: output.stdout,
    });

    const stored = await store.read();
    const rendered = output.read();

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(stored.isOk()).toBe(true);
    expect(stored._unsafeUnwrap().activeProfile).toBe("local");
    expect(stored._unsafeUnwrap().profiles.local?.baseUrl).toBe("http://127.0.0.1:4310");
    expect(stored._unsafeUnwrap().profiles.local?.currentOrganization).toMatchObject({
      organizationId: "org_self_hosted",
      slug: "self-hosted",
    });
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/version",
      "/api/organizations/current-context",
    ]);
    expect(requests[1]?.headers.get("authorization")).toBe("Bearer tok_remote_secret_1234");
    expect(rendered.stdout).toContain("***1234");
    expect(rendered.stdout).not.toContain("tok_remote_secret_1234");
    expect(rendered.stderr).toBe("");
  });

  test("[CONTROL-PLANE-CLI-002] failed login does not write a profile", async () => {
    const requests: Request[] = [];
    const store = new MemoryCliControlPlaneProfileStore();

    const result = await loginControlPlane(
      {
        url: "http://127.0.0.1:4310",
        profile: "local",
      },
      {
        env: {
          APPALOFT_TOKEN: "tok_remote_secret_1234",
        },
        fetch: createControlPlaneFetch(requests, {
          "/api/organizations/current-context": jsonResponse(
            {
              code: "product_auth_missing",
              category: "user",
              message: "login required",
              retryable: false,
            },
            401,
          ),
        }),
        now: () => "2026-05-17T00:00:00.000Z",
        store,
      },
    );
    const stored = await store.read();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_missing",
      details: {
        phase: "control-plane-auth",
        status: 401,
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-003][CONTROL-PLANE-CLI-005] logout removes credentials and context use switches the active profile locally", async () => {
    const local = profile("local");
    const staging = profile("staging", "http://staging.example.test");
    const store = new MemoryCliControlPlaneProfileStore({
      activeProfile: local.name,
      profiles: {
        [local.name]: local,
        [staging.name]: staging,
      },
    });

    const switched = await useControlPlaneProfile("staging", { store });
    const logoutOutput = captureOutput();
    const loggedOut = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "logout", "--profile", "staging"],
      store,
      stderr: logoutOutput.stderr,
      stdout: logoutOutput.stdout,
    });
    const stored = await store.read();

    expect(switched._unsafeUnwrap()).toMatchObject({
      name: "staging",
      active: true,
    });
    expect(loggedOut).toEqual({ handled: true, exitCode: 0 });
    expect(stored._unsafeUnwrap().activeProfile).toBe("local");
    expect(stored._unsafeUnwrap().profiles.staging).toBeUndefined();
    expect(logoutOutput.read().stdout).not.toContain("tok_remote_secret_1234");
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] project list/show dispatch through the generated SDK route when a remote profile is active", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const listed = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "project", "list"]),
    );
    const shown = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "project", "show", "prj_remote"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/projects",
        "GET /api/projects/prj_remote",
      ],
    );
    expect(requests.at(-1)?.headers.get("user-agent")).toBe("appaloft-cli");
    expect(listed.stdout).toContain("prj_remote");
    expect(shown.stdout).toContain("Remote Project");
  });

  test("[CONTROL-PLANE-CLI-006][SYSTEM-DIAG-004] doctor dispatches through the selected control plane", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "doctor"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/version", "GET /api/organizations/current-context", "GET /api/system/doctor"],
    );
    expect(output.stdout).toContain('"databaseDriver": "postgres"');
    expect(output.stdout).toContain('"workerGroup": "cloud-worker"');
    expect(output.stdout).toContain('"onlineWorkerCount": 4');
    expect(output.stdout).not.toContain("appaloft-worker-1");
  });

  test("[CONTROL-PLANE-CLI-007][CONTROL-PLANE-MODE-003] no trusted remote source preserves the local CLI path", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "project", "list"],
      store: new MemoryCliControlPlaneProfileStore(),
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "local",
      diagnostics: {
        effectiveMode: "none",
      },
    });
  });

  test("[CONTROL-PLANE-CLI-006][BP-CATALOG-API-001] blueprint catalog commands dispatch through public generated SDK routes", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const listed = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "blueprint", "list"]),
    );
    const shown = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "blueprint", "show", "pocketbase"]),
    );
    const planned = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "blueprint",
        "plan-install",
        "pocketbase",
        "--project-name",
        "PocketBase Smoke",
        "--environment-name",
        "production",
      ]),
    );
    const installed = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "blueprint",
        "install",
        "pocketbase",
        "--project-name",
        "PocketBase Smoke",
        "--environment-name",
        "production",
        "--idempotency-key",
        "install:pocketbase:remote-smoke",
        "--acknowledgement",
        "accepts-blueprint-application-bundle",
      ]),
    );
    const installation = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "blueprint",
        "installation",
        "show",
        "app_pocketbase_remote",
      ]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/blueprints",
        "GET /api/blueprints/pocketbase",
        "POST /api/blueprints/pocketbase/install-plan",
        "POST /api/blueprints/pocketbase/install",
        "GET /api/blueprints/installations/app_pocketbase_remote",
      ],
    );
    expect(await requests[4]?.json()).toMatchObject({
      slug: "pocketbase",
      target: {
        projectName: "PocketBase Smoke",
        environmentName: "production",
      },
    });
    expect(await requests[5]?.json()).toMatchObject({
      slug: "pocketbase",
      target: {
        projectName: "PocketBase Smoke",
        environmentName: "production",
      },
      idempotencyKey: "install:pocketbase:remote-smoke",
      acknowledgements: ["accepts-blueprint-application-bundle"],
    });
    expect(listed.stdout).toContain("PocketBase");
    expect(shown.stdout).toContain("Portable PocketBase Blueprint");
    expect(planned.stdout).toContain("appaloft.blueprint.install-plan/v1");
    expect(installed.stdout).toContain("app_pocketbase_remote");
    expect(installation.stdout).toContain("https://pocketbase.example.test");
    expect(installation.stdout).toContain("dep_pocketbase_remote");
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] project mutations dispatch through the generated SDK route when remote-capable", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "project",
        "rename",
        "prj_remote",
        "--name",
        "Renamed",
      ]),
    );

    expect(requests.map((entry) => `${entry.method} ${new URL(entry.url).pathname}`)).toEqual([
      "GET /api/version",
      "GET /api/organizations/current-context",
      "POST /api/projects/prj_remote/rename",
    ]);
    expect(await requests[2]?.json()).toMatchObject({
      projectId: "prj_remote",
      name: "Renamed",
    });
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] generated SDK dispatch covers non-project operations", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const listed = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "server", "list"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/version", "GET /api/organizations/current-context", "GET /api/servers"],
    );
    const listSearch = new URL(requests[2]?.url ?? "http://localhost").searchParams;
    expect(listSearch.get("offset")).toBe("0");
    expect(listSearch.get("runtimeAvailability")).toBe("all");
    expect(listed.stdout).toContain("srv_remote");
  });

  test("[CONTROL-PLANE-CLI-013] remote bounded deployment events adapt the SDK response for CLI rendering", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/deployments/dep_remote/events": jsonResponse({
          deploymentId: "dep_remote",
          envelopes: [
            {
              schemaVersion: "deployments.stream-events/v1",
              kind: "closed",
              reason: "terminal-status",
              cursor: "dep_remote:1",
            },
          ],
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "deployments",
        "events",
        "dep_remote",
        "--include-history",
        "--until-terminal",
        "--json",
      ]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/deployments/dep_remote/events",
      ],
    );
    expect(output.stdout).toContain("dep_remote");
    expect(output.stdout).toContain("terminal-status");
  });

  test("[CONTROL-PLANE-CLI-014] remote bounded runtime logs adapt the SDK response for CLI rendering", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/resources/res_remote/runtime-logs": jsonResponse({
          resourceId: "res_remote",
          deploymentId: "dep_remote",
          logs: [
            {
              timestamp: "2026-05-17T00:00:00.000Z",
              stream: "stdout",
              message: "runtime log line",
            },
          ],
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "resource", "logs", "res_remote"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/resources/res_remote/runtime-logs",
      ],
    );
    expect(output.stdout).toContain("runtime log line");
  });

  test("[OP-WORK-CLI-016] remote bounded work events adapt the SDK response for CLI rendering", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/operator-work/wrk_remote/events": jsonResponse({
          workId: "wrk_remote",
          envelopes: [
            {
              schemaVersion: "operator-work.stream-events/v1",
              kind: "closed",
              reason: "completed",
              cursor: "wrk_remote:1",
            },
          ],
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "work",
        "events",
        "wrk_remote",
        "--include-history",
        "true",
        "--until-terminal",
        "true",
        "--follow",
        "false",
      ]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "GET /api/operator-work/wrk_remote/events",
      ],
    );
    expect(output.stdout).toContain("wrk_remote");
    expect(output.stdout).toContain("completed");
  });

  test("[CONTROL-PLANE-CLI-015] remote GET diagnostics keep boolean query parameters explicit", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/resources/res_remote/proxy-configuration": jsonResponse({
          schemaVersion: "proxy-configuration/v1",
          resourceId: "res_remote",
          routeScope: "latest",
          routes: [],
          diagnostics: [],
        }),
        "/api/runtime-usage/inspect": jsonResponse({
          schemaVersion: "runtime-usage.inspect/v1",
          scope: { kind: "server", serverId: "srv_remote" },
          totals: {},
          byServer: [],
          byProject: [],
          byEnvironment: [],
          byResource: [],
          byDeployment: [],
          artifacts: [],
          warnings: [],
          sourceErrors: [],
          generatedAt: "2026-05-17T00:00:00.000Z",
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "proxy-config",
        "--diagnostics",
        "res_remote",
      ]),
    );
    await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "runtime-usage", "inspect", "server:srv_remote"]),
    );

    const proxyUrl = new URL(requests[2]?.url ?? "http://localhost");
    const usageUrl = new URL(requests[3]?.url ?? "http://localhost");
    expect(proxyUrl.pathname).toBe("/api/resources/res_remote/proxy-configuration");
    expect(proxyUrl.searchParams.get("includeDiagnostics")).toBe("true");
    expect(usageUrl.pathname).toBe("/api/runtime-usage/inspect");
    expect(usageUrl.searchParams.get("scope.kind")).toBe("server");
    expect(usageUrl.searchParams.get("scope.serverId")).toBe("srv_remote");
    expect(usageUrl.searchParams.get("includeArtifacts")).toBe("true");
    expect(usageUrl.searchParams.get("includeWarnings")).toBe("true");
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] server test dispatches to the persisted server endpoint", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const tested = await captureProcessOutput(() =>
      program.parseAsync(["node", "appaloft", "server", "test", "srv_remote"]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "POST /api/servers/srv_remote/connectivity-tests",
      ],
    );
    expect(await requests[2]?.json()).toMatchObject({ serverId: "srv_remote" });
    expect(tested.stdout).toContain("reachable");
  });

  test("[CONTROL-PLANE-CLI-006][CONTROL-PLANE-CLI-010] server runtime prepare dispatches through the generated SDK route", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/servers/srv_remote/runtime/prepare": jsonResponse({
          serverId: "srv_remote",
          status: "ready",
          preparedAt: "2026-05-17T00:00:00.000Z",
          steps: [
            {
              phase: "docker",
              status: "succeeded",
              message: "Docker is already available",
              durationMs: 0,
            },
          ],
        }),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const prepared = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "server",
        "runtime",
        "prepare",
        "srv_remote",
        "--mode",
        "repair",
      ]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "POST /api/servers/srv_remote/runtime/prepare",
      ],
    );
    expect(await requests[2]?.json()).toMatchObject({
      serverId: "srv_remote",
      mode: "repair",
    });
    expect(prepared.stdout).toContain("srv_remote");
  });

  test("[STATIC-ARTIFACT-EXT-018][CONTROL-PLANE-CLI-010] static artifact publish uploads local dist files through the remote payload route", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "appaloft-static-artifact-remote-"));
    const dist = join(workspace, "dist");
    await mkdir(join(dist, "assets"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<main>Remote</main>");
    await writeFile(join(dist, "assets", "app.js"), "console.log('remote');");

    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "static-artifacts",
        "publish",
        dist,
        "--project",
        "project_docs",
        "--resource",
        "res_docs",
        "--promote-alias",
      ]),
    );

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      [
        "GET /api/version",
        "GET /api/organizations/current-context",
        "POST /api/static-artifacts/publish-payload",
      ],
    );
    expect(await requests[2]?.json()).toMatchObject({
      projectId: "project_docs",
      resourceId: "res_docs",
      promoteAlias: true,
      files: [
        {
          path: "assets/app.js",
          mimeType: "text/javascript",
          contentBase64: Buffer.from("console.log('remote');").toString("base64"),
        },
        {
          path: "index.html",
          mimeType: "text/html",
          contentBase64: Buffer.from("<main>Remote</main>").toString("base64"),
        },
      ],
    });
    expect(output.stdout).toContain("https://static.example.test/project_docs/res_docs/");
  });

  test("[CONTROL-PLANE-CLI-011] remote dispatch errors do not fall back to local execution", async () => {
    const requests: Request[] = [];
    const program = createRemoteCliProgram({
      version: "0.12.5-test",
      profile: profile("local"),
      fetch: createControlPlaneFetch(requests, {
        "/api/projects": jsonResponse(
          {
            code: "product_auth_missing",
            category: "user",
            message: "login required",
            retryable: false,
          },
          401,
        ),
      }),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    const output = await captureProcessOutput(async () => {
      await expect(
        program.parseAsync(["node", "appaloft", "project", "list"]),
      ).rejects.toBeDefined();
    });

    expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(
      ["GET /api/version", "GET /api/organizations/current-context", "GET /api/projects"],
    );
    expect(output.stderr).toContain("product_auth_missing");
    expect(output.stderr).toContain("remote-operation-dispatch");
  });

  test("[CONTROL-PLANE-MODE-002][CONTROL-PLANE-MODE-005] explicit none and config none preserve pure local mode even with an active profile", async () => {
    const configHome = await mkdtemp(join(tmpdir(), "appaloft-control-plane-config-"));
    await writeFile(
      join(configHome, "appaloft.yml"),
      ["controlPlane:", "  mode: none", ""].join("\n"),
    );

    const store = activeStore();
    const fromFlag = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "none", "project", "list"],
      cwd: configHome,
      store,
    });
    const fromConfig = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "project", "list"],
      cwd: configHome,
      store,
    });

    expect(fromFlag._unsafeUnwrap()).toMatchObject({
      kind: "local",
      argv: ["node", "appaloft", "project", "list"],
      diagnostics: {
        source: "cli",
        requestedMode: "none",
        effectiveMode: "none",
      },
    });
    expect(fromConfig._unsafeUnwrap()).toMatchObject({
      kind: "local",
      diagnostics: {
        source: "config",
        requestedMode: "none",
        effectiveMode: "none",
      },
    });
  });

  test("[CONTROL-PLANE-MODE-004] env self-hosted URL and token select an ephemeral remote target without profile write", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "server", "list"],
      env: {
        APPALOFT_CONTROL_PLANE_MODE: "self-hosted",
        APPALOFT_CONTROL_PLANE_URL: "http://127.0.0.1:4310",
        APPALOFT_TOKEN: "tok_remote_secret_1234",
      },
      store,
      now: () => "2026-05-17T00:00:00.000Z",
    });
    const stored = await store.read();

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "remote",
      profile: {
        baseUrl: "http://127.0.0.1:4310",
        auth: {
          kind: "bearer",
          token: "tok_remote_secret_1234",
        },
      },
      diagnostics: {
        source: "env",
        requestedMode: "self-hosted",
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[OP-WORK-CLI-014] work commands dispatch to the selected remote control plane", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "work", "show", "dw_blueprint_install_cia_demo"],
      store: activeStore(),
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "remote",
      argv: ["node", "appaloft", "work", "show", "dw_blueprint_install_cia_demo"],
      diagnostics: {
        source: "profile",
        command: "work",
        effectiveMode: "self-hosted",
      },
      profile: {
        name: "local",
        mode: "self-hosted",
        baseUrl: "http://127.0.0.1:4310",
      },
    });
  });

  test("[SYSTEM-DIAG-004] doctor command resolves to the selected remote control plane", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "doctor"],
      store: activeStore(),
    });

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "remote",
      argv: ["node", "appaloft", "doctor"],
      diagnostics: {
        source: "profile",
        command: "doctor",
        effectiveMode: "self-hosted",
      },
      profile: {
        name: "local",
        mode: "self-hosted",
        baseUrl: "http://127.0.0.1:4310",
      },
    });
  });

  test("[CONTROL-PLANE-CLI-012] default Cloud URL cannot be dispatched as self-hosted", async () => {
    const result = await resolveCliExecutionTarget({
      argv: [
        "node",
        "appaloft",
        "--control-plane-mode",
        "self-hosted",
        "--control-plane-url",
        defaultPublicCloudControlPlaneUrl,
        "server",
        "list",
      ],
      env: {
        APPALOFT_TOKEN: "tok_self_hosted_secret_1234",
      },
      store: new MemoryCliControlPlaneProfileStore(),
      now: () => "2026-05-17T00:00:00.000Z",
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "control-plane-resolution",
        requestedMode: "self-hosted",
      },
      message: "The default Appaloft Cloud endpoint requires cloud mode",
    });
  });

  test("[CONTROL-PLANE-MODE-010][CONTROL-PLANE-CLI-012] explicit cloud mode uses the default Appaloft Cloud endpoint when no profile exists", async () => {
    const store = new MemoryCliControlPlaneProfileStore();
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "cloud", "server", "list"],
      env: {
        APPALOFT_AUTH_COOKIE: "better-auth.session_token=cloud-session",
      },
      store,
      now: () => "2026-05-17T00:00:00.000Z",
    });
    const stored = await store.read();

    expect(result._unsafeUnwrap()).toMatchObject({
      kind: "remote",
      profile: {
        name: "cloud",
        mode: "cloud",
        baseUrl: defaultPublicCloudControlPlaneUrl,
        auth: {
          kind: "product-session",
          cookie: "better-auth.session_token=cloud-session",
        },
      },
      diagnostics: {
        source: "cli",
        requestedMode: "cloud",
        effectiveMode: "cloud",
      },
    });
    expect(stored._unsafeUnwrap()).toEqual({ profiles: {} });
  });

  test("[CONTROL-PLANE-CLI-008] explicit remote mode for local-only deploy fails before local mutation", async () => {
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "self-hosted", "deploy", "."],
      store: activeStore(),
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_unsupported",
      details: {
        phase: "control-plane-resolution",
        command: "deploy",
      },
    });
  });

  test("[CONTROL-PLANE-CLI-008] explicit remote mode for terminal attach local gateway fails before local mutation", async () => {
    const result = await resolveCliExecutionTarget({
      argv: [
        "node",
        "appaloft",
        "--control-plane-mode",
        "self-hosted",
        "server",
        "terminal",
        "srv_1",
      ],
      store: activeStore(),
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_unsupported",
      details: {
        phase: "control-plane-resolution",
        command: "server terminal",
      },
    });
  });

  test("[CONTROL-PLANE-MODE-004] explicit remote mode must match the selected profile mode", async () => {
    const store = activeStore();
    const result = await resolveCliExecutionTarget({
      argv: ["node", "appaloft", "--control-plane-mode", "cloud", "project", "list"],
      store,
    });

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "control-plane-resolution",
        profile: "local",
        profileMode: "self-hosted",
        requestedMode: "cloud",
      },
    });
  });
});
