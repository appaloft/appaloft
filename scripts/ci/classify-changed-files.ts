export type ChangeClass = "docs_only" | "release_bump" | "full";
export type E2eClass = "e2e_skip" | "e2e_web" | "e2e_shell" | "e2e_full";
export type WorkspaceTuiClass = "tui_skip" | "tui_full";

export interface ChangeClassification {
  readonly changeClass: ChangeClass;
  readonly e2eClass: E2eClass;
  readonly files: readonly string[];
  readonly lightweightOnly: boolean;
  readonly workspaceTuiClass: WorkspaceTuiClass;
}

export interface ClassifyChangedFilesOptions {
  readonly headRef?: string;
}

export interface ChangedFilesLookupInput {
  readonly baseRef: string;
  readonly beforeSha: string;
  readonly defaultBranch: string;
  readonly eventName: string;
  readonly headSha: string;
}

export type ChangedFilesLookupPlan =
  | { readonly fetchRef: string; readonly mode: "three-dot"; readonly spec: string }
  | { readonly from: string; readonly mode: "two-dot"; readonly to: string }
  | { readonly mode: "unborn-or-all-files" };

export const releaseBumpExactFiles = [
  ".github/.release-please-manifest.json",
  "apps/desktop/src-tauri/Cargo.toml",
  "apps/desktop/src-tauri/tauri.conf.json",
  "package.json",
] as const;

const zeroSha = "0000000000000000000000000000000000000000";
const classifyScriptPath = "scripts/ci/classify-changed-files.ts";

export function isDocsOnlyPath(file: string): boolean {
  return (
    file.startsWith(".github/workflows/") ||
    file.startsWith("docs/") ||
    file.endsWith(".md") ||
    file.endsWith(".mdx") ||
    file === "LICENSE" ||
    file.startsWith("LICENSE.")
  );
}

export function isReleaseBumpPath(file: string): boolean {
  return (releaseBumpExactFiles as readonly string[]).includes(file);
}

export function isReleasePleaseHeadRef(headRef: string): boolean {
  return headRef.startsWith("release-please--");
}

export function isLightweightPath(file: string): boolean {
  return isDocsOnlyPath(file) || isReleaseBumpPath(file);
}

// Isolated WebView surface: the static console and its mocked WebView harness.
// WebView E2E starts Vite preview plus Bun.serve fixtures and does not use the
// Appaloft backend or PostgreSQL. Shell CLI E2E does not exercise console UI.
export function isWebIsolatedE2ePath(file: string): boolean {
  return file === "apps/web" || file.startsWith("apps/web/");
}

export function isShellIsolatedE2ePath(file: string): boolean {
  return /^apps\/shell\/test\/e2e\/[^/]+\.e2e\.ts$/.test(file);
}

export function e2eNeedsWebView(e2eClass: E2eClass): boolean {
  return e2eClass === "e2e_web" || e2eClass === "e2e_full";
}

export function e2eNeedsShell(e2eClass: E2eClass): boolean {
  return e2eClass === "e2e_shell" || e2eClass === "e2e_full";
}

export function e2eNeedsBackend(e2eClass: E2eClass): boolean {
  return e2eNeedsShell(e2eClass);
}

export function e2eNeedsShardWork(e2eClass: E2eClass, shard: number): boolean {
  return e2eNeedsShell(e2eClass) || (e2eNeedsWebView(e2eClass) && shard === 1);
}

const workspaceTuiPackagingPaths = [
  "scripts/release/build-binary-bundle.ts",
  "scripts/release/lib/binary-bundle.ts",
  "scripts/release/lib/targets.ts",
  "scripts/release/prepare-npm-packages.ts",
  "scripts/test/binary-bundle.test.ts",
  "scripts/test/workspace-control-host-terminal.ts",
  "scripts/test/workspace-control-packaged-tui.ts",
] as const;

