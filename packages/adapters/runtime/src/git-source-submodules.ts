export const githubHttpsSubmodulePrefix = "https://github.com/";
export const githubSshSubmodulePrefix = "git@github.com:";

export function gitSubmoduleCredentialRewriteArgs(input: {
  tokenizedGithubHttpsPrefix?: string | undefined;
}): string[] {
  if (!input.tokenizedGithubHttpsPrefix) {
    return [];
  }

  return [
    "-c",
    `url.${input.tokenizedGithubHttpsPrefix}.insteadOf=${githubHttpsSubmodulePrefix}`,
    "-c",
    `url.${input.tokenizedGithubHttpsPrefix}.insteadOf=${githubSshSubmodulePrefix}`,
  ];
}

export function gitSubmoduleUpdateArgs(input: {
  workdir: string;
  tokenizedGithubHttpsPrefix?: string | undefined;
}): string[] {
  return [
    "-C",
    input.workdir,
    ...gitSubmoduleCredentialRewriteArgs({
      tokenizedGithubHttpsPrefix: input.tokenizedGithubHttpsPrefix,
    }),
    "submodule",
    "update",
    "--init",
    "--recursive",
  ];
}
