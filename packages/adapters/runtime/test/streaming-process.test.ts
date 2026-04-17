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

    await Bun.sleep(50);

    expect(resolved).toBe(false);
    expect(lines).toEqual(["first"]);

    const result = await command;

    expect(result.failed).toBe(false);
    expect(lines).toEqual(["first", "second"]);
  });
});
