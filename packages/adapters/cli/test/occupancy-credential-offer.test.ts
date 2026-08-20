import "../../../application/node_modules/reflect-metadata/Reflect.js";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WriteSandboxFileCommand } from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  isOccupancyClaudeChatCookiePath,
  loadOccupancyVendorCredential,
  offerOccupancyVendorCredential,
} from "../src/occupancy-credential-offer.js";

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "appaloft-occupancy-cred-"));
}

test("[WS-REMOTE-CRED-208] Grok auth.json is written to occupancy HOME", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".grok"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "auth.json"), '{"access_token":"grok-secret"}\n');

  const commands: WriteSandboxFileCommand[] = [];
  const offered = await offerOccupancyVendorCredential({
    workspaceId: "sbx_ready",
    vendor: "grok",
    homeDir,
    env: {},
    executeCommand: async (command) => {
      commands.push(command);
      return ok({});
    },
  });

  expect(offered).toEqual({
    offered: true,
    occupancyPath: ".grok/auth.json",
    kind: "auth.json",
  });
  expect(commands).toHaveLength(1);
  expect(commands[0]?.input.path).toBe(".grok/auth.json");
  expect(commands[0]?.input.sandboxId).toBe("sbx_ready");
  expect(Buffer.from(commands[0]!.input.contentBase64, "base64").toString("utf8")).toContain(
    "grok-secret",
  );
});

test("[WS-REMOTE-CRED-209] Codex auth.json is written to occupancy HOME", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await writeFile(join(homeDir, ".codex", "auth.json"), '{"tokens":{"access":"codex-secret"}}\n');

  const offered = await offerOccupancyVendorCredential({
    workspaceId: "sbx_ready",
    vendor: "codex",
    homeDir,
    env: {},
    executeCommand: async () => ok({}),
  });
  expect(offered.occupancyPath).toBe(".codex/auth.json");
  expect(offered.offered).toBe(true);
});

test("[WS-REMOTE-CRED-210] Claude copies setup-token and skips the chat cookie", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await writeFile(join(homeDir, ".claude", ".credentials.json"), '{"session":"cookie"}\n');
  await writeFile(join(homeDir, ".claude", "setup-token"), "claude_oauth_setup\n");

  expect(isOccupancyClaudeChatCookiePath(".claude/.credentials.json")).toBe(true);
  const loaded = await loadOccupancyVendorCredential("claude", { homeDir, env: {} });
  expect(loaded?.occupancyPath).toBe(".claude/setup-token");
  expect(new TextDecoder().decode(loaded?.content)).toContain("claude_oauth_setup");
  expect(new TextDecoder().decode(loaded?.content)).not.toContain("cookie");
});

test("[WS-REMOTE-CRED-211] vendor credential is not offered as an occupancy env var", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".grok"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "auth.json"), '{"access_token":"grok-secret"}\n');
  const command = await offerOccupancyVendorCredential({
    workspaceId: "sbx_ready",
    vendor: "grok",
    homeDir,
    env: { GROK_API_KEY: "should-not-be-used" },
    executeCommand: async (written) => ok(written),
  });
  expect(command.offered).toBe(true);
  expect(command.occupancyPath).toBe(".grok/auth.json");
});

test("[WS-REMOTE-CRED-212] missing vendor credential writes nothing", async () => {
  const offered = await offerOccupancyVendorCredential({
    workspaceId: "sbx_ready",
    vendor: "grok",
    homeDir: await tempHome(),
    env: {},
    executeCommand: async () => err({ message: "unused" } as never),
  });
  expect(offered).toEqual({ offered: false });
});
