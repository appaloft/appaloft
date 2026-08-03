import { describe, expect, test } from "bun:test";

import { runBufferedProcess, shellCommand } from "../src/buffered-process";

describe("runBufferedProcess", () => {
  test("[EDGE-PROXY-RELOAD-004A] streams sensitive material over stdin without placing it in argv", async () => {
    const secret = "certificate-material-never-in-argv";
    const result = await runBufferedProcess({
      command: shellCommand("read -r material; printf '%s' \"$material\""),
      stdin: `${secret}\n`,
      redactions: [secret],
    });

    expect(result.failed).toBe(false);
    expect(result.stdout).toBe("[redacted]");
    expect(result.stderr).not.toContain(secret);
  });
});
