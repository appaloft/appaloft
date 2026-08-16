import { describe, expect, test } from "bun:test";

import { runStandaloneControlPlaneCli } from "../src/standalone-control-plane.js";

describe("standalone control plane help", () => {
  test("[WS-REMOTE-DOCS-067][WS-REMOTE-DOCS-068] top-level help names occupancy doors", async () => {
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "--help"],
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    const printed = chunks.join("");
    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(printed.indexOf("appaloft code [path|git-remote]")).toBeGreaterThan(-1);
    expect(printed.indexOf("appaloft workspace [--json]")).toBeGreaterThan(-1);
    expect(printed.indexOf("appaloft deploy [path|git-remote]")).toBeGreaterThan(-1);
    expect(printed).not.toContain("appaloft deploy <path>");
    expect(printed.indexOf("appaloft code")).toBeLessThan(
      printed.indexOf("appaloft workspace open"),
    );
  });
});
