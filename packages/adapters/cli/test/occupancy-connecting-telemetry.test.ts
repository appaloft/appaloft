import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";
import {
  countOccupancyConnectingSkills,
  offerOccupancyConnectingMaterials,
} from "../src/occupancy-connecting-offer.js";
import {
  OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA,
  occupancyConnectingSteps,
  occupancyConnectingTelemetry,
} from "../src/occupancy-connecting-telemetry.js";
import {
  OCCUPANCY_FIRST_PARTY_MCP_PATH,
  occupancyFirstPartyMcpBytes,
} from "../src/occupancy-mcp-offer.js";

test("[WS-REMOTE-CONNECT-215] connecting-step data names credential, skill count, and disk", () => {
  const telemetry = occupancyConnectingTelemetry({
    vendor: "grok",
    harness: "opencode",
    skillCount: 4,
    firstPartyMcp: true,
    credential: {
      vendor: "grok",
      kind: "auth.json",
      occupancyPath: ".grok/auth.json",
      offered: true,
    },
  });

  expect(telemetry.schemaVersion).toBe(OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA);
  expect(telemetry.workOnDisk).toBe(true);
  expect(telemetry.skillCount).toBe(4);
  expect(telemetry.mcp).toEqual({ firstParty: true, remoteStdio: true });
  expect(telemetry.steps).toEqual([
    { id: "credential", message: "using your Grok credential" },
    { id: "skills", message: "including 4 skills" },
    { id: "disk", message: "work is on its disk" },
  ]);
  expect(JSON.stringify(telemetry)).not.toMatch(/sk-|oauth|secret|token":/i);
});

test("[WS-REMOTE-CONNECT-215] connecting steps exist for Claude and Codex labels", () => {
  expect(
    occupancyConnectingSteps({ vendor: "claude", credentialOffered: true, skillCount: 1 }),
  ).toEqual([
    { id: "credential", message: "using your Claude credential" },
    { id: "skills", message: "including 1 skills" },
    { id: "disk", message: "work is on its disk" },
  ]);
  expect(
    occupancyConnectingSteps({ vendor: "codex", credentialOffered: true, skillCount: 2 })[0],
  ).toEqual({
    id: "credential",
    message: "using your Codex credential",
  });
});

test("[WS-REMOTE-MCP-214] occupancy MCP offer writes first-party stdio and not laptop secrets", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-connect-"));
  await mkdir(join(homeDir, ".grok"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "auth.json"), '{"access_token":"grok-secret"}\n');
  await mkdir(join(homeDir, ".grok", "skills", "plan"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "skills", "plan", "SKILL.md"), "# Plan\n");
  await writeFile(
    join(homeDir, ".grok", "skills", "plan", "mcp.json"),
    '{"token":"laptop-secret"}\n',
  );

  const commands: WriteSandboxFileCommand[] = [];
  const telemetry = await offerOccupancyConnectingMaterials({
    workspaceId: "sbx_ready",
    harness: "opencode",
    vendor: "grok",
    homeDir,
    env: {},
    executeCommand: async (command) => {
      if (command instanceof WriteSandboxFileCommand) commands.push(command);
      return ok({});
    },
    executeQuery: async () => err({ message: "missing" } as never),
  });

  expect(telemetry.steps.map((step) => step.id)).toEqual(["credential", "skills", "disk"]);
  expect(telemetry.mcp.firstParty).toBe(true);
  expect(commands.map((command) => command.input.path)).toEqual(
    expect.arrayContaining([".grok/auth.json", OCCUPANCY_FIRST_PARTY_MCP_PATH]),
  );
  const mcp = commands.find((command) => command.input.path === OCCUPANCY_FIRST_PARTY_MCP_PATH);
  expect(mcp).toBeDefined();
  if (!mcp) return;
  expect(Buffer.from(mcp.input.contentBase64, "base64").toString("utf8")).toBe(
    new TextDecoder().decode(occupancyFirstPartyMcpBytes()),
  );
  expect(
    commands.some(
      (command) =>
        command.input.path.includes("skills/") && command.input.path.endsWith("mcp.json"),
    ),
  ).toBe(false);
  expect(JSON.stringify(telemetry)).not.toContain("grok-secret");
  expect(JSON.stringify(telemetry)).not.toContain("laptop-secret");
});

test("[WS-REMOTE-CONNECT-215] skill count includes HOME skills plus first-party Appaloft", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "appaloft-occupancy-count-"));
  await mkdir(join(homeDir, ".claude", "skills", "review"), { recursive: true });
  await writeFile(join(homeDir, ".claude", "skills", "review", "SKILL.md"), "# Review\n");
  const skillDir = await mkdtemp(join(tmpdir(), "appaloft-skill-"));
  await writeFile(join(skillDir, "SKILL.md"), "# Appaloft\n");
  expect(await countOccupancyConnectingSkills({ homeDir, appaloftSkillDir: skillDir })).toBe(2);
});
