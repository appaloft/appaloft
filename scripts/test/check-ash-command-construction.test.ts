import { describe, expect, test } from "bun:test";
import {
  discoverAshCommandConstructionSourceFiles,
  findAshCommandConstructionViolations,
} from "../check-ash-command-construction";

describe("ash command construction architecture check", () => {
  test("[ASH-GUARD-000] scans nested provider source packages", async () => {
    const files = await discoverAshCommandConstructionSourceFiles();

    expect(files).toContain("packages/providers/edge-proxy-traefik/src/index.ts");
    expect(files).toContain("packages/providers/edge-proxy-caddy/src/index.ts");
  });

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

  test("[ASH-GUARD-003] does not confuse business command fields with executable shell seams", () => {
    const source = `
      export interface RequestedDeploymentHealthCheck {
        command?: { command: string };
      }
    `;

    expect(findAshCommandConstructionViolations("application-port.ts", source)).toEqual([]);
  });
});
