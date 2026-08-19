export type ChangeClass = "docs_only" | "release_bump" | "full";

export interface ChangeClassification {
  readonly changeClass: ChangeClass;
  readonly files: readonly string[];
  readonly lightweightOnly: boolean;
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

export function classifyChangedFiles(
  files: readonly string[],
  options: ClassifyChangedFilesOptions = {},
): ChangeClassification {
  const normalized = uniqueSortedFiles(files);
  const releasePleaseBranch = isReleasePleaseHeadRef(options.headRef ?? "");

  if (normalized.length === 0) {
    if (releasePleaseBranch) {
      return {
        changeClass: "release_bump",
        files: normalized,
        lightweightOnly: true,
      };
    }

    return {
      changeClass: "full",
      files: normalized,
      lightweightOnly: false,
    };
  }

  if (!normalized.every((file) => isLightweightPath(file))) {
    return {
      changeClass: "full",
      files: normalized,
      lightweightOnly: false,
    };
  }

  if (normalized.some((file) => isReleaseBumpPath(file)) || releasePleaseBranch) {
    return {
      changeClass: "release_bump",
      files: normalized,
      lightweightOnly: true,
    };
  }

  return {
    changeClass: "docs_only",
    files: normalized,
    lightweightOnly: true,
  };
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
  ]);
  await writeGitHubLines(envValue("GITHUB_STEP_SUMMARY") || undefined, [
    formatClassificationSummary(classification),
  ]);

  console.log(`Classified ${classification.files.length} files via ${classifyScriptPath}.`);
  console.log(`change_class=${classification.changeClass}`);
  console.log(`lightweight_only=${classification.lightweightOnly}`);
  for (const file of classification.files) {
    console.log(file);
  }
}

if (import.meta.main) {
  await main();
}
