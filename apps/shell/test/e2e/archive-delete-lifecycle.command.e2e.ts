import { afterEach, describe, expect, test } from "bun:test";
import {
  type CliResult,
  cleanupWorkspace,
  createShellE2eWorkspace,
  createShellHttpAdminSession,
  expectCliSuccess,
  parseJson,
  reservePort,
  runShellCli,
  type ShellCliOptions,
  type ShellE2eWorkspace,
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

let workspace: ShellE2eWorkspace | undefined;

afterEach(() => {
  if (workspace) {
    cleanupWorkspace(workspace.workspaceDir);
    workspace = undefined;
  }
});

function expectCliDomainBlocker(result: CliResult, label: string, code: string): void {
  expect(
    result.exitCode,
    `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  ).not.toBe(0);
  const output = `${result.stdout}\n${result.stderr}`;
  expect(output, label).toContain(code);
  expect(output, label).not.toContain("server_error");
  expect(output, label).not.toContain("internal_server_error");
  expect(output, label).not.toContain("<!doctype html>");
  expect(output, label).not.toContain("<html");
}

function runRemoteCli(
  remotePrefix: readonly string[],
  args: readonly string[],
  options: ShellCliOptions,
): CliResult {
  return runShellCli([...remotePrefix, ...args], options);
}

function pruneRetainedRows(
  remotePrefix: readonly string[],
  aggregateId: string,
  options: ShellCliOptions,
): void {
  const cutoff = "2100-01-01T00:00:00.000Z";
  const auditPrune = runRemoteCli(
    remotePrefix,
    ["audit-event", "prune", "--before", cutoff, "--aggregate", aggregateId, "--dry-run", "false"],
    options,
  );
  expectCliSuccess(auditPrune, `prune audit rows for ${aggregateId}`);

  const eventPrune = runRemoteCli(
    remotePrefix,
    ["domain-event", "prune", "--before", cutoff, "--aggregate", aggregateId, "--dry-run", "false"],
    options,
  );
  expectCliSuccess(eventPrune, `prune domain events for ${aggregateId}`);
}

describe("archive and delete lifecycle CLI e2e", () => {
  test("[LIFE-DELETE-CLI-001] deletion blockers are domain errors and resources/projects delete in retention order", async () => {
    const port = await reservePort();
    workspace = createShellE2eWorkspace("appaloft-delete-lifecycle-cli-", {
      httpPort: String(port),
    });
    const server = await startShellHttpServer(workspace.cliOptions);

    try {
      const admin = await createShellHttpAdminSession(server.baseUrl);
      const cliOptions = {
        ...workspace.cliOptions,
        env: {
          ...workspace.cliOptions.env,
          APPALOFT_AUTH_COOKIE: admin.cookie,
        },
      };
      const remotePrefix = [
        "--control-plane-mode",
        "self-hosted",
        "--control-plane-url",
        server.baseUrl,
      ];

      const project = runRemoteCli(
        remotePrefix,
        ["project", "create", "--name", "Delete Lifecycle CLI"],
        cliOptions,
      );
      expectCliSuccess(project, "create project");
      const projectId = parseJson<{ id: string }>(project.stdout).id;

      const environment = runRemoteCli(
        remotePrefix,
        ["env", "create", "--project", projectId, "--name", "Production", "--kind", "production"],
        cliOptions,
      );
      expectCliSuccess(environment, "create environment");
      const environmentId = parseJson<{ id: string }>(environment.stdout).id;

      const resource = runRemoteCli(
        remotePrefix,
        [
          "resource",
          "create",
          "--project",
          projectId,
          "--environment",
          environmentId,
          "--name",
          "PocketBase Cleanup",
          "--kind",
          "application",
          "--internal-port",
          "8090",
        ],
        cliOptions,
      );
      expectCliSuccess(resource, "create resource");
      const resourceId = parseJson<{ id: string }>(resource.stdout).id;

      const resourceShow = runRemoteCli(remotePrefix, ["resource", "show", resourceId], cliOptions);
      expectCliSuccess(resourceShow, "show resource for delete confirmation");
      const resourceDetail = parseJson<{ resource: { id: string; slug: string } }>(
        resourceShow.stdout,
      ).resource;

      const cleanupServer = runRemoteCli(
        remotePrefix,
        [
          "server",
          "register",
          "--name",
          "cleanup-blocker-server",
          "--host",
          "127.0.0.1",
          "--port",
          "22",
          "--provider",
          "generic-ssh",
          "--proxy-kind",
          "none",
        ],
        cliOptions,
      );
      expectCliSuccess(cleanupServer, "register server");
      const serverId = parseJson<{ id: string }>(cleanupServer.stdout).id;

      expectCliDomainBlocker(
        runRemoteCli(
          remotePrefix,
          ["server", "delete", serverId, "--confirm", serverId],
          cliOptions,
        ),
        "active server delete",
        "server_delete_blocked",
      );

      const archivedProject = runRemoteCli(
        remotePrefix,
        ["project", "archive", projectId, "--reason", "delete lifecycle e2e"],
        cliOptions,
      );
      expectCliSuccess(archivedProject, "archive project");

      const blockedProjectDeleteCheck = runRemoteCli(
        remotePrefix,
        ["project", "delete-check", projectId],
        cliOptions,
      );
      if (blockedProjectDeleteCheck.exitCode !== 0) {
        const rawResponse = await fetch(
          `${server.baseUrl}/api/projects/${projectId}/delete-check`,
          {
            headers: {
              cookie: admin.cookie,
            },
          },
        );
        const rawBody = await rawResponse.text();
        const serverStdout = server.stdout();
        const serverStderr = server.stderr();
        expect(
          blockedProjectDeleteCheck.exitCode,
          `project delete-check with resource blocker\nstdout:\n${blockedProjectDeleteCheck.stdout}\nstderr:\n${blockedProjectDeleteCheck.stderr}\nraw status: ${rawResponse.status}\nraw body:\n${rawBody}\nserver stdout:\n${serverStdout}\nserver stderr:\n${serverStderr}`,
        ).toBe(0);
      }

      expectCliDomainBlocker(
        runRemoteCli(
          remotePrefix,
          ["project", "delete", projectId, "--confirm", projectId],
          cliOptions,
        ),
        "archived project with resource delete",
        "project_delete_blocked",
      );

      expectCliDomainBlocker(
        runRemoteCli(
          remotePrefix,
          ["resource", "delete", resourceDetail.id, "--confirm-slug", resourceDetail.slug],
          cliOptions,
        ),
        "active resource delete",
        "resource_delete_blocked",
      );

      const archivedResource = runRemoteCli(
        remotePrefix,
        ["resource", "archive", resourceDetail.id, "--reason", "delete lifecycle e2e"],
        cliOptions,
      );
      expectCliSuccess(archivedResource, "archive resource");

      pruneRetainedRows(remotePrefix, resourceDetail.id, cliOptions);

      const deletedResource = runRemoteCli(
        remotePrefix,
        ["resource", "delete", resourceDetail.id, "--confirm-slug", resourceDetail.slug],
        cliOptions,
      );
      expectCliSuccess(deletedResource, "delete archived resource");

      const archivedEnvironment = runRemoteCli(
        remotePrefix,
        ["env", "archive", environmentId, "--reason", "delete lifecycle e2e"],
        cliOptions,
      );
      expectCliSuccess(archivedEnvironment, "archive environment");

      pruneRetainedRows(remotePrefix, projectId, cliOptions);

      const deletedProject = runRemoteCli(
        remotePrefix,
        ["project", "delete", projectId, "--confirm", projectId],
        cliOptions,
      );
      expectCliSuccess(
        deletedProject,
        "delete archived project after resource/env/retention cleanup",
      );
    } finally {
      await server.stop();
    }
  });
});
