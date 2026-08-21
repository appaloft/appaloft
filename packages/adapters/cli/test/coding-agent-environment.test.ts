import { describe, expect, test } from "bun:test";

import {
  CLI_MUTATION_CONFIRMATION_REQUIRED_CODE,
  cliMutationConfirmationRequiredError,
  formatCliMutationPlan,
  hasExplicitYesFlag,
  isCiEnvironment,
  isCodingAgentEnvironment,
  isInteractiveTty,
  requiresExplicitYesForMutation,
} from "../src/coding-agent-environment.js";

describe("coding-agent environment guard", () => {
  test("[DEPLOY-DOOR-LOGIN-002] agent env keys, CI, and non-TTY require --yes", () => {
    expect(isCodingAgentEnvironment({ CURSOR_AGENT: "1" })).toBe(true);
    expect(isCodingAgentEnvironment({ CLAUDECODE: "1" })).toBe(true);
    expect(isCodingAgentEnvironment({ CLAUDE_CODE_ENTRYPOINT: "cli" })).toBe(true);
    expect(isCodingAgentEnvironment({ AIDER_MODEL: "gpt" })).toBe(true);
    expect(isCodingAgentEnvironment({ CODEX_CLI: "1" })).toBe(true);
    expect(isCodingAgentEnvironment({})).toBe(false);
    expect(isCiEnvironment({ CI: "1" })).toBe(true);
    expect(isCiEnvironment({ CI: "true" })).toBe(true);
    expect(isCiEnvironment({})).toBe(false);
    expect(isInteractiveTty(true, true)).toBe(true);
    expect(isInteractiveTty(false, true)).toBe(false);
    expect(
      requiresExplicitYesForMutation({
        env: { CURSOR_AGENT: "1" },
        stdinIsTty: true,
        stdoutIsTty: true,
      }),
    ).toBe(true);
    expect(
      requiresExplicitYesForMutation({
        env: { CI: "1" },
        stdinIsTty: true,
        stdoutIsTty: true,
      }),
    ).toBe(true);
    expect(
      requiresExplicitYesForMutation({
        env: {},
        stdinIsTty: false,
        stdoutIsTty: false,
      }),
    ).toBe(true);
    expect(
      requiresExplicitYesForMutation({
        env: {},
        stdinIsTty: true,
        stdoutIsTty: true,
      }),
    ).toBe(false);
    expect(hasExplicitYesFlag(["deploy", "--yes"])).toBe(true);
    expect(hasExplicitYesFlag(["setup", "agent", "-y"])).toBe(true);
    expect(hasExplicitYesFlag(["deploy"])).toBe(false);
  });

  test("[DEPLOY-DOOR-LOGIN-002] plan copy never asks to run a separate login command", () => {
    expect(formatCliMutationPlan({ door: "deploy", loggedIn: false })).toContain(
      "Would sign in and deploy this folder.",
    );
    expect(formatCliMutationPlan({ door: "deploy", loggedIn: false })).not.toContain(
      "Run appaloft login",
    );
    expect(formatCliMutationPlan({ door: "setup-agent" })).toContain(
      "Would install Appaloft skills",
    );
    expect(cliMutationConfirmationRequiredError({ door: "deploy", loggedIn: false })).toMatchObject(
      {
        code: CLI_MUTATION_CONFIRMATION_REQUIRED_CODE,
        details: { guidance: "Pass --yes to continue." },
      },
    );
    expect(
      JSON.stringify(cliMutationConfirmationRequiredError({ door: "deploy", loggedIn: false })),
    ).not.toContain("Occupancy");
  });
});
