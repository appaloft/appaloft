import { expect, test } from "bun:test";
import { WriteSandboxFileCommand } from "@appaloft/application";
import { ok } from "@appaloft/core";

import {
  OCCUPANCY_FIRST_PARTY_MCP_PATH,
  OCCUPANCY_PROJECT_CONTEXT_PATH,
  occupancyProjectContextMarkdown,
  offerOccupancyFirstPartyMcp,
} from "../src/occupancy-mcp-offer.js";

test("[WS-REMOTE-MCP-237] occupancy writes Grok/Codex/Claude MCP launchers", async () => {
  const commands: WriteSandboxFileCommand[] = [];
  const offered = await offerOccupancyFirstPartyMcp({
    workspaceId: "sbx_ready",
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });
  expect(offered.offered).toBe(true);
  expect(commands.map((command) => command.input.path).sort()).toEqual(
    [
      ".claude.json",
      ".codex/config.toml",
      ".grok/config.toml",
      OCCUPANCY_FIRST_PARTY_MCP_PATH,
    ].sort(),
  );
  const grok = commands.find((command) => command.input.path === ".grok/config.toml");
  expect(grok).toBeDefined();
  if (!grok) return;
  expect(Buffer.from(String(grok.input.contentBase64), "base64").toString("utf8")).toContain(
    "[mcp_servers.appaloft]",
  );
  expect(Buffer.from(String(grok.input.contentBase64), "base64").toString("utf8")).not.toMatch(
    /token|secret|sk-/i,
  );
});

test("[WS-REMOTE-MCP-238] occupancy writes Project context, not git-as-project", async () => {
  const commands: WriteSandboxFileCommand[] = [];
  await offerOccupancyFirstPartyMcp({
    workspaceId: "sbx_ready",
    projectName: "drab-week",
    projectId: "prj_drab",
    destinationExists: async () => true,
    resources: [
      { name: "undb", kind: "application", source: "git" },
      { name: "www", kind: "static-site", source: "git" },
    ],
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });
  expect(commands.map((command) => command.input.path)).toEqual(
    expect.arrayContaining([
      OCCUPANCY_PROJECT_CONTEXT_PATH,
      "AGENTS.md",
      "GROK.md",
      ".grok/config.toml",
    ]),
  );
  const context = commands.find((command) => command.input.path === "AGENTS.md");
  expect(context).toBeDefined();
  if (!context) return;
  const markdown = Buffer.from(String(context.input.contentBase64), "base64").toString("utf8");
  expect(markdown).toContain("Project name: drab-week");
  expect(markdown).toContain("undb · application · git");
  expect(markdown).toContain("www · static-site · git");
  expect(markdown).not.toMatch(/occupancy/iu);
  expect(occupancyProjectContextMarkdown({ projectName: "only" })).toContain(
    "Do not answer from git remotes alone",
  );
});
