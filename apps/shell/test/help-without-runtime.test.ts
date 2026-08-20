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
