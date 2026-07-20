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
}

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

async function checkRepository(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dir, "..");
  const files = [
    "packages/adapters/runtime/src/runtime-target-capacity.ts",
    "packages/adapters/runtime/src/storage-runtime-cleanup.ts",
    "packages/adapters/runtime/src/storage-volume-backup-provider.ts",
    "packages/server/src/register-application-services.ts",
    ...(await Array.fromAsync(
      new Bun.Glob("apps/shell/src/managed-dependency-providers/*.ts").scan({
        cwd: repositoryRoot,
        onlyFiles: true,
      }),
    )),
  ].sort();
  const violations = (
    await Promise.all(
      files.map(async (file) =>
        findAshCommandConstructionViolations(
          relative(repositoryRoot, resolve(repositoryRoot, file)),
          await readFile(resolve(repositoryRoot, file), "utf8"),
        ),
      ),
    )
  ).flat();

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`ash command construction check passed for ${files.length} files`);
}

function lineNumberAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

if (import.meta.main) {
  await checkRepository();
}
