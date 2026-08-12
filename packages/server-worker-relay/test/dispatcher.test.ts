import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ServerWorkerDispatcher } from "../src";

describe("Server Worker dispatcher", () => {
  test("[SWR-EXEC-006] bounds argv, output, and owned filesystem roots", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-root-"));
    const dispatcher = new ServerWorkerDispatcher({ roots: [root], allowHostShell: false });

    const denied = await dispatcher.dispatch({
      requestId: "req-1",
      capability: "process.exec",
      payload: { argv: ["sh", "-lc", "echo unsafe"], cwd: root },
    });
    expect(denied.isErr()).toBe(true);

    const written = await dispatcher.dispatch({
      requestId: "req-2",
      capability: "filesystem.write",
      payload: { path: join(root, "data.txt"), data: Buffer.from("safe").toString("base64") },
    });
    expect(written.isOk()).toBe(true);
    expect(readFileSync(join(root, "data.txt"), "utf8")).toBe("safe");

    const escaped = await dispatcher.dispatch({
      requestId: "req-3",
      capability: "filesystem.read",
      payload: { path: join(root, "..", "outside") },
    });
    expect(escaped.isErr()).toBe(true);
  });

  test("[SWR-RECONNECT-011] journals completed request ids without blind replay", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-root-"));
    const dispatcher = new ServerWorkerDispatcher({ roots: [root], allowHostShell: true });
    const request = {
      requestId: "req-same",
      capability: "process.exec" as const,
      payload: { argv: ["printf", "once"], cwd: root },
    };
    const first = await dispatcher.dispatch(request);
    const duplicate = await dispatcher.dispatch(request);
    expect(first.isOk()).toBe(true);
    expect(duplicate).toEqual(first);
  });

  test("[SWR-EXEC-006] validates write payload before any effect", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-root-"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "kept.txt"), "kept");
    const dispatcher = new ServerWorkerDispatcher({ roots: [root], allowHostShell: true });
    const rejected = await dispatcher.dispatch({
      requestId: "req-invalid",
      capability: "filesystem.write",
      payload: { path: join(root, "kept.txt"), data: "x".repeat(2_000_000) },
    });
    expect(rejected.isErr()).toBe(true);
    expect(readFileSync(join(root, "kept.txt"), "utf8")).toBe("kept");
  });
});
