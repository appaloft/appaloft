import { expect, test } from "@playwright/test";

test("renders the console dashboard with mocked control-plane data", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        service: "yundu",
        version: "0.1.0-test",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/readiness", async (route) => {
    await route.fulfill({
      json: {
        status: "ready",
        checks: {
          database: true,
          migrations: true,
        },
        details: {
          databaseDriver: "pglite",
        },
      },
    });
  });
  await page.route("**/api/version", async (route) => {
    await route.fulfill({
      json: {
        name: "Yundu",
        version: "0.1.0-test",
        apiVersion: "v1",
        mode: "self-hosted",
      },
    });
  });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/projects/list", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/servers/list", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/environments/list", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/deployments/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [
            {
              id: "dep_demo",
              projectId: "prj_demo",
              environmentId: "env_demo",
              serverId: "srv_demo",
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
                detectSummary: "mocked in playwright",
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
    });
  });
  await page.route("**/api/rpc/providers/list", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });

  await page.goto("/");

  await expect(page.getByText("最近部署")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "项目" })).toBeVisible();
  await expect(page.getByRole("button", { name: "快速部署" })).toBeVisible();
  await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("edge", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("production", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("succeeded", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "快速部署" }).click();
  await expect(page.getByRole("button", { name: /本地目录/ })).toBeVisible();
  await expect(page.getByText("后端尚未配置 GitHub OAuth").first()).toBeVisible();
});

test("shows the GitHub repository picker and fills the import wizard after auth", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      json: {
        status: "ok",
        service: "yundu",
        version: "0.1.0-test",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/readiness", async (route) => {
    await route.fulfill({
      json: {
        status: "ready",
        checks: {
          database: true,
          migrations: true,
        },
        details: {
          databaseDriver: "pglite",
        },
      },
    });
  });
  await page.route("**/api/version", async (route) => {
    await route.fulfill({
      json: {
        name: "Yundu",
        version: "0.1.0-test",
        apiVersion: "v1",
        mode: "self-hosted",
      },
    });
  });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/projects/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [],
        },
      },
    });
  });
  await page.route("**/api/rpc/servers/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [],
        },
      },
    });
  });
  await page.route("**/api/rpc/environments/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [],
        },
      },
    });
  });
  await page.route("**/api/rpc/deployments/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [],
        },
      },
    });
  });
  await page.route("**/api/rpc/providers/list", async (route) => {
    await route.fulfill({
      json: {
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
    });
  });
  await page.route("**/api/rpc/integrations/github/repositories/list", async (route) => {
    await route.fulfill({
      json: {
        json: {
          items: [
            {
              id: "repo_platform",
              name: "platform",
              fullName: "acme/platform",
              description: "Primary deployment control plane",
              defaultBranch: "main",
              cloneUrl: "https://github.com/acme/platform.git",
              private: true,
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      },
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "快速部署" }).click();
  await page.getByRole("button", { name: /GitHub 仓库/ }).click();

  await expect(page.getByText("acme/platform")).toBeVisible();

  await page.getByRole("button", { name: /acme\/platform/ }).click();

  await expect(page.locator("#source-locator")).toHaveValue("https://github.com/acme/platform.git");
  await expect(page.locator("#project-name")).toHaveValue("platform");
  await expect(page.getByText("已选择仓库")).toBeVisible();
  await expect(page.getByText("octocat").first()).toBeVisible();
});
