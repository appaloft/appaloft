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
