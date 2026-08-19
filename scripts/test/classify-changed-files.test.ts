import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  classifyChangedFiles,
  formatClassificationSummary,
  isDocsOnlyPath,
  isLightweightPath,
  isReleaseBumpPath,
  planChangedFilesLookup,
  releaseBumpExactFiles,
} from "../ci/classify-changed-files";

const root = resolve(import.meta.dir, "../..");
const ciWorkflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const e2eWorkflow = readFileSync(join(root, ".github/workflows/e2e.yml"), "utf8");
const classifierPath = "scripts/ci/classify-changed-files.ts";

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
      files: [...docsOnlyPrFiles].sort((left, right) => left.localeCompare(right)),
      lightweightOnly: true,
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
      files: [...releaseBumpPrFiles].sort((left, right) => left.localeCompare(right)),
      lightweightOnly: true,
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
      files: ["package.json"],
      lightweightOnly: true,
    });
    expect(summary).toContain("lightweight_only=true");
    expect(summary).toContain("change_class=release_bump");
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
    rmSync(directory, { force: true, recursive: true });
  });
});
