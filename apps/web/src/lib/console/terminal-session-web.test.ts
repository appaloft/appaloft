import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("terminal session Web console surface", () => {
  test("[TERM-SESSION-WEB-001] exposes active terminal lifecycle through Instance management", async () => {
    const [instancePageSource, clientContractSource] = await Promise.all([
      readFile(new URL("../../routes/instance/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../../packages/orpc/src/client-contract.ts", import.meta.url),
        "utf8",
      ),
    ]);

    expect(instancePageSource).toContain("orpcClient.terminalSessions.list");
    expect(instancePageSource).toContain("orpcClient.terminalSessions.close");
    expect(instancePageSource).toContain("orpcClient.terminalSessions.expire");
    expect(instancePageSource).toContain("terminalSessionsQuery");
    expect(instancePageSource).toContain("i18nKeys.console.terminal.lifecycleTitle");
    expect(instancePageSource).not.toContain("terminal output");
    expect(clientContractSource).toContain("list: Client<");
    expect(clientContractSource).toContain("show: Client<");
    expect(clientContractSource).toContain("close: Client<");
    expect(clientContractSource).toContain("expire: Client<");
    expect(clientContractSource).toContain("ListTerminalSessionsQueryInput");
  });

  test("[TERM-SESSION-ENTRY-002] exposes server terminal entrypoints from list and detail", async () => {
    const [serverListSource, serverDetailSource] = await Promise.all([
      readFile(new URL("../../routes/servers/+page.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/servers/[serverId]/+page.svelte", import.meta.url), "utf8"),
    ]);

    expect(serverListSource).toContain("serverTerminalHref");
    expect(serverListSource).toContain("?tab=terminal");
    expect(serverListSource).toContain("i18nKeys.common.actions.openTerminal");
    expect(serverDetailSource).toContain('value="terminal"');
    expect(serverDetailSource).toContain("TerminalSessionPanel");
    expect(serverDetailSource).toContain('kind: "server"');
    expect(serverDetailSource).toContain('serverTabHref("terminal")');
  });

  test("[TERM-SESSION-CMD-003] deep-links deployment detail to selected resource terminal", async () => {
    const [deploymentPageSource, resourcePageSource, utilsSource] = await Promise.all([
      readFile(
        new URL("../../routes/deployments/[deploymentId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("./utils.ts", import.meta.url), "utf8"),
    ]);

    expect(utilsSource).toContain("resourceTerminalHref");
    expect(utilsSource).toContain('params.set("deploymentId", deploymentId)');
    expect(deploymentPageSource).toContain("resourceTerminalHref");
    expect(deploymentPageSource).toContain("i18nKeys.common.actions.openTerminal");
    expect(resourcePageSource).toContain('page.url.searchParams.get("deploymentId")');
    expect(resourcePageSource).toContain("deploymentId: terminalDeploymentId");
  });

  test("[TERM-SESSION-TRANSPORT-003] forwards Web terminal dimensions as resize frames", async () => {
    const panelSource = await readFile(
      new URL("../components/console/TerminalSessionPanel.svelte", import.meta.url),
      "utf8",
    );

    expect(panelSource).toContain("function sendResize()");
    expect(panelSource).toContain('kind: "resize"');
    expect(panelSource).toContain("rows: terminalRows");
    expect(panelSource).toContain("cols: terminalCols");
    expect(panelSource).toContain("initialRows: terminalRows");
    expect(panelSource).toContain("initialCols: terminalCols");
    expect(panelSource).toContain("ws.onopen");
    expect(panelSource).toContain("sendResize()");
  });

  test("[TERM-SESSION-ENTRY-001][TERM-SESSION-ENTRY-002][TERM-SESSION-ENTRY-003] terminal docs do not keep stale Web coverage gaps", async () => {
    const [implementationPlan, testMatrix, productRoadmap] = await Promise.all([
      readFile(
        new URL(
          "../../../../../docs/implementation/operator-terminal-session-plan.md",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../../../../docs/testing/operator-terminal-session-test-matrix.md",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../../../../../docs/PRODUCT_ROADMAP.md", import.meta.url), "utf8"),
    ]);

    expect(implementationPlan).toContain("HTTP/WebSocket attach coverage exists");
    expect(implementationPlan).toContain("Bun.WebView coverage");
    expect(implementationPlan).not.toContain(
      "HTTP/WebSocket and Web E2E coverage remain follow-up",
    );
    expect(testMatrix).toContain("Current WebView coverage uses a mocked attach");
    expect(testMatrix).toContain("TERM-SESSION-ENTRY-010");
    expect(testMatrix).not.toContain("Should the first Web E2E test use");
    expect(productRoadmap).toContain("Web E2E coverage for resource/server attach");
    expect(productRoadmap).not.toContain("Web E2E coverage stay open");
  });

  test("[TERM-SESSION-ENTRY-009] terminal workflow records resolved Web placement", async () => {
    const workflow = await readFile(
      new URL("../../../../../docs/workflows/operator-terminal-session.md", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("resource-owned operational tab");
    expect(workflow).toContain("tab=terminal&deploymentId=<id>");
    expect(workflow).not.toContain(
      "Should Web expose terminal as a top-level resource tab or an action inside an operations tab",
    );
  });
});
