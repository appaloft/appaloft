import { describe, expect, test } from "bun:test";

import { AGENT_SETUP_AGENT_LIST } from "../src/agent-host-setup";
import {
  EFFECT_HELP_GENERIC_BOOLEAN,
  EFFECT_HELP_GENERIC_TEXT,
  EFFECT_HELP_OPTIONAL_PROSE,
} from "../src/code-help";
import {
  formatSetupHelp,
  isSetupHelpInvocation,
  SETUP_AGENT_LIST,
  SETUP_AGENT_OPTION_DESCRIPTIONS,
  tryHandleSetupHelp,
} from "../src/setup-help";

const requiredFlags = [
  "-y, --yes",
  "--agent",
  "--profile",
  "--cursor-home",
  "--opencode-home",
  "--agents-home",
  "--claude-home",
  "--command",
  "--skill-dir",
] as const;

function optionalProseCount(text: string): number {
  return text.split(EFFECT_HELP_OPTIONAL_PROSE).length - 1;
}

describe("compact setup agent help", () => {
  test("[CONTROL-PLANE-CLI-027] --help and -h are setup help invocations", () => {
    expect(isSetupHelpInvocation(["node", "appaloft", "setup", "agent", "--help"])).toBeTrue();
    expect(isSetupHelpInvocation(["bun", "src/index.ts", "setup", "agent", "-h"])).toBeTrue();
    expect(isSetupHelpInvocation(["bun", "src/index.ts", "--", "setup", "--help"])).toBeTrue();
    expect(isSetupHelpInvocation(["node", "appaloft", "setup", "-h"])).toBeTrue();
    expect(isSetupHelpInvocation(["node", "appaloft", "setup", "agent", "-y"])).toBeFalse();
    expect(isSetupHelpInvocation(["node", "appaloft", "code", "--help"])).toBeFalse();
    expect(isSetupHelpInvocation(["node", "appaloft", "login", "--help"])).toBeFalse();
    expect(
      isSetupHelpInvocation(["node", "appaloft", "setup", "agent", "--bogus", "--help"]),
    ).toBeFalse();
    expect(isSetupHelpInvocation(["node", "appaloft", "setup", "nope", "--help"])).toBeFalse();
  });

  test("[CONTROL-PLANE-CLI-027] compact table names real-use flags without Effect defaults", () => {
    expect([...SETUP_AGENT_LIST]).toEqual([...AGENT_SETUP_AGENT_LIST]);
    const help = formatSetupHelp();
    expect(help).toContain("Usage:");
    expect(help).toContain("appaloft setup agent");
    expect(help).toContain("Options:");
    for (const flag of requiredFlags) {
      expect(help).toContain(flag);
    }
    expect(help).toContain(SETUP_AGENT_OPTION_DESCRIPTIONS.yes);
    expect(help).toContain(SETUP_AGENT_OPTION_DESCRIPTIONS.agent);
    expect(help).toContain(SETUP_AGENT_OPTION_DESCRIPTIONS.profile);
    expect(help).toContain("opencode");
    expect(help).toContain("not default-checked");
    expect(help).toContain("~/.claude.json");
    expect(help).toContain("~/.cursor/mcp.json");
    expect(help).not.toContain(EFFECT_HELP_GENERIC_BOOLEAN);
    expect(help).not.toContain(EFFECT_HELP_GENERIC_TEXT);
    expect(optionalProseCount(help)).toBe(0);
    expect(help).not.toContain("--wizard");
    expect(help).not.toContain("USAGE");
    expect(help).not.toContain("$ setup");
    expect(help).not.toMatch(/occupancy/iu);
  });

  test("[CONTROL-PLANE-CLI-027] tryHandleSetupHelp writes compact stdout and skips Effect", () => {
    let written = "";
    expect(
      tryHandleSetupHelp(["node", "appaloft", "setup", "agent", "--help"], {
        write(chunk) {
          written += String(chunk);
          return true;
        },
      }),
    ).toBeTrue();
    expect(written).toBe(formatSetupHelp());
    expect(
      tryHandleSetupHelp(["node", "appaloft", "code", "--help"], {
        write() {
          throw new Error("code help must not use compact setup help");
        },
      }),
    ).toBeFalse();
  });
});
