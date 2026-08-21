import { type DomainError } from "@appaloft/core";

export const CODING_AGENT_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CURSOR_AGENT",
  "AIDER_MODEL",
  "CODEX_CLI",
] as const;

export const CLI_MUTATION_CONFIRMATION_REQUIRED_CODE = "cli_mutation_confirmation_required";

export type CliMutationDoor = "deploy" | "setup-agent";

export function isCodingAgentEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return CODING_AGENT_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
}

export function isCiEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  const ci = env.CI?.trim();
  return ci === "1" || ci === "true";
}

export function isInteractiveTty(stdinIsTty?: boolean, stdoutIsTty?: boolean): boolean {
  return Boolean(stdinIsTty && stdoutIsTty);
}

export function hasExplicitYesFlag(args: readonly string[]): boolean {
  return args.includes("--yes") || args.includes("-y");
}

export function requiresExplicitYesForMutation(input: {
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly stdinIsTty?: boolean;
  readonly stdoutIsTty?: boolean;
}): boolean {
  const env = input.env ?? process.env;
  if (isCodingAgentEnvironment(env) || isCiEnvironment(env)) {
    return true;
  }
  const stdinIsTty = input.stdinIsTty ?? process.stdin.isTTY;
  const stdoutIsTty = input.stdoutIsTty ?? process.stdout.isTTY;
  return !isInteractiveTty(stdinIsTty, stdoutIsTty);
}

export function formatCliMutationPlan(input: {
  readonly door: CliMutationDoor;
  readonly loggedIn?: boolean;
}): string {
  if (input.door === "setup-agent") {
    return [
      "Would install Appaloft skills and write token-free MCP for detected hosts.",
      "Pass --yes to continue.",
    ].join("\n");
  }
  if (input.loggedIn === false) {
    return ["Would sign in and deploy this folder.", "Pass --yes to continue."].join("\n");
  }
  return ["Would deploy this folder.", "Pass --yes to continue."].join("\n");
}

export function cliMutationConfirmationRequiredError(input: {
  readonly door: CliMutationDoor;
  readonly loggedIn?: boolean;
}): DomainError {
  const plan = formatCliMutationPlan(input);
  return {
    code: CLI_MUTATION_CONFIRMATION_REQUIRED_CODE,
    category: "user",
    message: plan.split("\n")[0] ?? plan,
    retryable: false,
    details: {
      phase: "cli-mutation-guard",
      guidance: "Pass --yes to continue.",
    },
  };
}
