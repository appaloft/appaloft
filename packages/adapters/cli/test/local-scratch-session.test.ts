import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildScratchHarness,
  resolveAppaloftMcpArgv,
  resolveAppaloftSkillPath,
  resolveDefaultScratchHarness,
  resolveLocalAppaloftCli,
  resolveNativeOpenCodeAttachEnv,
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

  test("[WS-SCRATCH-SKILL-010] pins a relative source CLI to an absolute MCP command", async () => {
    await withTempDir("appaloft-scratch-relative-cli-", async (dir) => {
      const entry = join(dir, "src", "index.ts");
      await mkdir(dirname(entry), { recursive: true });
      await writeFile(entry, "export {}\n");
      const previousArgv = process.argv[1];
      const previousCwd = process.cwd();
      process.chdir(dir);
      process.argv[1] = "src/index.ts";
      try {
        const command = resolveLocalAppaloftCli(() => undefined);
        expect(command?.[1]).toBe(await realpath(entry));
      } finally {
        process.argv[1] = previousArgv;
        process.chdir(previousCwd);
      }
    });
  });

  test("[WS-SCRATCH-SKILL-010] does not offer a skill planted beside argv[1]", async () => {
    await withTempDir("appaloft-scratch-planted-skill-", async (dir) => {
      const planted = join(dir, "skills", "appaloft");
      await mkdir(planted, { recursive: true });
      await writeFile(join(planted, "SKILL.md"), "---\nname: planted\ndescription: no\n---\n");
      const previousArgv = process.argv[1];
      process.argv[1] = join(dir, "src", "index.ts");
      try {
        expect(resolveAppaloftSkillPath()).not.toBe(planted);
        expect(resolveAppaloftSkillPath()?.endsWith("/skills/appaloft")).toBe(true);
      } finally {
        process.argv[1] = previousArgv;
      }
    });
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

  test("[WS-SCRATCH-HARNESS-006] default probe falls back to Oh My Pi omp", async () => {
    const harness = await resolveDefaultScratchHarness(".", {
      which: (name) => (name === "omp" ? "/bin/omp" : undefined),
      resolveSkillPath: () => undefined,
      resolveAppaloftCli: () => undefined,
    });
    expect(harness.name).toBe("omp");
    expect(harness.argv).toEqual(["/bin/omp"]);
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
      expect(config.mcp?.appaloft?.command).toEqual([
        "env",
        "APPALOFT_CONTROL_PLANE_MODE=none",
        "/opt/appaloftdev",
        "mcp",
        "stdio",
      ]);
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

  test("[WS-REMOTE-SKILL-017] occupancy attach env offers the public skill and remote-stdio MCP", async () => {
    await withTempDir("appaloft-occupancy-attach-skill-", async (root) => {
      const skillDir = join(root, "skills", "appaloft");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: appaloft\ndescription: test\n---\n");
      expect(
        resolveAppaloftMcpArgv({
          APPALOFT_CONTROL_PLANE_URL: "http://127.0.0.1:3001",
          APPALOFT_CONTROL_PLANE_MODE: "self-hosted",
        }),
      ).toEqual(["mcp", "remote-stdio"]);
      const env = resolveNativeOpenCodeAttachEnv({
        resolveSkillPath: () => skillDir,
        resolveAppaloftCli: () => ["/opt/appaloftdev", "mcp", "remote-stdio"],
      });
      const config = JSON.parse(env?.OPENCODE_CONFIG_CONTENT ?? "{}") as {
        skills?: { paths?: string[] };
        mcp?: { appaloft?: { command?: string[] } };
      };
      expect(config.skills?.paths).toEqual([dirname(skillDir)]);
      expect(config.mcp?.appaloft?.command).toEqual([
        "env",
        "APPALOFT_CONTROL_PLANE_MODE=none",
        "/opt/appaloftdev",
        "mcp",
        "remote-stdio",
      ]);
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