export function isWorkspaceTuiPath(file: string): boolean {
  if (file === "apps/workspace-control-tui" || file.startsWith("apps/workspace-control-tui/")) {
    return true;
  }

  if (
    file === "Cargo.lock" ||
    file === "Cargo.toml" ||
    file === "rust-toolchain" ||
    file === "rust-toolchain.toml" ||
    file === "rustfmt.toml" ||
    file === ".rustfmt.toml"
  ) {
    return true;
  }

  if (
    file.startsWith("packages/adapters/cli/src/workspace-control-") ||
    file.startsWith("packages/adapters/cli/src/workspace-tui-") ||
    file.startsWith("packages/adapters/cli/test/workspace-control-") ||
    file.startsWith("packages/adapters/cli/test/workspace-tui-") ||
    file === "packages/adapters/cli/src/commands/agent-workspace.ts" ||
    file === "packages/adapters/cli/test/agent-workspace-command.test.ts"
  ) {
    return true;
  }

  return (workspaceTuiPackagingPaths as readonly string[]).includes(file);
}

export function workspaceTuiRequired(workspaceTuiClass: WorkspaceTuiClass): boolean {
  return workspaceTuiClass === "tui_full";
}

export function classifyWorkspaceTuiClass(
  files: readonly string[],
  changeClass: ChangeClass,
): WorkspaceTuiClass {
  if (changeClass === "docs_only" || changeClass === "release_bump") {
    return "tui_skip";
  }

  if (files.length === 0) {
    return "tui_full";
  }

  const tuiRelevant = files.filter((file) => !isDocsOnlyPath(file));
  if (tuiRelevant.length === 0) {
    return "tui_skip";
  }

  if (tuiRelevant.some((file) => isWorkspaceTuiPath(file))) {
    return "tui_full";
  }

  return "tui_skip";
}

export function classifyE2eClass(files: readonly string[], changeClass: ChangeClass): E2eClass {
  if (changeClass === "docs_only" || changeClass === "release_bump") {
    return "e2e_skip";
  }

  if (files.length === 0) {
    return "e2e_full";
  }

  const e2eRelevant = files.filter((file) => !isDocsOnlyPath(file));
  if (e2eRelevant.length === 0) {
    return "e2e_skip";
  }

  if (e2eRelevant.every((file) => isWebIsolatedE2ePath(file))) {
    return "e2e_web";
  }

  if (e2eRelevant.every((file) => isShellIsolatedE2ePath(file))) {
    return "e2e_shell";
  }

  return "e2e_full";
}

function classificationFor(
  changeClass: ChangeClass,
  files: readonly string[],
  lightweightOnly: boolean,
): ChangeClassification {
  return {
    changeClass,
    e2eClass: classifyE2eClass(files, changeClass),
    files,
    lightweightOnly,
    workspaceTuiClass: classifyWorkspaceTuiClass(files, changeClass),
  };
}

export function classifyChangedFiles(
  files: readonly string[],
  options: ClassifyChangedFilesOptions = {},
): ChangeClassification {
  const normalized = uniqueSortedFiles(files);
  const releasePleaseBranch = isReleasePleaseHeadRef(options.headRef ?? "");

  if (normalized.length === 0) {
    if (releasePleaseBranch) {
      return classificationFor("release_bump", normalized, true);
    }

    return classificationFor("full", normalized, false);
  }

  if (!normalized.every((file) => isLightweightPath(file))) {
    return classificationFor("full", normalized, false);
  }

  if (normalized.some((file) => isReleaseBumpPath(file)) || releasePleaseBranch) {
    return classificationFor("release_bump", normalized, true);
  }

  return classificationFor("docs_only", normalized, true);
}

export function planChangedFilesLookup(input: ChangedFilesLookupInput): ChangedFilesLookupPlan {
  if (input.eventName === "pull_request" || input.eventName === "workflow_dispatch") {
    const ref = input.eventName === "pull_request" ? input.baseRef : input.defaultBranch;
    if (ref.length === 0) {
      throw new Error(
        input.eventName === "pull_request"
          ? "BASE_REF is required to classify a pull_request event."
          : "DEFAULT_BRANCH is required to classify a workflow_dispatch event.",
      );
    }

    return {
      fetchRef: ref,
      mode: "three-dot",
      spec: `origin/${ref}...HEAD`,
    };
  }

  if (input.beforeSha.length > 0 && input.beforeSha !== zeroSha) {
    return {
      from: input.beforeSha,
      mode: "two-dot",
      to: input.headSha.length > 0 ? input.headSha : "HEAD",
    };
  }

  return { mode: "unborn-or-all-files" };
}

