import { expect, test } from "bun:test";
import { WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import { offerOccupancyConnectingMaterials } from "../src/occupancy-connecting-offer.js";
import {
  OCCUPANCY_APPALOFT_PROFILE_PATH,
  occupancyAppaloftProfilesJson,
  occupancyControlPlaneMcpUrl,
  offerOccupancyAppaloftLogin,
} from "../src/occupancy-login-offer.js";
const login = {
  name: "cloud",
  mode: "cloud" as const,
  baseUrl: "https://app.appaloft.com",
  auth: { kind: "bearer" as const, token: "occ_login_token" },
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

test("[WS-REMOTE-MCP-240] occupancy writes laptop Appaloft profile store", async () => {
  const commands: WriteSandboxFileCommand[] = [];
  const offered = await offerOccupancyAppaloftLogin({
    workspaceId: "sbx_ready",
    login,
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });
  expect(offered.offered).toBe(true);
  expect(offered.occupancyPath).toBe(OCCUPANCY_APPALOFT_PROFILE_PATH);
  expect(occupancyControlPlaneMcpUrl(login.baseUrl)).toBe("https://app.appaloft.com/mcp");
  expect(commands).toHaveLength(1);
  expect(commands[0]?.input.path).toBe(OCCUPANCY_APPALOFT_PROFILE_PATH);
  expect(Buffer.from(String(commands[0]?.input.contentBase64), "base64").toString("utf8")).toBe(
    occupancyAppaloftProfilesJson(login),
  );
  expect(occupancyAppaloftProfilesJson(login)).toContain("occ_login_token");
});

test("[WS-REMOTE-MCP-241] connecting offer logs login without leaking the token", async () => {
  const commands: WriteSandboxFileCommand[] = [];
  const telemetry = await offerOccupancyConnectingMaterials({
    workspaceId: "sbx_ready",
    harness: "grok",
    vendor: "grok",
    homeDir: "/tmp/appaloft-occupancy-login-none",
    env: {},
    appaloftLogin: login,
    skillCount: 0,
    executeCommand: async (command) => {
      if (command instanceof WriteSandboxFileCommand) commands.push(command);
      return ok({});
    },
    executeQuery: async () => err({ message: "missing" } as never),
  });

  expect(telemetry.mcp.controlPlaneLogin).toBe(true);
  expect(
    telemetry.steps.some((step) => step.message === "Using your Appaloft login on the agent"),
  ).toBe(true);
  expect(commands.map((command) => command.input.path)).toEqual(
    expect.arrayContaining([OCCUPANCY_APPALOFT_PROFILE_PATH, ".grok/config.toml"]),
  );
  const grok = commands.find((command) => command.input.path === ".grok/config.toml");
  expect(grok).toBeDefined();
  if (!grok) return;
  expect(Buffer.from(String(grok.input.contentBase64), "base64").toString("utf8")).toContain(
    "https://app.appaloft.com/mcp",
  );
  expect(JSON.stringify(telemetry)).not.toContain("occ_login_token");
});
