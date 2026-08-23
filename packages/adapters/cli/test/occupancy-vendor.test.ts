import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detectOccupancyVendor,
  loadOccupancyAgentPreference,
  OCCUPANCY_VENDOR_HARNESS,
  occupancyAliasFromHomeLabel,
  occupancyHarnessForAlias,
  occupancyVendorCredentialPresent,
  resolveOccupancyAgent,
} from "../src/occupancy-vendor.js";

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "appaloft-occupancy-vendor-"));
}

test("[WS-REMOTE-VENDOR-204] vendor and harness aliases map onto occupancy harnesses", () => {
  expect(OCCUPANCY_VENDOR_HARNESS).toEqual({
    claude: "claude",
    codex: "codex",
    grok: "grok",
  });
  expect(occupancyHarnessForAlias("claude")).toBe("claude");
  expect(occupancyHarnessForAlias("grok")).toBe("grok");
  expect(occupancyHarnessForAlias("codex")).toBe("codex");
  expect(occupancyHarnessForAlias("opencode")).toBe("opencode");
  expect(occupancyHarnessForAlias("pi")).toBe("pi");
  expect(occupancyHarnessForAlias("omp")).toBe("omp");
  expect(occupancyHarnessForAlias()).toBe("opencode");
  expect(occupancyAliasFromHomeLabel("OpenCode")).toBe("opencode");
  expect(occupancyAliasFromHomeLabel("Codex")).toBe("codex");
  expect(occupancyAliasFromHomeLabel("Claude")).toBe("claude");
  expect(occupancyAliasFromHomeLabel("Pi")).toBe("pi");
  expect(occupancyAliasFromHomeLabel("Grok")).toBe("grok");
});

test("[WS-REMOTE-VENDOR-205] default alias follows saved preference then laptop login", async () => {
  const homeDir = await tempHome();
  await mkdir(join(homeDir, ".grok"), { recursive: true });
  await mkdir(join(homeDir, ".codex"), { recursive: true });
  await writeFile(join(homeDir, ".grok", "auth.json"), '{"token":"redacted"}\n');
  await writeFile(join(homeDir, ".codex", "auth.json"), '{"token":"redacted"}\n');

  const first = await resolveOccupancyAgent({
    flags: { grok: true },
    homeDir,
    env: {},
    which: () => undefined,
  });
  expect(first.isOk()).toBe(true);
  if (first.isErr()) return;
  expect(first.value).toMatchObject({ alias: "grok", vendor: "grok", harness: "grok" });
  expect(await loadOccupancyAgentPreference({ homeDir, env: {} })).toBe("grok");

  const saved = await resolveOccupancyAgent({
    flags: {},
    homeDir,
    env: {},
    which: () => undefined,
  });
  expect(saved.isOk()).toBe(true);
  if (saved.isErr()) return;
  expect(saved.value.alias).toBe("grok");

  const emptyHome = await tempHome();
  expect(
    await detectOccupancyVendor({
      homeDir: emptyHome,
      env: {},
      which: (name) => (name === "codex" ? "/bin/codex" : undefined),
    }),
  ).toBe("codex");
});

test("[WS-REMOTE-VENDOR-206] agent aliases are mutually exclusive", async () => {
  const homeDir = await tempHome();
  const twoVendors = await resolveOccupancyAgent({
    flags: { claude: true, grok: true },
    homeDir,
    env: {},
  });
  expect(twoVendors.isErr()).toBe(true);
  if (twoVendors.isOk()) return;
  expect(twoVendors.error.details?.code).toBe("workspace_occupancy_vendor_ambiguous");

  const vendorAndHarness = await resolveOccupancyAgent({
    flags: { grok: true, pi: true },
    homeDir,
    env: {},
  });
  expect(vendorAndHarness.isErr()).toBe(true);
  if (vendorAndHarness.isOk()) return;
  expect(vendorAndHarness.error.details?.code).toBe("workspace_occupancy_vendor_ambiguous");

  const aliasAndHarness = await resolveOccupancyAgent({
    flags: { grok: true },
    harness: "pi",
    homeDir,
    env: {},
  });
  expect(aliasAndHarness.isErr()).toBe(true);
  if (aliasAndHarness.isOk()) return;
  expect(aliasAndHarness.error.details?.code).toBe("workspace_occupancy_vendor_ambiguous");
});

test("[WS-REMOTE-VENDOR-207] --harness is compatibility for the matching harness alias", async () => {
  const homeDir = await tempHome();
  const viaHarness = await resolveOccupancyAgent({
    flags: {},
    harness: "pi",
    homeDir,
    env: {},
  });
  expect(viaHarness.isOk()).toBe(true);
  if (viaHarness.isErr()) return;
  expect(viaHarness.value).toMatchObject({ alias: "pi", harness: "pi", explicit: true });

  const sameTwice = await resolveOccupancyAgent({
    flags: { pi: true },
    harness: "pi",
    homeDir,
    env: {},
  });
  expect(sameTwice.isOk()).toBe(true);
  if (sameTwice.isErr()) return;
  expect(sameTwice.value.alias).toBe("pi");
});

test("[WS-REMOTE-CRED-213] explicit vendor without credential fail-closes", async () => {
  const resolved = await resolveOccupancyAgent({
    flags: { grok: true },
    homeDir: await tempHome(),
    env: {},
  });
  expect(resolved.isErr()).toBe(true);
  if (resolved.isOk()) return;
  expect(resolved.error.details?.code).toBe("workspace_occupancy_vendor_credential_missing");
  expect(resolved.error.message).not.toMatch(/occupancy/iu);
  expect(String(resolved.error.details?.guidance ?? "")).not.toMatch(/occupancy/iu);
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