export function formatClassificationSummary(classification: ChangeClassification): string {
  const fileLines =
    classification.files.length === 0
      ? "- _(none)_"
      : classification.files.map((file) => `- \`${file}\``).join("\n");

  return [
    "### Changed files",
    fileLines,
    "",
    `change_class=${classification.changeClass}`,
    `lightweight_only=${classification.lightweightOnly}`,
    `e2e_class=${classification.e2eClass}`,
    `e2e_run_web=${e2eNeedsWebView(classification.e2eClass)}`,
    `e2e_run_shell=${e2eNeedsShell(classification.e2eClass)}`,
    `workspace_tui_class=${classification.workspaceTuiClass}`,
    `workspace_tui=${workspaceTuiRequired(classification.workspaceTuiClass)}`,
    "",
  ].join("\n");
}

function uniqueSortedFiles(files: readonly string[]): string[] {
  return [...new Set(files.map((file) => file.trim()).filter((file) => file.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function runGit(args: readonly string[]): { readonly stderr: string; readonly stdout: string } {
  const result = Bun.spawnSync(["git", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${stderr || stdout}`);
  }

  return { stderr, stdout };
}

function parseNameOnly(stdout: string): string[] {
  return uniqueSortedFiles(stdout.split("\n"));
}

function envValue(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function listChangedFiles(): string[] {
  const plan = planChangedFilesLookup({
    baseRef: envValue("BASE_REF"),
    beforeSha: envValue("BEFORE_SHA"),
    defaultBranch: envValue("DEFAULT_BRANCH") || "main",
    eventName: envValue("GITHUB_EVENT_NAME"),
    headSha: envValue("GITHUB_SHA"),
  });

  if (plan.mode === "three-dot") {
    runGit(["fetch", "origin", plan.fetchRef, "--no-tags"]);
    return parseNameOnly(runGit(["diff", "--name-only", plan.spec]).stdout);
  }

  if (plan.mode === "two-dot") {
    return parseNameOnly(runGit(["diff", "--name-only", plan.from, plan.to]).stdout);
  }

  try {
    return parseNameOnly(runGit(["diff", "--name-only", "HEAD^", "HEAD"]).stdout);
  } catch {
    return parseNameOnly(runGit(["ls-files"]).stdout);
  }
}

async function writeGitHubLines(path: string | undefined, lines: readonly string[]): Promise<void> {
  if (!path) {
    return;
  }

  const existing = await Bun.file(path)
    .text()
    .catch(() => "");
  await Bun.write(path, `${existing}${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  const filesFrom = envValue("CHANGED_FILES_PATH");
  const files = filesFrom ? parseNameOnly(await Bun.file(filesFrom).text()) : listChangedFiles();
  const classification = classifyChangedFiles(files, { headRef: envValue("HEAD_REF") });

  await writeGitHubLines(envValue("GITHUB_OUTPUT") || undefined, [
    `lightweight_only=${classification.lightweightOnly}`,
    `change_class=${classification.changeClass}`,
    `e2e_class=${classification.e2eClass}`,
    `e2e_run_web=${e2eNeedsWebView(classification.e2eClass)}`,
    `e2e_run_shell=${e2eNeedsShell(classification.e2eClass)}`,
    `workspace_tui_class=${classification.workspaceTuiClass}`,
    `workspace_tui=${workspaceTuiRequired(classification.workspaceTuiClass)}`,
  ]);
  await writeGitHubLines(envValue("GITHUB_STEP_SUMMARY") || undefined, [
    formatClassificationSummary(classification),
  ]);

  console.log(`Classified ${classification.files.length} files via ${classifyScriptPath}.`);
  console.log(`change_class=${classification.changeClass}`);
  console.log(`lightweight_only=${classification.lightweightOnly}`);
  console.log(`e2e_class=${classification.e2eClass}`);
  console.log(`e2e_run_web=${e2eNeedsWebView(classification.e2eClass)}`);
  console.log(`e2e_run_shell=${e2eNeedsShell(classification.e2eClass)}`);
  console.log(`workspace_tui_class=${classification.workspaceTuiClass}`);
  console.log(`workspace_tui=${workspaceTuiRequired(classification.workspaceTuiClass)}`);
  for (const file of classification.files) {
    console.log(file);
  }
}

if (import.meta.main) {
  await main();
}
