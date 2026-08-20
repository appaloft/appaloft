import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectOccupancyVendor,
  OCCUPANCY_VENDOR_HARNESS,
  occupancyHarnessForVendor,
  occupancyVendorCredentialPresent,
  resolveOccupancyVendor,
} from "../src/occupancy-vendor.js";

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "appaloft-occupancy-vendor-"));
}

test("[WS-REMOTE-VENDOR-204] vendor flags map onto existing occupancy harnesses", () => {
  expect(OCCUPANCY_VENDOR_HARNESS).toEqual({
    claude: "opencode",
    codex: "opencode",
    grok: "opencode",
  });
  expect(occupancyHarnessForVendor("grok")).toBe("opencode");
  expect(occupancyHarnessForVendor("claude", "pi")).toBe("pi");
  expect(occupancyHarnessForVendor(undefined)).toBe("opencode");
});

test("[WS-REMOTE-VENDOR-205] default vendor follows laptop login then install", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".grok"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "auth.json"), '{"token":"redacted"}\n');
  expect(await detectOccupancyVendor({ homeDir, which: () => undefined })).toBe("grok");

  const emptyHome = await tempHome();
  expect(
    await detectOccupancyVendor({
      homeDir: emptyHome,
      env: {},
      which: (name) => (name === "codex" ? "/bin/codex" : undefined),
    }),
  ).toBe("codex");
});

test("[WS-REMOTE-VENDOR-206] multiple vendor flags fail closed", async () => {
  const resolved = await resolveOccupancyVendor({
    flags: { claude: true, grok: true },
    homeDir: await tempHome(),
    env: {},
  });
  expect(resolved.isErr()).toBe(true);
  if (resolved.isOk()) return;
  expect(resolved.error.details?.code).toBe("workspace_occupancy_vendor_ambiguous");
});

test("[WS-REMOTE-CRED-213] explicit vendor without credential fail-closes", async () => {
  const resolved = await resolveOccupancyVendor({
    flags: { grok: true },
    homeDir: await tempHome(),
    env: {},
  });
  expect(resolved.isErr()).toBe(true);
  if (resolved.isOk()) return;
  expect(resolved.error.details?.code).toBe("workspace_occupancy_vendor_credential_missing");
  expect(JSON.stringify(resolved.error)).not.toContain("sk-");
});

test("[WS-REMOTE-CRED-210] Claude login is setup-token, not the chat cookie", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".claude"), { recursive: true });
  await writeFile(join(homeDir, ".claude", ".credentials.json"), '{"cookie":"do-not-copy"}\n');
  expect(await occupancyVendorCredentialPresent("claude", { homeDir, env: {} })).toBe(false);
  await writeFile(join(homeDir, ".claude", "setup-token"), "claude_oauth_test_token\n");
  expect(await occupancyVendorCredentialPresent("claude", { homeDir, env: {} })).toBe(true);
});
