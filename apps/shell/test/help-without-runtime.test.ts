import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryRoots: string[] = [];

function spawnShell(args: readonly string[], env: NodeJS.ProcessEnv) {
  return Bun.spawn(["bun", "run", "--cwd", "apps/shell", "src/index.ts", "--", ...args], {
    cwd: join(import.meta.dir, "../../.."),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("shell help without runtime composition", () => {
  test("[WS-CODE-PACKAGE-011][WS-SCRATCH-PACKAGE-018] code help does not initialize PGlite", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-code-help-no-runtime-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "help must not open this path");

    const child = spawnShell(["code", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
      OTEL_SDK_DISABLED: "true",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Occupy my Sandbox from a path or git remote");
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("appaloft code [path|git-remote] [options]");
    expect(stdout).toContain("--profile");
    expect(stdout).toContain("--new");
    expect(stdout).toContain("--no-attach");
    expect(stdout).toContain("--server");
    expect(stdout).toContain("--local");
    expect(stdout).toContain("--yes");
    expect(stdout).toContain("--open");
    expect(stdout).toContain("--open-target");
    expect(stdout).toContain("--harness");
    expect(stdout).toContain("--opencode");
    expect(stdout).toContain("--pi");
    expect(stdout).toContain("--omp");
    expect(stdout).toContain("this Mac's ~/.codex/auth.json");
    expect(stdout).toContain("selected remote Workspace HOME");
    expect(stdout).toContain("never printed or placed in MCP/env");
    expect(stdout).toContain("appaloft sandbox file remove <sandboxId> --path .codex/auth.json");
    expect(stdout).toContain("does not revoke upstream access");
    expect(stdout).toContain("revoke the corresponding Codex/OpenAI session");
    expect(stdout).toContain("Skip folder-onboarding prompts");
    expect(stdout).toContain("print and open the default preview");
    expect(stdout).toContain("Agent Workspace Profile");
    expect(stdout).toContain("Compatibility only");
    expect(stdout).toContain("this-Mac scratch");
    expect(stdout).toContain("new isolated Workspace");
    expect(stdout).toContain("without attaching the agent TUI");
    expect(stdout).not.toContain("A true or false value");
    expect(stdout).not.toContain("A user-defined piece of text");
    expect(stdout.split("This setting is optional").length - 1).toBeLessThanOrEqual(1);
    expect(stdout).not.toContain("--wizard");
    expect(stdout).not.toContain("preparing the agent");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?1049h");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?25l");
    expect(stderr).not.toContain("PGlite");
  });

  test("[WS-REMOTE-HELP-217][WS-REMOTE-HELP-218] code -h prints the same compact table", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-code-h-"));
    temporaryRoots.push(temporaryRoot);

    const child = spawnShell(["code", "-h"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("appaloft code [path|git-remote] [options]");
    expect(stdout).toContain("--no-attach");
    expect(stdout).not.toContain("A true or false value");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?1049h");
  });

  test("[WS-REMOTE-HELP-218] TTY PTY code --help does not enter alt-screen", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-code-help-pty-"));
    temporaryRoots.push(temporaryRoot);
    const repoRoot = join(import.meta.dir, "../../..");
    const script = `
import os, pty, sys
pid, fd = pty.fork()
if pid == 0:
    os.chdir(${JSON.stringify(repoRoot)})
    os.execvp("bun", ["bun", "run", "--cwd", "apps/shell", "src/index.ts", "--", "code", "--help"])
chunks = []
while True:
    try:
        chunk = os.read(fd, 4096)
    except OSError:
        break
    if not chunk:
        break
    chunks.append(chunk)
_, status = os.waitpid(pid, 0)
sys.stdout.buffer.write(b"".join(chunks))
sys.exit(os.waitstatus_to_exitcode(status))
`;
    const child = Bun.spawn(["python3", "-c", script], {
      cwd: repoRoot,
      env: {
        ...process.env,
        APPALOFT_HOME: join(temporaryRoot, "home"),
        OTEL_SDK_DISABLED: "true",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("appaloft code [path|git-remote] [options]");
    expect(stdout).toContain("--no-attach");
    expect(stdout).not.toContain("A true or false value");
    expect(stdout).not.toContain("preparing the agent");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?1049h");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?25l");
  });

  test("[PUB-DOCS-011A] deploy help does not initialize PGlite", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-help-no-runtime-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "help must not open this path");

    const child = spawnShell(["deploy", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
      OTEL_SDK_DISABLED: "true",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Create a deployment");
    expect(stdout).toContain("--help");
    expect(stderr).not.toContain("PGlite");
  });

  test("[OPR-COMPAT-018] operate help does not initialize PGlite", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-operate-help-no-runtime-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "help must not open this path");

    const child = spawnShell(["operate", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
      OTEL_SDK_DISABLED: "true",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Observe and recover one Resource");
    expect(stdout).toContain("--deployment");
    expect(stdout).toContain("--no-tui");
    expect(stdout).toContain("--json");
    expect(stderr).not.toContain("PGlite");
  });

  test("[CONTROL-PLANE-CLI-028] unknown command with help fails before runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-unknown-help-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "unknown command must not open this path");

    const child = spawnShell(["frimble", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(`${stdout}${stderr}`).toContain("Unknown Appaloft command");
    expect(`${stdout}${stderr}`).toContain("frimble");
    expect(stderr).not.toContain("PGlite");
  });

  test("[CONTROL-PLANE-CLI-029][WS-REMOTE-HELP-227] help validates unsupported options in either order", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-help-option-order-"));
    temporaryRoots.push(temporaryRoot);
    const env = {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    };
    const invocations = [
      ["code", "--bogus", "--help"],
      ["code", "--help", "--bogus"],
      ["workspace", "open", "--json", "--help"],
      ["workspace", "open", "--help", "--json"],
    ] as const;

    for (const args of invocations) {
      const child = spawnShell(args, env);
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      const unsupportedOption = args[0] === "code" ? "--bogus" : "--json";
      expect(exitCode).toBe(1);
      expect(`${stdout}${stderr}`).toContain(unsupportedOption);
    }
  });

  test("[CONTROL-PLANE-CLI-030] NO_COLOR removes ANSI from help and help-time errors", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-help-no-color-"));
    temporaryRoots.push(temporaryRoot);
    const env = {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      NO_COLOR: "1",
      OTEL_SDK_DISABLED: "true",
    };

    for (const args of [
      ["workspace", "--help"],
      ["workspace", "open", "--json", "--help"],
    ] as const) {
      const child = spawnShell(args, env);
      const [stdout, stderr] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(`${stdout}${stderr}`).not.toContain("\x1b[");
    }
  });

  test("[WS-REMOTE-HELP-228] workspace help prints canonical collaboration paths once", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-workspace-help-paths-"));
    temporaryRoots.push(temporaryRoot);
    const child = spawnShell(["workspace", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const printed = `${stdout}${stderr}`;

    expect(exitCode).toBe(0);
    expect(printed).toContain("collaboration participant");
    expect(printed).toContain("collaboration lane");
    expect(printed).toContain("collaboration writer");
    expect(printed).toContain("collaboration handoff");
    expect(printed).not.toContain("collaboration collaboration");
  });

  test("[CONTROL-PLANE-CLI-027] setup agent --help prints compact usage without runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-setup-help-no-runtime-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "help must not open this path");

    const child = spawnShell(["setup", "agent", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("appaloft setup agent");
    expect(stdout).toContain("Usage:");
    expect(stdout).toContain("-y, --yes");
    expect(stdout).toContain("--agent");
    expect(stdout).toContain(
      "Skip prompts, accept detected defaults, and confirm skill/MCP writes",
    );
    expect(stdout).toContain("not default-checked");
    expect(stdout).toContain("~/.cursor/mcp.json");
    expect(stdout).not.toContain("A true or false value");
    expect(stdout).not.toContain("A user-defined piece of text");
    expect(stdout.split("This setting is optional").length - 1).toBe(0);
    expect(stdout).not.toContain("--wizard");
    expect(stdout).not.toMatch(/occupancy/iu);
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?1049h");
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?25l");
    expect(stderr).not.toContain("PGlite");
  });

  test("[CONTROL-PLANE-CLI-027] setup agent -h prints the same compact table", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-setup-h-"));
    temporaryRoots.push(temporaryRoot);

    const child = spawnShell(["setup", "agent", "-h"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("appaloft setup agent");
    expect(stdout).toContain("-y, --yes");
    expect(stdout).not.toContain("A true or false value");
    expect(stdout).not.toMatch(/occupancy/iu);
    expect(`${stdout}${stderr}`).not.toContain("\x1b[?1049h");
  });

  test("[CONTROL-PLANE-CLI-029] setup help rejects unknown options and subcommands", async () => {
    for (const args of [
      ["setup", "agent", "--bogus", "--help"],
      ["setup", "nope", "--help"],
    ] as const) {
      const child = spawnShell(args, {
        ...process.env,
        OTEL_SDK_DISABLED: "true",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exitCode).not.toBe(0);
      expect(stdout).not.toContain("Appaloft agent setup");
      expect(stderr).toContain("Received unknown argument");
    }
  });

  test("[CONTROL-PLANE-CLI-012] login --help prints usage without OAuth or runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-login-help-"));
    temporaryRoots.push(temporaryRoot);

    const child = spawnShell(["login", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]",
    );
    expect(stdout).toContain("--no-browser");
    expect(stderr).not.toContain("validation_error");
    expect(stderr).not.toContain("Unsupported option");
    expect(`${stdout}${stderr}`).not.toContain("cli-auth/authorize");
    expect(`${stdout}${stderr}`).not.toContain("appaloft-backend");
  });

  test("[CONTROL-PLANE-CLI-012] login -h prints usage without OAuth or runtime", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-login-h-"));
    temporaryRoots.push(temporaryRoot);

    const child = spawnShell(["login", "-h"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(
      "appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]",
    );
    expect(`${stdout}${stderr}`).not.toContain("cli-auth/authorize");
  });

  test("one-shot CLI commands do not print appaloft-backend JSON logs", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-cli-no-backend-logs-"));
    temporaryRoots.push(temporaryRoot);

    const child = spawnShell(["code", "--help"], {
      ...process.env,
      APPALOFT_HOME: join(temporaryRoot, "home"),
      OTEL_SDK_DISABLED: "true",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Occupy my Sandbox from a path or git remote");
    expect(`${stdout}${stderr}`).not.toContain("appaloft-backend");
    expect(`${stdout}${stderr}`).not.toContain("durable_work_runtime.drain_stopped");
  });
});
