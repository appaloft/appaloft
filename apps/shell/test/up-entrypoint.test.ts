import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function spawnShell(args: readonly string[], env: NodeJS.ProcessEnv) {
  return Bun.spawn(["bun", "run", "--cwd", "apps/shell", "src/index.ts", "--", ...args], {
    cwd: join(import.meta.dir, "../../.."),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("appaloft up entrypoint", () => {
  test("[UP-ENTRY-001][UP-ENTRY-007] up help is canonical and runtime-free", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-up-help-"));
    try {
      const child = spawnShell(["up", "--help"], {
        ...process.env,
        APPALOFT_HOME: join(temporaryRoot, "home"),
        APPALOFT_PGLITE_DATA_DIR: join(temporaryRoot, "pglite-is-unavailable"),
        CURSOR_AGENT: "1",
        OTEL_SDK_DISABLED: "true",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain("$ up");
      expect(stdout).toContain("--yes");
      expect(stdout).toContain("--json");
      expect(stdout).toContain("terminal success");
      expect(stdout).toContain("deploy remains the supported 1.x compatibility spelling");
      expect(stderr).not.toContain("PGlite");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("[UP-ENTRY-007] root help leads with up before the compatibility spelling", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-root-help-up-"));
    try {
      const child = spawnShell(["--help"], {
        ...process.env,
        APPALOFT_HOME: join(temporaryRoot, "home"),
        OTEL_SDK_DISABLED: "true",
      });
      const [exitCode, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);

      const upIndex = stdout.indexOf("appaloft up [path|git-remote]");
      const codeIndex = stdout.indexOf("appaloft code [path|git-remote]");
      const workspaceIndex = stdout.indexOf("appaloft workspace [--json]");
      const deployIndex = stdout.indexOf("appaloft deploy [path|git-remote]");
      expect(exitCode).toBe(0);
      expect(upIndex).toBeGreaterThan(-1);
      expect(codeIndex).toBeGreaterThan(upIndex);
      expect(workspaceIndex).toBeGreaterThan(codeIndex);
      expect(deployIndex).toBeGreaterThan(workspaceIndex);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("[UP-ENTRY-003][UP-ENTRY-004] non-interactive up prints the deploy plan without composing runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-up-agent-guard-"));
    try {
      const child = spawnShell(["up"], {
        ...process.env,
        APPALOFT_HOME: join(temporaryRoot, "home"),
        APPALOFT_CONTROL_PLANE_MODE: "cloud",
        APPALOFT_CONTROL_PLANE_URL: "https://app.appaloft.com",
        APPALOFT_PGLITE_DATA_DIR: join(temporaryRoot, "pglite-is-unavailable"),
        CURSOR_AGENT: "1",
        OTEL_SDK_DISABLED: "true",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Would sign in and deploy this folder.");
      expect(stderr).toContain("Pass --yes to continue.");
      expect(stderr).not.toContain("PGlite");
      expect(stdout).toBe("");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
