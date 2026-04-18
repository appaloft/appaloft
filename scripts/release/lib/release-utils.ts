import { basename, dirname, join } from "node:path";
import { $ } from "bun";

import { type ReleaseArchiveFormat } from "./targets";

export async function run(command: string[], cwd: string): Promise<void> {
  const result = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });

  if ((await result.exited) !== 0) {
    throw new Error(`Command failed: ${command.join(" ")}`);
  }
}

export async function runNothrow(
  command: string[],
  cwd: string,
  options: { quiet?: boolean } = {},
): Promise<number> {
  const result = Bun.spawn(command, {
    cwd,
    stdout: options.quiet ? "ignore" : "inherit",
    stderr: options.quiet ? "ignore" : "inherit",
  });

  return await result.exited;
}

export async function ensureDir(path: string): Promise<void> {
  await $`mkdir -p ${path}`;
}

export async function removePath(path: string): Promise<void> {
  await $`rm -rf ${path}`;
}

export async function resetDir(path: string): Promise<void> {
  await removePath(path);
  await ensureDir(path);
}

export async function chmodExecutable(path: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  await run(["chmod", "755", path], dirname(path));
}

export async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*").scan({
    cwd: root,
    dot: true,
    onlyFiles: true,
  })) {
    files.push(join(root, file));
  }
  return files.sort();
}

export async function listTopLevelFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for await (const file of new Bun.Glob("*").scan({
    cwd: root,
    dot: true,
    onlyFiles: true,
  })) {
    files.push(join(root, file));
  }
  return files.sort();
}

export async function copyDir(source: string, target: string): Promise<void> {
  for (const file of await listFiles(source)) {
    await Bun.write(join(target, file.slice(source.length + 1)), Bun.file(file));
  }
}

export async function copyFileIfExists(source: string, target: string): Promise<void> {
  if (await Bun.file(source).exists()) {
    await Bun.write(target, Bun.file(source));
  }
}

export function parseCliArgs(argv: string[]): Map<string, string | boolean> {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }

    const [key = "", inlineValue] = arg.slice(2).split("=", 2);
    if (!key) {
      continue;
    }
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      args.set(key, nextValue);
      index += 1;
      continue;
    }

    args.set(key, true);
  }

  return args;
}

export function stringArg(
  args: ReadonlyMap<string, string | boolean>,
  key: string,
): string | undefined {
  const value = args.get(key);
  return typeof value === "string" ? value : undefined;
}

export function booleanArg(args: ReadonlyMap<string, string | boolean>, key: string): boolean {
  return args.get(key) === true;
}

export async function archiveDirectory(input: {
  sourceDir: string;
  archivePath: string;
  format: ReleaseArchiveFormat;
}): Promise<void> {
  await ensureDir(dirname(input.archivePath));

  if (input.format === "tar.gz") {
    await run(
      ["tar", "-czf", input.archivePath, basename(input.sourceDir)],
      dirname(input.sourceDir),
    );
    return;
  }

  await run(["zip", "-r", input.archivePath, basename(input.sourceDir)], dirname(input.sourceDir));
}
