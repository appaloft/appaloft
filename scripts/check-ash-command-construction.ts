import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export interface AshCommandConstructionViolation {
  readonly file: string;
  readonly line: number;
  readonly rule:
    | "ash-import-required"
    | "no-handwritten-shell-quoting"
    | "no-plain-shell-command-type"
    | "no-string-built-shell-script"
    | "render-before-shell-execution";
  readonly message: string;
}

interface Rule {
  readonly rule: AshCommandConstructionViolation["rule"];
  readonly pattern: RegExp;
  readonly message: string;
  readonly shellOwnerOnly?: boolean;
}

export const ashCommandConstructionSourceGlobs = [
  "apps/*/src/**/*.ts",
  "packages/*/src/**/*.ts",
  "packages/providers/*/src/**/*.ts",
] as const;

const rules: readonly Rule[] = [
  {
    rule: "no-handwritten-shell-quoting",
    pattern: /(?:function|const)\s+shellQuote(?:Path)?\b/gu,
    message: "Use ash.arg(), ash.env(), or ash.list() instead of a local shell quote helper.",
  },
  {
    rule: "no-plain-shell-command-type",
    pattern: /\bcommand\s*:\s*string\b/gu,
    message: "Shell command interfaces must accept AshScript, not string.",
    shellOwnerOnly: true,
  },
  {
    rule: "no-string-built-shell-script",
    pattern:
      /(?:const|let)\s+\w*command\w*\s*=\s*\[[\s\S]{0,2400}?\.join\((?:"\\n"|'\\n'|`\\n`)\)|command\s*:\s*\[[\s\S]{0,2400}?\.join\((?:"\\n"|'\\n'|`\\n`)\)/gu,
    message: "Build executable shell scripts with the ash tagged template.",
  },
  {
    rule: "render-before-shell-execution",
    pattern: /\[(?:"sh"|'sh'),\s*(?:"-lc"|'-lc'),\s*(?:command|script|shellCommand)\b/gu,
    message: "Render an AshScript explicitly before passing it to sh -lc.",
  },
];

export function findAshCommandConstructionViolations(
  file: string,
  source: string,
): AshCommandConstructionViolation[] {
  const violations: AshCommandConstructionViolation[] = [];

  if (
    (source.includes("ash`") || source.includes("AshScript")) &&
    !source.includes("@appaloft/ash")
  ) {
    violations.push({
      file,
      line: 1,
      rule: "ash-import-required",
      message: "Import AshScript and ash from @appaloft/ash.",
    });
  }

  for (const rule of rules) {
    if (rule.shellOwnerOnly && !ownsShellExecution(source)) {
      continue;
    }
    for (const match of source.matchAll(rule.pattern)) {
      violations.push({
        file,
        line: lineNumberAt(source, match.index ?? 0),
        rule: rule.rule,
        message: rule.message,
      });
    }
  }

  return violations.sort((left, right) => left.line - right.line);
}

const legacyViolationBudgets = new Map<
  string,
  Partial<Record<AshCommandConstructionViolation["rule"], number>>
>([
  ["apps/shell/src/remote-pglite-state-sync.ts", { "no-plain-shell-command-type": 2 }],
  ["apps/shell/src/remote-state-work-read-model.ts", { "no-plain-shell-command-type": 1 }],
  ["apps/shell/src/ssh-mutation-coordinator.ts", { "no-plain-shell-command-type": 1 }],
  ["packages/server/src/remote-state-work-read-model.ts", { "no-plain-shell-command-type": 1 }],
  ["packages/server/src/ssh-mutation-coordinator.ts", { "no-plain-shell-command-type": 1 }],
]);

export async function discoverAshCommandConstructionSourceFiles(
  repositoryRoot = resolve(import.meta.dir, ".."),
): Promise<string[]> {
  return (
    await Promise.all(
      ashCommandConstructionSourceGlobs.map((pattern) =>
        Array.fromAsync(
          new Bun.Glob(pattern).scan({
            cwd: repositoryRoot,
            onlyFiles: true,
          }),
        ),
      ),
    )
  )
    .flat()
    .filter((file) => file !== "packages/ash/src/index.ts")
    .sort();
}

async function checkRepository(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dir, "..");
  const files = await discoverAshCommandConstructionSourceFiles(repositoryRoot);
  const violations = rejectViolationsBeyondLegacyBudget(
    (
      await Promise.all(
        files.map(async (file) =>
          findAshCommandConstructionViolations(
            relative(repositoryRoot, resolve(repositoryRoot, file)),
            await readFile(resolve(repositoryRoot, file), "utf8"),
          ),
        ),
      )
    ).flat(),
  );

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`ash command construction check passed for ${files.length} files`);
}

function rejectViolationsBeyondLegacyBudget(
  violations: readonly AshCommandConstructionViolation[],
): AshCommandConstructionViolation[] {
  const consumed = new Map<string, number>();
  return violations.filter((violation) => {
    const key = `${violation.file}:${violation.rule}`;
    const nextCount = (consumed.get(key) ?? 0) + 1;
    consumed.set(key, nextCount);
    const budget = legacyViolationBudgets.get(violation.file)?.[violation.rule] ?? 0;
    return nextCount > budget;
  });
}

function ownsShellExecution(source: string): boolean {
  return (
    source.includes("@appaloft/ash") ||
    /\bBun\.spawn(?:Sync)?\s*\(/u.test(source) ||
    /\bbuildSsh\w*ProcessArgs\b/u.test(source) ||
    /\brun(?:ManagedDependency)?TargetCommand\b/u.test(source) ||
    /\[(?:"sh"|'sh'),\s*(?:"-lc"|'-lc')/u.test(source)
  );
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

if (import.meta.main) {
  await checkRepository();
}
