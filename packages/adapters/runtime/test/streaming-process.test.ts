import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { runStreamingProcess } from "../src/streaming-process";

describe("streaming process", () => {
  test("[QUICK-DEPLOY-WF-039] emits process output before the command exits", async () => {
    const lines: string[] = [];
    let resolved = false;
    const command = runStreamingProcess({
      command: "sh",
      args: ["-c", "printf 'first\\n'; sleep 0.2; printf 'second\\n'"],
      cwd: tmpdir(),
      env: process.env,
      onOutput: (line) => {
        lines.push(line);
      },
    }).finally(() => {
      resolved = true;
    });

    await waitFor(() => lines.length > 0);

    expect(resolved).toBe(false);
    expect(lines).toEqual(["first"]);

    const result = await command;

    expect(result.failed).toBe(false);
    expect(lines).toEqual(["first", "second"]);
  });

  test("[QUICK-DEPLOY-WF-039B] terminates a streaming process that exceeds its timeout", async () => {
    const lines: string[] = [];
    const result = await runStreamingProcess({
      command: "sh",
      args: ["-c", "printf 'first\\n'; sleep 5; printf 'second\\n'"],
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 20,
      timeoutMessage: "streaming command timed out",
      onOutput: (line) => {
        lines.push(line);
      },
    });

    expect(result.failed).toBe(true);
    expect(result.timedOut).toBe(true);
    expect(result.reason).toBe("streaming command timed out");
    expect(result.stderr).toContain("streaming command timed out");
    expect(lines).toEqual(["first"]);
  });

  test("[CONFIG-FILE-GITHUB-SOURCE-002] forwards ephemeral input without adding it to argv", async () => {
    const secretInput = "Authorization: Basic ephemeral-value\n";
    const result = await runStreamingProcess({
      command: "sh",
      args: ["-c", "read -r value; printf '%s\\n' \"$value\""],
      stdin: secretInput,
      cwd: tmpdir(),
      env: process.env,
      redactions: ["ephemeral-value"],
      onOutput: () => {},
    });

    expect(result.failed).toBe(false);
    expect(result.stdout).toBe("Authorization: Basic [redacted]\n");
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 1_000) {
    if (predicate()) {
      return;
    }
    await Bun.sleep(10);
  }
  throw new Error("Timed out waiting for condition");
}
