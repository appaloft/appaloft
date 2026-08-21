const zeroSha = "0000000000000000000000000000000000000000";

const lintableExtensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"] as const;
const formattableExtensions = [
  ...lintableExtensions,
  ".json",
  ".jsonc",
  ".css",
  ".html",
  ".graphql",
  ".gql",
] as const;

const ignoredPathFragments = [
  "/node_modules/",
  "/.git/",
  "/.turbo/",
  "/.astro/",
  "/.svelte-kit/",
  "/.next/",
  "/build/",
  "/dist/",
  "/coverage/",
  "/test-results/",
  "/playwright-report/",
  "/runtime/",
  "/.appaloft/",
  "/.tmp/",
  "apps/workspace-control-tui/",
  "apps/desktop/src-tauri/",
] as const;

const ignoredExactFiles = ["bun.lock", "Cargo.lock"] as const;

export function isIgnoredToolchainPath(file: string): boolean {
  const normalized = file.replaceAll("\\", "/");
  if ((ignoredExactFiles as readonly string[]).includes(normalized)) {
    return true;
  }

  const haystack = `/${normalized}/`;
  return ignoredPathFragments.some((fragment) => haystack.includes(fragment));
}

export function hasExtension(file: string, extensions: readonly string[]): boolean {
  const normalized = file.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  const name = slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }

  return extensions.includes(name.slice(dot));
}

export function isLintablePath(file: string): boolean {
  return !isIgnoredToolchainPath(file) && hasExtension(file, lintableExtensions);
}

export function isFormattablePath(file: string): boolean {
  return !isIgnoredToolchainPath(file) && hasExtension(file, formattableExtensions);
}

export function selectLintTargets(files: readonly string[]): string[] {
  return uniqueSorted(files.filter((file) => isLintablePath(file)));
}

export function selectFormatTargets(files: readonly string[]): string[] {
  return uniqueSorted(files.filter((file) => isFormattablePath(file)));
}

export function resolveLintBaseRef(input: {
  readonly baseRef?: string;
  readonly beforeSha?: string;
  readonly defaultBranch?: string;
  readonly eventName?: string;
  readonly refExists: (ref: string) => boolean;
}): string {
  const eventName = input.eventName ?? "";
  if (eventName === "pull_request" || eventName === "workflow_dispatch") {
    const branch = input.baseRef || input.defaultBranch || "main";
    if (branch.length === 0) {
      throw new Error("Unable to resolve a lint base ref for this GitHub event; failing closed.");
    }

    const remote = `origin/${branch}`;
    if (input.refExists(remote)) {
      return remote;
    }

    if (input.refExists(branch)) {
      return branch;
    }

    throw new Error(`Unable to resolve lint base ref '${branch}'; failing closed.`);
  }

  if (eventName === "push") {
    const beforeSha = input.beforeSha ?? "";
    if (beforeSha.length > 0 && beforeSha !== zeroSha && input.refExists(beforeSha)) {
      return beforeSha;
    }

    throw new Error("Unable to resolve a push lint base SHA; failing closed.");
  }

  for (const candidate of ["origin/main", "main"]) {
    if (input.refExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to resolve origin/main or main as a lint base; failing closed.");
}

function uniqueSorted(files: readonly string[]): string[] {
  return [...new Set(files.map((file) => file.trim()).filter((file) => file.length > 0))].sort(
    (left, right) => left.localeCompare(right),
  );
}

function envValue(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function runGit(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${stderr || stdout}`);
  }

  return stdout;
}

function refExists(ref: string): boolean {
  const result = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", ref], {
    stderr: "pipe",
    stdout: "pipe",
  });
  return result.exitCode === 0;
}

function listChangedFiles(base: string): string[] {
  const spec = `${base}...HEAD`;
  return uniqueSorted([
    ...runGit(["diff", "--name-only", spec]).split("\n"),
    ...runGit(["diff", "--name-only"]).split("\n"),
    ...runGit(["diff", "--name-only", "--cached"]).split("\n"),
    ...runGit(["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ]);
}

function binPath(name: string): string {
  return `${process.cwd()}/node_modules/.bin/${name}`;
}

function runTool(name: string, args: readonly string[]): void {
  const result = Bun.spawnSync([binPath(name), ...args], {
    stderr: "inherit",
    stdout: "inherit",
  });
  if (result.exitCode !== 0) {
    process.exit(result.exitCode ?? 1);
  }
}

export function main(filesFromGit: readonly string[]): void {
  const lintTargets = selectLintTargets(filesFromGit);
  const formatTargets = selectFormatTargets(filesFromGit);

  if (lintTargets.length === 0 && formatTargets.length === 0) {
    console.log("No lintable or formattable JS/TS files changed; skipping oxlint/oxfmt.");
    return;
  }

  if (lintTargets.length > 0) {
    console.log(`oxlint ${lintTargets.length} changed file(s)`);
    runTool("oxlint", lintTargets);
  } else {
    console.log("No lintable JS/TS files changed; skipping oxlint.");
  }

  if (formatTargets.length > 0) {
    console.log(`oxfmt --check ${formatTargets.length} changed file(s)`);
    runTool("oxfmt", ["--check", ...formatTargets]);
  } else {
    console.log("No formattable files changed; skipping oxfmt.");
  }
}

if (import.meta.main) {
  const eventName = envValue("GITHUB_EVENT_NAME");
  if (eventName === "pull_request" || eventName === "workflow_dispatch") {
    const fetchRef = envValue("BASE_REF") || envValue("DEFAULT_BRANCH") || "main";
    try {
      runGit(["fetch", "origin", fetchRef, "--no-tags"]);
    } catch (error) {
      throw new Error(
        `Failed to fetch origin/${fetchRef} for fail-closed changed-file lint.\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const base = resolveLintBaseRef({
    baseRef: envValue("BASE_REF"),
    beforeSha: envValue("BEFORE_SHA"),
    defaultBranch: envValue("DEFAULT_BRANCH"),
    eventName,
    refExists,
  });
  console.log(`Linting changed files against ${base}`);
  main(listChangedFiles(base));
}
