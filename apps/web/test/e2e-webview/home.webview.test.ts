/// <reference types="bun-types" />

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

type ApiScenario = "dashboard" | "github-connected";

const apiResponses: Record<ApiScenario, Record<string, unknown>> = {
  dashboard: {
    "/api/health": {
      status: "ok",
      service: "yundu",
      version: "0.1.0-test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    "/api/readiness": {
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
      },
    },
    "/api/version": {
      name: "Yundu",
      version: "0.1.0-test",
      apiVersion: "v1",
      mode: "self-hosted",
    },
    "/api/auth/session": {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: null,
      providers: [
        {
          key: "github",
          title: "GitHub",
          configured: false,
          connected: false,
          requiresSignIn: true,
          deferred: true,
          reason: "Configure GitHub OAuth to enable import.",
        },
      ],
    },
    "/api/rpc/projects/list": {
      json: {
        items: [
          {
            id: "prj_demo",
            name: "Demo",
            slug: "demo",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/servers/list": {
      json: {
        items: [
          {
            id: "srv_demo",
            name: "edge",
            host: "127.0.0.1",
            port: 22,
            providerKey: "generic-ssh",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/environments/list": {
      json: {
        items: [
          {
            id: "env_demo",
            projectId: "prj_demo",
            name: "production",
            kind: "production",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [
              {
                key: "DATABASE_URL",
                value: "****",
                scope: "environment",
                exposure: "runtime",
                isSecret: true,
                kind: "secret",
              },
            ],
          },
        ],
      },
    },
    "/api/rpc/resources/list": {
      json: {
        items: [
          {
            id: "res_demo",
            projectId: "prj_demo",
            environmentId: "env_demo",
            destinationId: "dst_demo",
            name: "workspace",
            slug: "workspace",
            kind: "application",
            services: [
              {
                name: "web",
                kind: "web",
              },
            ],
            deploymentCount: 1,
            lastDeploymentId: "dep_demo",
            lastDeploymentStatus: "succeeded",
            networkProfile: {
              internalPort: 3000,
              upstreamProtocol: "http",
              exposureMode: "reverse-proxy",
            },
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/domain-bindings/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/deployments/list": {
      json: {
        items: [
          {
            id: "dep_demo",
            projectId: "prj_demo",
            environmentId: "env_demo",
            resourceId: "res_demo",
            serverId: "srv_demo",
            destinationId: "dst_demo",
            status: "succeeded",
            runtimePlan: {
              id: "plan_demo",
              source: {
                kind: "local-folder",
                locator: ".",
                displayName: "workspace",
              },
              buildStrategy: "dockerfile",
              packagingMode: "all-in-one-docker",
              execution: {
                kind: "docker-container",
                image: "demo:test",
                port: 3000,
              },
              target: {
                kind: "single-server",
                providerKey: "generic-ssh",
                serverIds: ["srv_demo"],
              },
              detectSummary: "mocked in bun webview",
              steps: ["package", "deploy", "verify"],
              generatedAt: "2026-01-01T00:00:00.000Z",
            },
            environmentSnapshot: {
              id: "snap_demo",
              environmentId: "env_demo",
              createdAt: "2026-01-01T00:00:00.000Z",
              precedence: [
                "defaults",
                "system",
                "organization",
                "project",
                "environment",
                "deployment",
              ],
              variables: [],
            },
            logs: [],
            logCount: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
    "/api/rpc/providers/list": {
      json: {
        items: [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target",
            capabilities: ["ssh", "single-server"],
          },
        ],
      },
    },
  },
  "github-connected": {
    "/api/health": {
      status: "ok",
      service: "yundu",
      version: "0.1.0-test",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    "/api/readiness": {
      status: "ready",
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
      },
    },
    "/api/version": {
      name: "Yundu",
      version: "0.1.0-test",
      apiVersion: "v1",
      mode: "self-hosted",
    },
    "/api/auth/session": {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session: {
        user: {
          name: "octocat",
          email: "octocat@example.com",
        },
      },
      providers: [
        {
          key: "github",
          title: "GitHub",
          configured: true,
          connected: true,
          requiresSignIn: true,
          deferred: true,
          connectPath: "/api/auth/sign-in/social",
        },
      ],
    },
    "/api/rpc/projects/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/servers/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/environments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/deployments/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/resources/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/domain-bindings/list": {
      json: {
        items: [],
      },
    },
    "/api/rpc/providers/list": {
      json: {
        items: [
          {
            key: "generic-ssh",
            title: "Generic SSH",
            category: "deploy-target",
            capabilities: ["ssh", "single-server"],
          },
        ],
      },
    },
    "/api/rpc/integrations/github/repositories/list": {
      json: {
        items: [
          {
            id: "repo_platform",
            name: "platform",
            fullName: "acme/platform",
            ownerLogin: "acme",
            description: "Primary deployment control plane",
            defaultBranch: "main",
            htmlUrl: "https://github.com/acme/platform",
            cloneUrl: "https://github.com/acme/platform.git",
            private: true,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    },
  },
};

let activeScenario: ApiScenario = "dashboard";
let apiServer: ReturnType<typeof Bun.serve> | null = null;
let previewProcess: ReturnType<typeof Bun.spawn> | null = null;
let previewUrl = "";
let previewLogs = "";

function respondJson(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      ...init?.headers,
    },
  });
}

async function readProcessStream(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) {
    return;
  }

  for await (const chunk of stream) {
    previewLogs += new TextDecoder().decode(chunk);
  }
}

function toReadableStream(stream: unknown): ReadableStream<Uint8Array> | null {
  if (stream instanceof ReadableStream) {
    return stream as ReadableStream<Uint8Array>;
  }

  return null;
}

async function waitForPreview(url: string): Promise<void> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await Bun.sleep(100);
    }
  }

  throw new Error(`Vite preview did not start at ${url}\n${previewLogs}`);
}

function reservePort(): number {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("reserved"),
  });
  const { port } = server;
  server.stop(true);

  if (port === undefined) {
    throw new Error("Could not reserve a free preview port.");
  }

  return port;
}

async function setupWebApp(): Promise<void> {
  apiServer = Bun.serve({
    port: 0,
    fetch(request) {
      if (request.method === "OPTIONS") {
        return respondJson(null);
      }

      const { pathname } = new URL(request.url);
      const response = apiResponses[activeScenario][pathname];

      if (response === undefined) {
        return respondJson({ error: `Unhandled test API route: ${pathname}` }, { status: 404 });
      }

      return respondJson(response);
    },
  });

  const previewPort = reservePort();
  previewUrl = `http://127.0.0.1:${previewPort}`;
  previewProcess = Bun.spawn({
    cmd: [
      "bun",
      "run",
      "preview",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(previewPort),
      "--strictPort",
    ],
    cwd: import.meta.dir.replace(/\/test\/e2e-webview$/, ""),
    env: {
      ...process.env,
      YUNDU_WEB_DEV_PROXY_TARGET: `http://127.0.0.1:${apiServer.port}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  void readProcessStream(toReadableStream(previewProcess.stdout));
  void readProcessStream(toReadableStream(previewProcess.stderr));

  await waitForPreview(previewUrl);
}

async function teardownWebApp(): Promise<void> {
  previewProcess?.kill();
  await previewProcess?.exited.catch(() => {});
  previewProcess = null;

  apiServer?.stop(true);
  apiServer = null;

  Bun.WebView.closeAll();
}

function createWebView(): Bun.WebView {
  return new Bun.WebView({
    width: 1280,
    height: 900,
    ...(process.platform === "darwin" ? {} : { backend: "chrome" as const }),
    console: (type, ...args) => {
      if (type === "error") {
        previewLogs += `\n[page console.error] ${args.map(String).join(" ")}`;
      }
    },
  });
}

async function waitFor<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean,
  failureMessage: string,
): Promise<T> {
  const deadline = Date.now() + 7_000;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await read();
    if (matches(lastValue)) {
      return lastValue;
    }
    await Bun.sleep(100);
  }

  throw new Error(`${failureMessage}\nLast value: ${String(lastValue)}\n${previewLogs}`);
}

async function pageText(view: Bun.WebView): Promise<string> {
  return view.evaluate<string>("document.body.innerText");
}

async function expectText(view: Bun.WebView, text: string): Promise<void> {
  await waitFor(
    () => pageText(view),
    (content) => content.includes(text),
    `Expected page to contain text: ${text}`,
  );
}

async function clickButtonByText(view: Bun.WebView, text: string): Promise<void> {
  const found = await waitFor(
    () =>
      view.evaluate<boolean>(
        `(() => {
          const elements = Array.from(document.querySelectorAll("button, a"));
          const element = elements.find((candidate) => candidate.textContent?.includes(${JSON.stringify(text)}));
          if (!element) {
            return false;
          }
          element.click();
          return true;
        })()`,
      ),
    Boolean,
    `Expected a button or link with text: ${text}`,
  );

  expect(found).toBe(true);
}

beforeAll(async () => {
  await setupWebApp();
});

afterAll(async () => {
  await teardownWebApp();
});

describe("console e2e with Bun.WebView", () => {
  test("renders the console dashboard with mocked control-plane data", async () => {
    activeScenario = "dashboard";

    await using view = createWebView();
    await view.navigate(`${previewUrl}/`);

    await expectText(view, "最近部署");
    await expectText(view, "新部署");
    await expectText(view, "查看项目");
    await expectText(view, "查看部署");
    await expectText(view, "Demo");
    await expectText(view, "succeeded");

    await view.navigate(`${previewUrl}/projects`);
    await expectText(view, "项目");
    await expectText(view, "Demo");
    await expectText(view, "已有资源");
    await expectText(view, "workspace");

    await view.navigate(`${previewUrl}/deployments`);
    await expectText(view, "workspace");
    await expectText(view, "Demo");
    await expectText(view, "production");
    await expectText(view, "succeeded");

    await clickButtonByText(view, "新部署");
    await expectText(view, "本地目录");
    await clickButtonByText(view, "GitHub 仓库");
    await clickButtonByText(view, "从我的 GitHub 选择");
    await expectText(view, "后端尚未配置 GitHub OAuth");
  }, 15_000);

  test("shows the GitHub repository picker and fills the import wizard after auth", async () => {
    activeScenario = "github-connected";

    await using view = createWebView();
    await view.navigate(`${previewUrl}/`);

    await clickButtonByText(view, "新部署");
    await clickButtonByText(view, "GitHub 仓库");

    await expectText(view, "acme/platform");
    await clickButtonByText(view, "acme/platform");

    await expectText(view, "https://github.com/acme/platform.git");
    await clickButtonByText(view, "下一步");
    await expectText(view, "项目");
    await expectText(view, "octocat");
  }, 15_000);
});
