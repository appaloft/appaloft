import { createAppComposition, type ShellRuntimeOptions } from "./composition";

export async function runShellCli(options?: ShellRuntimeOptions): Promise<void> {
  const app = await createAppComposition(undefined, options);

  try {
    await app.cliProgram.parseAsync(process.argv);
  } finally {
    if (!process.argv.includes("serve")) {
      await app.shutdown();
    }
  }

  const exitCode = process.exitCode ?? 0;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
