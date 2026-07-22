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

  test("[CONFIG-FILE-GITHUB-SOURCE-002] rewrites GitHub SSH submodules without credentials in argv", () => {
    expect(
      gitSubmoduleCredentialRewriteArgs({
        rewriteGithubSshToHttps: true,
      }),
    ).toEqual([
      "-c",
      `url.${githubHttpsSubmodulePrefix}.insteadOf=${githubSshSubmodulePrefix}`,
    ]);

    expect(
      gitSubmoduleUpdateArgs({
        workdir: "/tmp/app/source",
        rewriteGithubSshToHttps: true,
      }),
    ).toEqual([
      "-C",
      "/tmp/app/source",
      "-c",
      `url.${githubHttpsSubmodulePrefix}.insteadOf=${githubSshSubmodulePrefix}`,
      "submodule",
      "update",
      "--init",
      "--recursive",
    ]);
    expect(
      gitSubmoduleUpdateArgs({
        workdir: "/tmp/app/source",
        rewriteGithubSshToHttps: true,
      }).join(" "),
    ).not.toContain("x-access-token");
  });
});
