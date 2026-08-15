import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryRoots: string[] = [];

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

    const child = Bun.spawn(
      ["bun", "run", "--cwd", "apps/shell", "src/index.ts", "code", "--help"],
      {
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          APPALOFT_HOME: join(temporaryRoot, "home"),
          APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
          OTEL_SDK_DISABLED: "true",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Occupy my Sandbox on the default Server");
    expect(stdout).not.toContain("--profile");
    expect(stdout).not.toContain("--new");
    expect(stdout).toContain("--no-attach");
    expect(stdout).toContain("--local");
    expect(stderr).not.toContain("PGlite");
  });

  test("[PUB-DOCS-011A] deploy help does not initialize PGlite", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "appaloft-help-no-runtime-"));
    temporaryRoots.push(temporaryRoot);
    const unusablePglitePath = join(temporaryRoot, "pglite-is-a-file");
    await writeFile(unusablePglitePath, "help must not open this path");

    const child = Bun.spawn(
      ["bun", "run", "--cwd", "apps/shell", "src/index.ts", "deploy", "--help"],
      {
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          APPALOFT_HOME: join(temporaryRoot, "home"),
          APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
          OTEL_SDK_DISABLED: "true",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

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

    const child = Bun.spawn(
      ["bun", "run", "--cwd", "apps/shell", "src/index.ts", "operate", "--help"],
      {
        cwd: join(import.meta.dir, "../../.."),
        env: {
          ...process.env,
          APPALOFT_HOME: join(temporaryRoot, "home"),
          APPALOFT_PGLITE_DATA_DIR: unusablePglitePath,
          OTEL_SDK_DISABLED: "true",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );

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
});
