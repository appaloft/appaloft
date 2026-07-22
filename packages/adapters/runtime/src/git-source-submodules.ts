export const githubHttpsSubmodulePrefix = "https://github.com/";
export const githubSshSubmodulePrefix = "git@github.com:";

export function gitSubmoduleCredentialRewriteArgs(input: {
  rewriteGithubSshToHttps?: boolean | undefined;
}): string[] {
  if (!input.rewriteGithubSshToHttps) {
    return [];
  }

  return [
    "-c",
    `url.${githubHttpsSubmodulePrefix}.insteadOf=${githubSshSubmodulePrefix}`,
  ];
}

export function gitSubmoduleUpdateArgs(input: {
  workdir: string;
  rewriteGithubSshToHttps?: boolean | undefined;
}): string[] {
  return [
    "-C",
    input.workdir,
    ...gitSubmoduleCredentialRewriteArgs({
      rewriteGithubSshToHttps: input.rewriteGithubSshToHttps,
    }),
    "submodule",
    "update",
    "--init",
    "--recursive",
  ];
}
