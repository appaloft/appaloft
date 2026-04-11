import { $ } from "bun";

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

export async function resetDir(path: string): Promise<void> {
  await $`rm -rf ${path}`;
  await $`mkdir -p ${path}`;
}

export async function copyDir(source: string, target: string): Promise<void> {
  await $`mkdir -p ${target}`;
  await $`cp -R ${source}/. ${target}`;
}

export async function copyFileIfExists(source: string, target: string): Promise<void> {
  if (await Bun.file(source).exists()) {
    await Bun.write(target, Bun.file(source));
  }
}
