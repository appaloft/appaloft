import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  classifyChangedFiles,
  e2eNeedsBackend,
  e2eNeedsShardWork,
  e2eNeedsShell,
  e2eNeedsWebView,
  formatClassificationSummary,
  isDocsOnlyPath,
  isLightweightPath,
  isReleaseBumpPath,
  isShellIsolatedE2ePath,
  isWebIsolatedE2ePath,
  isWorkspaceTuiPath,
  planChangedFilesLookup,
  releaseBumpExactFiles,
  workspaceTuiRequired,
} from "../ci/classify-changed-files";

const root = resolve(import.meta.dir, "../..");
const ciWorkflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const e2eWorkflow = readFileSync(join(root, ".github/workflows/e2e.yml"), "utf8");
const classifierPath = "scripts/ci/classify-changed-files.ts";
const expression = (value: string) => ["$", "{{ ", value, " }}"].join("");

const releaseBumpPrFiles = [
  ".github/.release-please-manifest.json",
  "CHANGELOG.md",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/tauri.conf.json",
  "docs/PRODUCT_ROADMAP.md",
  "package.json",
];

const docsOnlyPrFiles = [
  ".github/workflows/ci.yml",
  "LICENSE",
  "docs/TESTING.md",
  "skills/appaloft/SKILL.md",
];

