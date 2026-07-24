import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const listPage = await readFile(
  new URL("../../routes/workspaces/+page.svelte", import.meta.url),
  "utf8",
);
const detailPage = await readFile(
  new URL("../../routes/workspaces/[workspaceId=consoleObjectId]/+page.svelte", import.meta.url),
  "utf8",
);
const detailRoute = await readFile(
  new URL("../../routes/workspaces/[workspaceId=consoleObjectId]/+page.ts", import.meta.url),
  "utf8",
);
const taskPanel = await readFile(
  new URL("../components/console/WorkspaceTaskPanel.svelte", import.meta.url),
  "utf8",
);
const shell = await readFile(
  new URL("../components/console/ConsoleShell.svelte", import.meta.url),
  "utf8",
);

describe("public Agent Workspace Console", () => {
  test("[AGENT-WS-WEB-017] uses the public adapter catalog and canonical Workspace operations", () => {
    expect(shell).toContain('href: "/workspaces"');
    expect(listPage).toContain("sandboxes.agents.harnesses.list");
    expect(listPage).toContain("sandboxTemplates.list");
    expect(listPage).toContain("sandboxes.create");
    expect(listPage).toContain("sandboxes.agents.runtimes.create");
    expect(detailPage).toContain('scope={{ kind: "sandbox", sandboxId: workspaceId }}');
    expect(detailPage).toContain("sandboxes.ports.expose");
    expect(detailPage).toContain("sandboxes.agents.runtimes.attach");
    expect(detailPage).toContain("sandboxes.pause");
    expect(detailPage).toContain("sandboxes.resume");
    expect(detailPage).toContain("sandboxes.agents.runtimes.terminate");
    expect(detailPage).toContain("sandboxes.terminate");
    expect(detailRoute).toContain("export const prerender = false");
    expect(detailRoute).toContain("export const ssr = false");
  });

  test("[AGENT-WS-WEB-017] keeps paused Workspaces renderable and resumable", () => {
    expect(detailPage).toContain('sandbox.status === "ready"');
    expect(detailPage).toContain('sandbox.status !== "paused"');
    expect(detailPage).toContain('sandbox.status !== "ready"');
    expect(detailPage).toContain("{#if workspaceReady}");
  });

  test("[AGENT-TASK-WEB-010] exposes task evidence, external approval and delivery recovery", () => {
    expect(detailPage).toContain("<WorkspaceTaskPanel");
    expect(taskPanel).toContain("tasks.run");
    expect(taskPanel).toContain("tasks.resume");
    expect(taskPanel).toContain("tasks.cancel");
    expect(taskPanel).toContain("tasks.approve");
    expect(taskPanel).toContain("tasks.deliver");
    expect(taskPanel).toContain("tasks.events");
    expect(taskPanel).toContain("data-agent-task-events");
    expect(taskPanel).toContain("selectedTask.changes.patch");
    expect(taskPanel).toContain("selectedTask.developmentPreview.url");
    expect(taskPanel).toContain("selectedTask.delivery?.pullRequestUrl");
  });
});
