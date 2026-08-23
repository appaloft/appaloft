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

  test("[WS-REMOTE-HELP-227] compact code help does not claim invalid argv", () => {
    expect(isCodeHelpInvocation(["node", "appaloft", "code", "--bogus", "--help"])).toBeFalse();
    expect(isCodeHelpInvocation(["node", "appaloft", "code", "--help", "--bogus"])).toBeFalse();
    expect(
      isCodeHelpInvocation(["node", "appaloft", "code", ".", "unexpected", "--help"]),
    ).toBeFalse();
    expect(isCodeHelpInvocation(["node", "appaloft", "code", "--profile", "--help"])).toBeFalse();
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
    expect(help).toContain(CODE_OPTION_DESCRIPTIONS.codex);
    expect(help).not.toContain(EFFECT_HELP_GENERIC_BOOLEAN);
    expect(help).not.toContain(EFFECT_HELP_GENERIC_TEXT);
    expect(optionalProseCount(help)).toBeLessThanOrEqual(1);
    expect(help).not.toContain("--wizard");
    expect(help).not.toContain("USAGE");
    expect(help).not.toContain("$ code");
    expect(help).not.toMatch(/occupancy/iu);
  });

  test("[WS-REMOTE-HELP-229] --codex help states remote Codex launch and credential copy", () => {
    const help = formatCodeHelp();
    expect(help).toContain("Launch Codex on the remote Sandbox");
    expect(help).toContain("this Mac's ~/.codex/auth.json");
    expect(help).toContain("selected remote Workspace HOME");
    expect(help).toContain("never printed or placed in MCP/env");
    expect(help).toContain("appaloft sandbox file remove <sandboxId> --path .codex/auth.json");
    expect(help).toContain("does not revoke upstream access");
    expect(help).toContain("revoke the corresponding Codex/OpenAI session");
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

  test("[WS-REMOTE-HELP-227] tryHandleCodeHelp leaves invalid argv to the parser", () => {
    let written = "";
    expect(
      tryHandleCodeHelp(["node", "appaloft", "code", "--bogus", "--help"], {
        write(chunk) {
          written += String(chunk);
          return true;
        },
      }),
    ).toBeFalse();
    expect(written).toBe("");
  });
});
