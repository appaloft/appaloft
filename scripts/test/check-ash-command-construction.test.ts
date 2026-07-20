import { describe, expect, test } from "bun:test";
import { findAshCommandConstructionViolations } from "../check-ash-command-construction";

describe("ash command construction architecture check", () => {
  test("[ASH-GUARD-001] rejects handwritten shell quoting and string-built command scripts", () => {
    const source = `
      function shellQuote(input: string): string {
        return "'" + input + "'";
      }
      const command = ["set -eu", "docker ps"].join("\\n");
      runTargetCommand(target, command);
    `;

    expect(findAshCommandConstructionViolations("managed-provider.ts", source)).toEqual([
      expect.objectContaining({ rule: "no-handwritten-shell-quoting" }),
      expect.objectContaining({ rule: "no-string-built-shell-script" }),
    ]);
  });

  test("[ASH-GUARD-002] accepts typed AshScript construction and explicit rendering at execution", () => {
    const source = `
      import { type AshScript, ash } from "@appaloft/ash";
      const command: AshScript = ash\`docker ps --filter \${ash.arg(filter)}\`;
      Bun.spawn(["sh", "-lc", ash.render(command)]);
    `;

    expect(findAshCommandConstructionViolations("managed-provider.ts", source)).toEqual([]);
  });
});
