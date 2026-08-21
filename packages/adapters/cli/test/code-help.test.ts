import { describe, expect, test } from "bun:test";

import {
  CODE_OPTION_DESCRIPTIONS,
  EFFECT_HELP_GENERIC_BOOLEAN,
  EFFECT_HELP_GENERIC_TEXT,
  EFFECT_HELP_OPTIONAL_PROSE,
  formatCodeHelp,
  isCodeHelpInvocation,
  tryHandleCodeHelp,
} from "../src/code-help";

const requiredFlags = [
  "--yes",
  "--open",
  "--profile",
  "--harness",
  "--open-target",
  "--local",
  "--new",
  "--no-attach",
] as const;

function optionalProseCount(text: string): number {
  return text.split(EFFECT_HELP_OPTIONAL_PROSE).length - 1;
}

describe("compact code help", () => {
  test("[WS-REMOTE-HELP-217] --help and -h are code help invocations", () => {
    expect(isCodeHelpInvocation(["node", "appaloft", "code", "--help"])).toBeTrue();
    expect(isCodeHelpInvocation(["bun", "src/index.ts", "code", "-h"])).toBeTrue();
    expect(isCodeHelpInvocation(["bun", "src/index.ts", "--", "code", "--help"])).toBeTrue();
    expect(isCodeHelpInvocation(["node", "appaloft", "code", "--no-attach"])).toBeFalse();
    expect(isCodeHelpInvocation(["node", "appaloft", "login", "--help"])).toBeFalse();
  });

  test("[WS-REMOTE-HELP-217] compact table names real-use flags without Effect defaults", () => {
    const help = formatCodeHelp();
    expect(help).toContain("Usage:");
    expect(help).toContain("appaloft code [path|git-remote] [options]");
    expect(help).toContain("Options:");
    expect(help).toContain("path|git-remote");
    for (const flag of requiredFlags) {
      expect(help).toContain(flag);
    }
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.yes);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.open);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.profile);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.harness);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.openTarget);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.local);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.forceNew);
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.noAttach);
    expect(help).not.toContain(EFFECT_HELP_GENERIC_BOOLEAN);
    expect(help).not.toContain(EFFECT_HELP_GENERIC_TEXT);
    expect(optionalProseCount(help)).toBeLessThanOrEqual(1);
    expect(help).not.toContain("--wizard");
    expect(help).not.toContain("USAGE");
    expect(help).not.toContain("$ code");
    expect(help).not.toMatch(/occupancy/iu);
  });

  test("[WS-REMOTE-HELP-217] tryHandleCodeHelp writes compact stdout and skips Effect", () => {
    let written = "";
    expect(
      tryHandleCodeHelp(["node", "appaloft", "code", "--help"], {
        write(chunk) {
          written += String(chunk);
          return true;
        },
      }),
    ).toBeTrue();
    expect(written).toBe(formatCodeHelp());
    expect(
      tryHandleCodeHelp(["node", "appaloft", "workspace", "--help"], {
        write() {
          throw new Error("workspace help must not use compact code help");
        },
      }),
    ).toBeFalse();
  });
});
