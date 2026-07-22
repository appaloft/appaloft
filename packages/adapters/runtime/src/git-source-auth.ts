const gitHubExtraHeaderKey = "http.https://github.com/.extraHeader";

function gitHubBasicAuthorizationHeader(accessToken: string): string {
  const encoded = Buffer.from(`x-access-token:${accessToken}`, "utf8").toString("base64");
  return `Authorization: Basic ${encoded}`;
}

function nextGitConfigIndex(env: NodeJS.ProcessEnv): number {
  const count = Number(env.GIT_CONFIG_COUNT ?? "0");
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

export function gitHubHttpAuthEnvironment(
  env: NodeJS.ProcessEnv,
  accessToken: string,
): NodeJS.ProcessEnv {
  const index = nextGitConfigIndex(env);
  return {
    ...env,
    GIT_CONFIG_COUNT: String(index + 1),
    [`GIT_CONFIG_KEY_${index}`]: gitHubExtraHeaderKey,
    [`GIT_CONFIG_VALUE_${index}`]: gitHubBasicAuthorizationHeader(accessToken),
    GIT_TERMINAL_PROMPT: "0",
    GIT_TRACE_CURL: "0",
    GIT_CURL_VERBOSE: "0",
  };
}

export function gitHubHttpAuthRedactions(accessToken: string): string[] {
  const header = gitHubBasicAuthorizationHeader(accessToken);
  return [accessToken, header, header.slice("Authorization: Basic ".length)];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function remoteGitHubHttpAuthInvocation(
  gitCommand: string,
  accessToken: string,
): { command: "sh -s"; stdin: string; redactions: string[] } {
  const env = gitHubHttpAuthEnvironment({}, accessToken);
  const header = env.GIT_CONFIG_VALUE_0;
  if (!header) {
    throw new Error("GitHub HTTP authorization header is missing");
  }

  return {
    command: "sh -s",
    stdin: [
      "set -eu",
      `export GIT_CONFIG_COUNT=${shellQuote(env.GIT_CONFIG_COUNT ?? "1")}`,
      `export GIT_CONFIG_KEY_0=${shellQuote(env.GIT_CONFIG_KEY_0 ?? gitHubExtraHeaderKey)}`,
      `export GIT_CONFIG_VALUE_0=${shellQuote(header)}`,
      "export GIT_TERMINAL_PROMPT=0",
      "export GIT_TRACE_CURL=0",
      "export GIT_CURL_VERBOSE=0",
      gitCommand,
      "",
    ].join("\n"),
    redactions: gitHubHttpAuthRedactions(accessToken),
  };
}
