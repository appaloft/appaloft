import { describe, expect, test } from "bun:test";

import {
  gitHubHttpAuthEnvironment,
  gitHubHttpAuthRedactions,
  remoteGitHubHttpAuthInvocation,
} from "../src/git-source-auth";

describe("Git source authentication", () => {
  test("[CONFIG-FILE-GITHUB-SOURCE-002] keeps GitHub App credentials out of URL and argv", () => {
    const accessToken = "installation-token-secret";
    const locator = "https://github.com/appaloft/example.git";
    const env = gitHubHttpAuthEnvironment({ PATH: "/usr/bin" }, accessToken);
    const invocation = remoteGitHubHttpAuthInvocation(
      `git clone --depth 1 '${locator}' '/tmp/source'`,
      accessToken,
    );

    expect(locator).not.toContain(accessToken);
    expect(invocation.command).toBe("sh -s");
    expect(invocation.command).not.toContain(accessToken);
    expect(invocation.stdin).not.toContain(accessToken);
    expect(invocation.stdin).toContain(locator);
    expect(invocation.stdin).not.toContain(locator.replace("https://", "https://x-access-token:"));
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraHeader");
    expect(env.GIT_CONFIG_VALUE_0).toStartWith("Authorization: Basic ");
    expect(JSON.stringify(env)).not.toContain(accessToken);
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(gitHubHttpAuthRedactions(accessToken)).toContain(accessToken);
    expect(gitHubHttpAuthRedactions(accessToken)).toContain(env.GIT_CONFIG_VALUE_0);
  });
});
