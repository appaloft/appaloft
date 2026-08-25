import { expect, test } from "bun:test";
import { ExecuteSandboxCommand, WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  OCCUPANCY_APPALOFT_CLI_CHECKSUMS,
  OCCUPANCY_APPALOFT_CLI_PATH,
  OCCUPANCY_APPALOFT_CLI_VERSION,
  occupancyAppaloftCliInstallScript,
  offerOccupancyAppaloftCli,
} from "../src/occupancy-cli-offer.js";
import { offerOccupancyConnectingMaterials } from "../src/occupancy-connecting-offer.js";

test("[WS-REMOTE-MCP-242] occupancy CLI install uses pinned release checksums", async () => {
  const commands: ExecuteSandboxCommand[] = [];
  const offered = await offerOccupancyAppaloftCli({
    workspaceId: "sbx_ready",
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });
  expect(offered.offered).toBe(true);
  expect(offered.occupancyPath).toBe(OCCUPANCY_APPALOFT_CLI_PATH);
  expect(commands).toHaveLength(1);
  const script = commands[0]?.input.argv[2] ?? "";
  expect(script).toBe(occupancyAppaloftCliInstallScript());
  expect(script).toContain(OCCUPANCY_APPALOFT_CLI_VERSION);
  expect(script).toContain(OCCUPANCY_APPALOFT_CLI_CHECKSUMS["linux-arm64-gnu"]);
  expect(script).toContain(OCCUPANCY_APPALOFT_CLI_CHECKSUMS["linux-x64-gnu"]);
  expect(script).toContain("sha256sum --check --strict");
});

test("[WS-REMOTE-MCP-243] CLI install failure keeps HTTP MCP with login", async () => {
  const files: WriteSandboxFileCommand[] = [];
  const telemetry = await offerOccupancyConnectingMaterials({
    workspaceId: "sbx_ready",
    harness: "grok",
    vendor: "grok",
    homeDir: "/tmp/appaloft-occupancy-cli-none",
    env: {},
    appaloftLogin: {
      name: "cloud",
      mode: "cloud",
      baseUrl: "https://app.appaloft.com",
      auth: { kind: "bearer", token: "occ_login_token" },
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    skillCount: 0,
    executeCommand: async (command) => {
      if (command instanceof WriteSandboxFileCommand) {
        files.push(command);
        return ok({});
      }
      return err({ message: "install failed" } as never);
    },
    executeQuery: async () => err({ message: "missing" } as never),
  });

  expect(telemetry.mcp.appaloftCli).toBeUndefined();
  const grok = files.find((command) => command.input.path === ".grok/config.toml");
  expect(grok).toBeDefined();
  if (!grok) return;
  expect(Buffer.from(String(grok.input.contentBase64), "base64").toString("utf8")).toContain(
    'url = "https://app.appaloft.com/mcp"',
  );
  expect(JSON.stringify(telemetry)).not.toContain("occ_login_token");
});
