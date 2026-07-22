import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";

export interface QueryBatchingViolation {
  readonly file: string;
  readonly line: number;
  readonly rule: "no-async-map-find-one";
  readonly message: string;
}

export const queryBatchingSourceGlobs = [
  "apps/*/src/**/*.ts",
  "packages/*/src/**/*.ts",
  "packages/providers/*/src/**/*.ts",
] as const;

export function findQueryBatchingViolations(
  file: string,
  source: string,
): QueryBatchingViolation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: QueryBatchingViolation[] = [];

  function visit(node: ts.Node): void {
    if (isAsyncMapCall(node) && containsFindOneCall(node.arguments[0])) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file,
        line: position.line + 1,
        rule: "no-async-map-find-one",
        message: "Replace per-item findOne calls with one batched read-model or repository query.",
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

export async function discoverQueryBatchingSourceFiles(
  repositoryRoot = resolve(import.meta.dir, ".."),
): Promise<string[]> {
  return (
    await Promise.all(
      queryBatchingSourceGlobs.map((pattern) =>
        Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: repositoryRoot, onlyFiles: true })),
      ),
    )
  )
    .flat()
    .sort();
}

function isAsyncMapCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  if (node.expression.name.text !== "map") return false;

  const callback = node.arguments[0];
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) {
    return false;
  }

  return (
    callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false
  );
}

function containsFindOneCall(node: ts.Node): boolean {
  let found = false;
  function visit(candidate: ts.Node): void {
    if (
      ts.isCallExpression(candidate) &&
      ts.isPropertyAccessExpression(candidate.expression) &&
      candidate.expression.name.text === "findOne"
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(candidate, visit);
  }
  visit(node);
  return found;
}

async function checkRepository(): Promise<void> {
  const repositoryRoot = resolve(import.meta.dir, "..");
  const files = await discoverQueryBatchingSourceFiles(repositoryRoot);
  const violations = (
    await Promise.all(
      files.map(async (file) =>
        findQueryBatchingViolations(
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

  console.log(`query batching check passed for ${files.length} files`);
}

if (import.meta.main) {
  await checkRepository();
}
