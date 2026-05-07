import { chmod, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "..");
const actionRoot = join(repositoryRoot, ".github/actions/deploy-action");
const files = [
  ".github/workflows/ci.yml",
  "action.yml",
  "README.md",
  "scripts/install-appaloft.sh",
  "scripts/run-deploy.sh",
  "scripts/resolve-control-plane.sh",
] as const;

async function copyFile(relativePath: (typeof files)[number], outputRoot: string): Promise<void> {
  const sourcePath = join(actionRoot, relativePath);
  const targetPath = join(outputRoot, relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await Bun.write(targetPath, Bun.file(sourcePath));
  if (relativePath.endsWith(".sh")) {
    await chmod(targetPath, 0o755);
  }
}

async function main(): Promise<void> {
  const outputRoot = Bun.argv[2] ? resolve(Bun.argv[2]) : undefined;
  if (!outputRoot) {
    throw new Error("Usage: bun scripts/export-deploy-action-wrapper.ts <output-dir>");
  }

  await mkdir(outputRoot, { recursive: true });
  for (const file of files) {
    await copyFile(file, outputRoot);
  }
}

await main();
