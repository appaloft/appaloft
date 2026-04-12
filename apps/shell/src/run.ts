import { createAppComposition, type ShellRuntimeOptions } from "./composition";

function readExitCode(): number {
  const value = process.exitCode;
  return typeof value === "number" ? value : Number(value) || 0;
}

export async function runShellCli(options?: ShellRuntimeOptions): Promise<void> {
  const app = await createAppComposition(undefined, options);
  let exitCode = 0;

  try {
    await app.cliProgram.parseAsync(process.argv);
    process.exitCode = 0;
  } catch {
    const currentExitCode = readExitCode();
    exitCode = currentExitCode !== 0 ? currentExitCode : 1;
  } finally {
    if (!process.argv.includes("serve")) {
      await app.shutdown();
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
