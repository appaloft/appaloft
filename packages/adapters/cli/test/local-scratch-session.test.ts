import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildScratchHarness,
  resolveAppaloftSkillPath,
  resolveDefaultScratchHarness,
  resolveLocalAppaloftCli,
  resolveScratchPath,
  resolveScratchSession,
  SCRATCH_BANNER,
} from "../src/local-scratch-session.js";

async function withTempDir<T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("local scratch session", () => {
  test("[WS-SCRATCH-SKILL-010] resolves the public skill from this checkout", () => {
    const skillPath = resolveAppaloftSkillPath();
    expect(skillPath).toBeDefined();
    expect(skillPath?.endsWith("/skills/appaloft")).toBe(true);
  });

  test("[WS-SCRATCH-SKILL-010] MCP command ignores unknown process entrypoints", () => {
    const previous = process.argv[1];
    process.argv[1] = "/tmp/unrelated-script.mjs";
    try {
      expect(resolveLocalAppaloftCli(() => undefined)).toBeUndefined();
    } finally {
      process.argv[1] = previous;
    }
  });

  test("[WS-SCRATCH-HARNESS-006] prefers OpenCode over Pi", async () => {
    await withTempDir("appaloft-scratch-probe-", async (scratchDir) => {
      const session = await resolveScratchSession(scratchDir, async () => ({
        name: "opencode",
        argv: ["opencode"],
        skillOffered: true,
      }));
      expect(session.banner).toBe(SCRATCH_BANNER);
      expect(session.harness.name).toBe("opencode");
      expect(session.path).toBe(resolveScratchPath(scratchDir));
    });
  });

  test("[WS-SCRATCH-HARNESS-006] default probe prefers OpenCode when both exist", async () => {
    const harness = await resolveDefaultScratchHarness(".", {
      which: (name) => (name === "opencode" || name === "pi" ? `/bin/${name}` : undefined),
      resolveSkillPath: () => undefined,
      resolveAppaloftCli: () => undefined,
    });
    expect(harness.name).toBe("opencode");
    expect(harness.argv).toEqual(["/bin/opencode"]);
  });

  test("[WS-SCRATCH-HARNESS-006] default probe falls back to Pi", async () => {
    const harness = await resolveDefaultScratchHarness(".", {
      which: (name) => (name === "pi" ? "/bin/pi" : undefined),
      resolveSkillPath: () => undefined,
      resolveAppaloftCli: () => undefined,
    });
    expect(harness.name).toBe("pi");
    expect(harness.argv).toEqual(["/bin/pi"]);
    expect(harness.skillOffered).toBe(false);
  });

  test("[WS-SCRATCH-SKILL-010] OpenCode receives skill source and local MCP without writing cwd", async () => {
    await withTempDir("appaloft-scratch-skill-", async (root) => {
      const skillDir = join(root, "skills", "appaloft");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: appaloft\ndescription: test\n---\n");
      const scratchDir = join(root, "empty");
      await mkdir(scratchDir);
      const skillPath = resolveAppaloftSkillPath([root]);
      expect(skillPath).toBe(skillDir);
      const harness = buildScratchHarness("opencode", "/bin/opencode", {
        skillPath,
        appaloftCli: ["/opt/appaloftdev", "mcp", "stdio"],
      });

      expect(harness.skillOffered).toBe(true);
      expect(harness.skillPath).toBe(skillDir);
      expect(harness.env?.OPENCODE_CONFIG_CONTENT).toBeDefined();
      const config = JSON.parse(harness.env?.OPENCODE_CONFIG_CONTENT ?? "{}") as {
        skills?: { paths?: string[] };
        mcp?: { appaloft?: { command?: string[] } };
      };
      expect(config.skills?.paths).toEqual([dirname(skillDir)]);
      expect(config.mcp?.appaloft?.command).toEqual(["/opt/appaloftdev", "mcp", "stdio"]);
      expect(await Bun.file(join(scratchDir, ".opencode")).exists()).toBe(false);
      expect(await Bun.file(join(scratchDir, "AGENTS.md")).exists()).toBe(false);
    });
  });

  test("[WS-SCRATCH-SKILL-010] Pi receives --skill pointing at the public skill directory", async () => {
    await withTempDir("appaloft-scratch-pi-skill-", async (root) => {
      const skillDir = join(root, "skills", "appaloft");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: appaloft\ndescription: test\n---\n");
      const skillPath = resolveAppaloftSkillPath([root]);
      expect(skillPath).toBe(skillDir);
      const harness = buildScratchHarness("pi", "/bin/pi", {
        skillPath,
      });
      expect(harness.argv).toEqual(["/bin/pi", "--skill", skillDir]);
      expect(harness.skillOffered).toBe(true);
    });
  });

  test("[WS-SCRATCH-INSTALL-007] non-interactive missing binary is agent_missing not refused", async () => {
    try {
      await resolveDefaultScratchHarness(".", {
        which: () => undefined,
        isInteractive: false,
      });
      throw new Error("expected missing binary to fail");
    } catch (error) {
      expect(error).toMatchObject({
        details: {
          code: "workspace_scratch_agent_missing",
          phase: "scratch-harness",
        },
      });
    }
  });

  test("[WS-SCRATCH-INSTALL-007] interactive refusal keeps install_refused", async () => {
    try {
      await resolveDefaultScratchHarness(".", {
        which: () => undefined,
        isInteractive: true,
        confirmInstall: async () => false,
      });
      throw new Error("expected refused install to fail");
    } catch (error) {
      expect(error).toMatchObject({
        details: {
          code: "workspace_scratch_install_refused",
          phase: "scratch-harness",
        },
      });
    }
  });

  test("[WS-SCRATCH-PATH] rejects invalid scratch paths", () => {
    expect(() => resolveScratchPath("")).toThrow("Scratch path is invalid");
  });
});
