export function shouldInstallGitHooks(input: {
  readonly gitAvailable: boolean;
  readonly inGitRepo: boolean;
}): boolean {
  return input.gitAvailable && input.inGitRepo;
}

function commandSucceeds(command: string, args: readonly string[]): boolean {
  const result = Bun.spawnSync([command, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  return result.exitCode === 0;
}

function lefthookBin(): string {
  return `${process.cwd()}/node_modules/.bin/lefthook`;
}

if (import.meta.main) {
  if (
    !shouldInstallGitHooks({
      gitAvailable: commandSucceeds("git", ["--version"]),
      inGitRepo: commandSucceeds("git", ["rev-parse", "--git-dir"]),
    })
  ) {
    console.log("Skipping Lefthook install; git is unavailable or this is not a git checkout.");
    process.exit(0);
  }

  const result = Bun.spawnSync([lefthookBin(), "install"], {
    stderr: "inherit",
    stdout: "inherit",
  });
  process.exit(result.exitCode ?? 1);
}