describe("CI change classifier", () => {
  test("[CI-LIGHTWEIGHT-001] docs-only and workflow-yaml-only files stay lightweight", () => {
    expect(docsOnlyPrFiles.every((file) => isDocsOnlyPath(file))).toBe(true);
    expect(classifyChangedFiles(docsOnlyPrFiles)).toEqual({
      changeClass: "docs_only",
      e2eClass: "e2e_skip",
      files: [...docsOnlyPrFiles].sort((left, right) => left.localeCompare(right)),
      lightweightOnly: true,
      workspaceTuiClass: "tui_skip",
    });
    expect(classifyChangedFiles(["LICENSE.APACHE"])).toMatchObject({
      changeClass: "docs_only",
      lightweightOnly: true,
    });
    expect(classifyChangedFiles(["apps/docs/src/content/index.mdx"])).toMatchObject({
      changeClass: "docs_only",
      lightweightOnly: true,
    });
  });

  test("[CI-LIGHTWEIGHT-002] release-please version-bump file sets stay lightweight", () => {
    for (const file of releaseBumpExactFiles) {
      expect(isReleaseBumpPath(file)).toBe(true);
      expect(isLightweightPath(file)).toBe(true);
    }

    expect(classifyChangedFiles(releaseBumpPrFiles)).toEqual({
      changeClass: "release_bump",
      e2eClass: "e2e_skip",
      files: [...releaseBumpPrFiles].sort((left, right) => left.localeCompare(right)),
      lightweightOnly: true,
      workspaceTuiClass: "tui_skip",
    });
    expect(
      classifyChangedFiles([
        ".github/.release-please-manifest.json",
        "CHANGELOG.md",
        "apps/desktop/src-tauri/Cargo.toml",
        "apps/desktop/src-tauri/tauri.conf.json",
        "package.json",
      ]),
    ).toMatchObject({
      changeClass: "release_bump",
      lightweightOnly: true,
    });
    expect(classifyChangedFiles(["package.json"])).toMatchObject({
      changeClass: "release_bump",
      lightweightOnly: true,
    });
  });

  test("[CI-LIGHTWEIGHT-003] product source, lockfiles, and other rust stay full CI", () => {
    const fullSets = [
      ["packages/core/src/index.ts"],
      ["apps/shell/src/index.ts"],
      ["apps/web/src/routes/+page.svelte"],
      ["skills/appaloft/references/cli-entrypoints.md", "packages/application/src/tokens.ts"],
      ["bun.lock"],
      ["apps/desktop/src-tauri/Cargo.lock"],
      ["apps/desktop/src-tauri/src/main.rs"],
      ["apps/workspace-control-tui/src/main.rs"],
      [...releaseBumpPrFiles, "packages/core/src/index.ts"],
      [...docsOnlyPrFiles, "scripts/ci/classify-changed-files.ts"],
    ];

    for (const files of fullSets) {
      expect(classifyChangedFiles(files)).toMatchObject({
        changeClass: "full",
        lightweightOnly: false,
      });
    }

    expect(classifyChangedFiles([])).toMatchObject({
      changeClass: "full",
      lightweightOnly: false,
    });
    expect(
      classifyChangedFiles(["packages/core/src/index.ts"], {
        headRef: "release-please--branches--main--components--appaloft",
      }),
    ).toMatchObject({
      changeClass: "full",
      lightweightOnly: false,
    });
    expect(
      classifyChangedFiles(docsOnlyPrFiles, {
        headRef: "release-please--branches--main--components--appaloft",
      }),
    ).toMatchObject({
      changeClass: "release_bump",
      lightweightOnly: true,
    });
    expect(
      classifyChangedFiles([], {
        headRef: "release-please--branches--main--components--appaloft",
      }),
    ).toMatchObject({
      changeClass: "release_bump",
      lightweightOnly: true,
    });
  });

  test("[CI-LIGHTWEIGHT-004] pull_request and workflow_dispatch both diff against the target branch", () => {
    expect(
      planChangedFilesLookup({
        baseRef: "main",
        beforeSha: "",
        defaultBranch: "main",
        eventName: "pull_request",
        headSha: "abc",
      }),
    ).toEqual({
      fetchRef: "main",
      mode: "three-dot",
      spec: "origin/main...HEAD",
    });
    expect(
      planChangedFilesLookup({
        baseRef: "",
        beforeSha: "",
        defaultBranch: "main",
        eventName: "workflow_dispatch",
        headSha: "abc",
      }),
    ).toEqual({
      fetchRef: "main",
      mode: "three-dot",
      spec: "origin/main...HEAD",
    });
    expect(
      planChangedFilesLookup({
        baseRef: "",
        beforeSha: "1111111111111111111111111111111111111111",
        defaultBranch: "main",
        eventName: "push",
        headSha: "2222222222222222222222222222222222222222",
      }),
    ).toEqual({
      from: "1111111111111111111111111111111111111111",
      mode: "two-dot",
      to: "2222222222222222222222222222222222222222",
    });
    expect(() =>
      planChangedFilesLookup({
        baseRef: "",
        beforeSha: "",
        defaultBranch: "",
        eventName: "workflow_dispatch",
        headSha: "",
      }),
    ).toThrow("DEFAULT_BRANCH");
  });

  test("[CI-LIGHTWEIGHT-005] ci.yml and e2e.yml share the classifier and keep required check names", () => {
    expect(ciWorkflow).toContain(classifierPath);
    expect(e2eWorkflow).toContain(classifierPath);
    expect(ciWorkflow).not.toContain("Workflow dispatch; running full CI.");
    expect(ciWorkflow).toContain("name: ci");
    expect(e2eWorkflow).toContain("  e2e:");
    expect(e2eWorkflow).toContain("shard: [1, 2]");
    expect(e2eWorkflow).toContain("shard_total: [2]");
    expect(e2eWorkflow).toContain("name: Skip E2E");
    expect(e2eWorkflow).not.toContain("e2e-skip:");
    const resultVar = ["$", "{result}"].join("");
    expect(ciWorkflow).toContain(
      ['if [[ "', resultVar, '" != "success" && "', resultVar, '" != "skipped" ]]; then'].join(""),
    );
    expect(ciWorkflow).toContain(
      ["if: $", "{{ needs.changes.outputs.lightweight_only != 'true' }}"].join(""),
    );

    const pullRequestTrigger = e2eWorkflow.slice(
      e2eWorkflow.indexOf("  pull_request:"),
      e2eWorkflow.indexOf("  workflow_dispatch:"),
    );
    expect(pullRequestTrigger).not.toContain("paths:");
    expect(pullRequestTrigger).not.toContain("paths-ignore:");

    const summary = formatClassificationSummary({
      changeClass: "release_bump",
      e2eClass: "e2e_skip",
      files: ["package.json"],
      lightweightOnly: true,
      workspaceTuiClass: "tui_skip",
    });
    expect(summary).toContain("lightweight_only=true");
    expect(summary).toContain("change_class=release_bump");
    expect(summary).toContain("e2e_class=e2e_skip");
    expect(summary).toContain("e2e_run_web=false");
    expect(summary).toContain("e2e_run_shell=false");
    expect(summary).toContain("workspace_tui_class=tui_skip");
    expect(summary).toContain("workspace_tui=false");
  });

  test("[CI-LIGHTWEIGHT-005] classifier CLI writes GitHub outputs for a release-bump file list", () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-ci-classify-"));
    const filesPath = join(directory, "changed-files.txt");
    const outputPath = join(directory, "github-output.txt");
    writeFileSync(filesPath, `${releaseBumpPrFiles.join("\n")}\n`);

    const result = Bun.spawnSync(["bun", classifierPath], {
      cwd: root,
      env: {
        ...process.env,
        CHANGED_FILES_PATH: filesPath,
        GITHUB_OUTPUT: outputPath,
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const output = readFileSync(outputPath, "utf8");
    expect(output).toContain("lightweight_only=true");
    expect(output).toContain("change_class=release_bump");
    expect(output).toContain("e2e_class=e2e_skip");
    expect(output).toContain("e2e_run_web=false");
    expect(output).toContain("e2e_run_shell=false");
    expect(output).toContain("workspace_tui_class=tui_skip");
    expect(output).toContain("workspace_tui=false");
    rmSync(directory, { force: true, recursive: true });
  });

  test("[CI-E2E-SCOPE-001] isolated apps/web files run WebView only", () => {
    const webOnlySets = [
      ["apps/web/src/routes/+page.svelte"],
      ["apps/web/src/lib/console/header-switcher.test.ts", "docs/TESTING.md"],
      ["apps/web/test/e2e-webview/home.webview.test.ts", "apps/web/package.json"],
      ["apps/web/static/favicon.svg", "LICENSE"],
    ];

    for (const files of webOnlySets) {
      const productFiles = files.filter((file) => !isDocsOnlyPath(file));
      expect(productFiles.every((file) => isWebIsolatedE2ePath(file))).toBe(true);
      expect(classifyChangedFiles(files)).toMatchObject({
        changeClass: "full",
        e2eClass: "e2e_web",
        lightweightOnly: false,
      });
      expect(e2eNeedsWebView("e2e_web")).toBe(true);
      expect(e2eNeedsShell("e2e_web")).toBe(false);
      expect(e2eNeedsBackend("e2e_web")).toBe(false);
      expect(e2eNeedsShardWork("e2e_web", 1)).toBe(true);
      expect(e2eNeedsShardWork("e2e_web", 2)).toBe(false);
    }
  });

  test("[CI-E2E-SCOPE-002] isolated shell CLI e2e files run shell shards only", () => {
    const shellOnlySets = [
      ["apps/shell/test/e2e/certificates.command.e2e.ts"],
      [
        "apps/shell/test/e2e/server-register.command.e2e.ts",
        "apps/shell/test/e2e/domain-bindings.command.e2e.ts",
        "docs/TESTING.md",
      ],
    ];

    for (const files of shellOnlySets) {
      const productFiles = files.filter((file) => !isDocsOnlyPath(file));
      expect(productFiles.every((file) => isShellIsolatedE2ePath(file))).toBe(true);
      expect(classifyChangedFiles(files)).toMatchObject({
        changeClass: "full",
        e2eClass: "e2e_shell",
        lightweightOnly: false,
      });
      expect(e2eNeedsWebView("e2e_shell")).toBe(false);
      expect(e2eNeedsShell("e2e_shell")).toBe(true);
      expect(e2eNeedsBackend("e2e_shell")).toBe(true);
      expect(e2eNeedsShardWork("e2e_shell", 1)).toBe(true);
      expect(e2eNeedsShardWork("e2e_shell", 2)).toBe(true);
    }
  });

  test("[CI-E2E-SCOPE-003] mixed web+product, empty diffs, and force stay full E2E", () => {
    const fullSets = [
      ["apps/shell/test/e2e/certificates.command.e2e.ts", "apps/web/src/routes/+page.svelte"],
      ["apps/web/src/routes/+page.svelte", "package.json"],
      ["apps/web/src/routes/+page.svelte", "packages/core/src/index.ts"],
    ];

    for (const files of fullSets) {
      expect(classifyChangedFiles(files)).toMatchObject({
        changeClass: "full",
        e2eClass: "e2e_full",
        lightweightOnly: false,
      });
    }

    expect(classifyChangedFiles([])).toMatchObject({
      changeClass: "full",
      e2eClass: "e2e_full",
      lightweightOnly: false,
    });
    expect(
      classifyChangedFiles(["packages/adapters/cli/src/setup-help.ts"], { forceE2eFull: true }),
    ).toMatchObject({
      changeClass: "full",
      e2eClass: "e2e_full",
      lightweightOnly: false,
    });
    expect(classifyChangedFiles(docsOnlyPrFiles, { forceE2eFull: true })).toMatchObject({
      changeClass: "docs_only",
      e2eClass: "e2e_full",
      lightweightOnly: true,
    });
    expect(e2eNeedsWebView("e2e_full")).toBe(true);
    expect(e2eNeedsShell("e2e_full")).toBe(true);
    expect(e2eNeedsBackend("e2e_full")).toBe(true);
    expect(e2eNeedsShardWork("e2e_full", 1)).toBe(true);
    expect(e2eNeedsShardWork("e2e_full", 2)).toBe(true);
    expect(e2eNeedsShardWork("e2e_skip", 1)).toBe(false);
    expect(e2eNeedsShardWork("e2e_skip", 2)).toBe(false);
  });

  test("[CI-E2E-SCOPE-005] CLI, setup-help, and inquire-only files are e2e_shell without web", () => {
    const setupHelpFiles = [
      "apps/shell/src/index.ts",
      "apps/shell/test/help-without-runtime.test.ts",
      "apps/shell/test/occupancy-tui-first-frame.test.ts",
      "packages/adapters/cli/package.json",
      "packages/adapters/cli/src/index.ts",
      "packages/adapters/cli/src/remote-cli-program.ts",
      "packages/adapters/cli/src/setup-help.ts",
      "packages/adapters/cli/src/standalone-control-plane.ts",
      "packages/adapters/cli/test/setup-help.test.ts",
      "packages/adapters/cli/test/standalone-control-plane.test.ts",
      "packages/adapters/cli/test/user-visible-occupancy-forbidden.test.ts",
    ];
    const inquireFiles = [
      "apps/shell/src/index.ts",
      "apps/shell/src/occupancy-cli-progress.ts",
      "apps/shell/src/occupancy-tui-first-frame.ts",
      "apps/shell/test/occupancy-cli-progress.test.ts",
      "apps/shell/test/occupancy-tui-first-frame.test.ts",
      "packages/adapters/cli/src/commands/agent-workspace.ts",
      "packages/adapters/cli/src/runtime.ts",
      "packages/adapters/cli/src/workspace-tui-launch.ts",
      "packages/adapters/cli/test/agent-workspace-command.test.ts",
      "packages/adapters/cli/test/workspace-control-renderer.test.ts",
      "packages/adapters/cli/test/workspace-tui-launch.test.ts",
      "skills/appaloft/references/cli-entrypoints.md",
    ];
    const shellOnlySets = [
      setupHelpFiles,
      inquireFiles,
      ["packages/adapters/cli/src/commands/deployment.ts"],
      ["packages/core/src/index.ts"],
      ["apps/shell/src/index.ts"],
      ["apps/shell/test/e2e/support/shell-e2e-fixture.ts"],
      ["apps/shell/test/help-without-runtime.test.ts"],
      ["bun.lock"],
      ["scripts/ci/classify-changed-files.ts"],
      ["scripts/test/wait-for-http.ts"],
      ["apps/desktop/src-tauri/src/main.rs"],
      [".github/actions/setup-bun-turbo/action.yml"],
      ["apps/shell/package.json"],
    ];

    for (const files of shellOnlySets) {
      expect(classifyChangedFiles(files)).toMatchObject({
        changeClass: "full",
        e2eClass: "e2e_shell",
        lightweightOnly: false,
      });
      expect(e2eNeedsWebView("e2e_shell")).toBe(false);
      expect(e2eNeedsShell("e2e_shell")).toBe(true);
      expect(e2eNeedsBackend("e2e_shell")).toBe(true);
    }

    expect(classifyChangedFiles(inquireFiles)).toMatchObject({
      workspaceTuiClass: "tui_full",
    });
    expect(classifyChangedFiles(setupHelpFiles)).toMatchObject({
      workspaceTuiClass: "tui_skip",
    });
  });

  test("[CI-UNIT-SCOPE-001] CLI-only files still publish Unit Tests without WebView e2e", () => {
    const cliOnly = ["packages/adapters/cli/src/commands/deployment.ts"];
    expect(classifyChangedFiles(cliOnly)).toMatchObject({
      changeClass: "full",
      e2eClass: "e2e_shell",
      lightweightOnly: false,
      workspaceTuiClass: "tui_skip",
    });

    const unitTestsJob = ciWorkflow.slice(
      ciWorkflow.indexOf("  unit-tests:"),
      ciWorkflow.indexOf("  integration-tests:"),
    );
    expect(unitTestsJob).toMatch(/^ {4}name: Unit Tests\s*$/m);
    expect(unitTestsJob).not.toMatch(/^ {4}if:/m);
    expect(unitTestsJob).toContain("run: bun run test");
    expect(unitTestsJob).not.toMatch(/\btest:e2e(?::webview)?\b/);
    expect(ciWorkflow).toContain("name: ci");
    expect(e2eWorkflow).toContain("name: Web WebView Smoke");
    expect(e2eWorkflow).toContain("run: bun run test:e2e");

    const webPackageJson = JSON.parse(
      readFileSync(join(root, "apps/web/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(webPackageJson.scripts?.test).toBe("bun run test:unit -- --run");
    expect(webPackageJson.scripts?.test).not.toMatch(/\btest:e2e(?::webview)?\b/);
    expect(webPackageJson.scripts?.["test:e2e"]).toBeTruthy();
    expect(webPackageJson.scripts?.["test:e2e:webview"]).toBeTruthy();
  });

  test("[CI-E2E-SCOPE-004] e2e.yml keeps required shard names and scopes suites inside those jobs", () => {
    expect(e2eWorkflow).toContain("  e2e:");
    expect(e2eWorkflow).toContain("shard: [1, 2]");
    expect(e2eWorkflow).toContain("shard_total: [2]");
    expect(e2eWorkflow).toContain("name: Skip E2E");
    expect(e2eWorkflow).toContain("name: Decide shard work");
    expect(e2eWorkflow).toContain("name: Start Postgres");
    expect(e2eWorkflow).toContain("name: Web WebView Smoke");
    expect(e2eWorkflow).toContain("name: Shell CLI + HTTP E2E");
    expect(e2eWorkflow).not.toContain("e2e-skip:");
    expect(e2eWorkflow).not.toMatch(/^ {4}services:\s*$/m);
    expect(e2eWorkflow).toContain("e2e_run_web");
    expect(e2eWorkflow).toContain("e2e_run_shell");
    expect(e2eWorkflow).toContain("steps.shard.outputs.need_web == 'true'");
    expect(e2eWorkflow).toContain("steps.shard.outputs.need_shell == 'true'");
    expect(e2eWorkflow).toContain(`if: ${expression("steps.shard.outputs.need_work != 'true'")}`);

    const e2eJob = e2eWorkflow.slice(e2eWorkflow.indexOf("  e2e:"));
    expect(e2eJob).not.toMatch(/^ {4}if:/m);
    expect(e2eJob).not.toContain("draft == false");
    expect(e2eWorkflow).toContain("FORCE_E2E_FULL");
    expect(e2eJob).toContain(`if: ${expression("steps.shard.outputs.need_web == 'true'")}`);
    expect(e2eJob).toContain(`if: ${expression("steps.shard.outputs.need_shell == 'true'")}`);

    const pullRequestTrigger = e2eWorkflow.slice(
      e2eWorkflow.indexOf("  pull_request:"),
      e2eWorkflow.indexOf("  workflow_dispatch:"),
    );
    expect(pullRequestTrigger).not.toContain("paths:");
    expect(pullRequestTrigger).not.toContain("paths-ignore:");
  });

  test("[CI-TUI-SCOPE-001] web-only, docs-only, and unrelated product files skip TUI work", () => {
    const skipSets = [
      docsOnlyPrFiles,
      releaseBumpPrFiles,
      ["apps/web/src/routes/+page.svelte"],
      ["apps/shell/test/e2e/certificates.command.e2e.ts"],
      ["packages/core/src/index.ts"],
      ["packages/application/src/tokens.ts"],
      ["apps/shell/src/index.ts"],
      ["bun.lock"],
      ["apps/desktop/src-tauri/src/main.rs"],
      ["packages/adapters/cli/src/commands/deployment.ts"],
    ];

    for (const files of skipSets) {
      expect(classifyChangedFiles(files)).toMatchObject({
        workspaceTuiClass: "tui_skip",
      });
    }

    expect(workspaceTuiRequired("tui_skip")).toBe(false);
  });

  test("[CI-TUI-SCOPE-002] TUI crate, bridge, packaging, empty, and shared rust stay tui_full", () => {
    const runSets = [
      ["apps/workspace-control-tui/src/main.rs"],
      ["apps/workspace-control-tui/Cargo.lock"],
      ["packages/adapters/cli/src/workspace-control-renderer.ts"],
      ["packages/adapters/cli/src/workspace-tui-launch.ts"],
      ["packages/adapters/cli/test/workspace-control-presentation.test.ts"],
      ["packages/adapters/cli/test/workspace-tui-launch.test.ts"],
      ["packages/adapters/cli/src/commands/agent-workspace.ts"],
      ["packages/adapters/cli/test/agent-workspace-command.test.ts"],
      ["scripts/release/lib/binary-bundle.ts"],
      ["scripts/test/workspace-control-packaged-tui.ts"],
      ["rust-toolchain.toml"],
      ["Cargo.lock"],
      [],
    ];

    for (const files of runSets) {
      if (files.length > 0) {
        expect(files.every((file) => isWorkspaceTuiPath(file))).toBe(true);
      }
      expect(classifyChangedFiles(files)).toMatchObject({
        workspaceTuiClass: "tui_full",
      });
    }

    expect(workspaceTuiRequired("tui_full")).toBe(true);
    expect(
      classifyChangedFiles([
        "apps/web/src/routes/+page.svelte",
        "apps/workspace-control-tui/src/lib.rs",
      ]),
    ).toMatchObject({
      e2eClass: "e2e_full",
      workspaceTuiClass: "tui_full",
    });
  });

  test("[CI-TUI-SCOPE-003] workspace-tui keeps all six names and skips work inside the jobs", () => {
    expect(ciWorkflow).toContain("  workspace-tui:");
    expect(ciWorkflow).toContain(`name: Workspace TUI (${expression("matrix.target")})`);
    expect(ciWorkflow).toContain("name: Skip Workspace TUI");
    expect(ciWorkflow).toContain("target: darwin-arm64");
    expect(ciWorkflow).toContain("target: darwin-x64");
    expect(ciWorkflow).toContain("target: linux-arm64-gnu");
    expect(ciWorkflow).toContain("target: linux-x64-gnu");
    expect(ciWorkflow).toContain("target: linux-arm64-musl");
    expect(ciWorkflow).toContain("target: linux-x64-musl");
    expect(ciWorkflow).toContain("workspace_tui");
    expect(ciWorkflow).toContain(
      `if: ${expression("needs.changes.outputs.workspace_tui != 'true'")}`,
    );
    expect(ciWorkflow).toContain(
      `if: ${expression("needs.changes.outputs.workspace_tui == 'true'")}`,
    );
    expect(ciWorkflow).toContain("name: ci");

    const tuiJob = ciWorkflow.slice(
      ciWorkflow.indexOf("  workspace-tui:"),
      ciWorkflow.indexOf("  build-smoke:"),
    );
    expect(tuiJob).not.toMatch(/^ {4}if:/m);
    expect(tuiJob).toContain("name: Skip Workspace TUI");
  });
});
