import { describe, expect, test } from "bun:test";
import {
  gitSubmoduleCredentialRewriteArgs,
  gitSubmoduleUpdateArgs,
  githubHttpsSubmodulePrefix,
  githubSshSubmodulePrefix,
} from "../src/git-source-submodules";

describe("git source submodules", () => {
  test("builds a plain recursive submodule update for public git sources", () => {
    expect(gitSubmoduleUpdateArgs({ workdir: "/tmp/app/source" })).toEqual([
      "-C",
      "/tmp/app/source",
      "submodule",
      "update",
      "--init",
      "--recursive",
    ]);
  });

  test("rewrites GitHub HTTPS and SSH submodule locators through provider credentials", () => {
    const tokenizedGithubHttpsPrefix = "https://x-access-token:secret-token@github.com/";

    expect(
      gitSubmoduleCredentialRewriteArgs({
        tokenizedGithubHttpsPrefix,
      }),
    ).toEqual([
      "-c",
      `url.${tokenizedGithubHttpsPrefix}.insteadOf=${githubHttpsSubmodulePrefix}`,
      "-c",
      `url.${tokenizedGithubHttpsPrefix}.insteadOf=${githubSshSubmodulePrefix}`,
    ]);

    expect(
      gitSubmoduleUpdateArgs({
        workdir: "/tmp/app/source",
        tokenizedGithubHttpsPrefix,
      }),
    ).toEqual([
      "-C",
      "/tmp/app/source",
      "-c",
      `url.${tokenizedGithubHttpsPrefix}.insteadOf=${githubHttpsSubmodulePrefix}`,
      "-c",
      `url.${tokenizedGithubHttpsPrefix}.insteadOf=${githubSshSubmodulePrefix}`,
      "submodule",
      "update",
      "--init",
      "--recursive",
    ]);
  });
});
