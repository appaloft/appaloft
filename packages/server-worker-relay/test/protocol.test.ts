import { describe, expect, test } from "bun:test";

import {
  InMemoryServerWorkerLeaseRegistry,
  negotiateServerWorkerHello,
  OneTimeEnrollmentTokenRegistry,
  parseServerWorkerFrame,
} from "../src";

describe("server-worker-relay/v1 protocol", () => {
  test("[SWR-PROTO-004] validates bounded hello and negotiates required capabilities", () => {
    const parsed = parseServerWorkerFrame(
      JSON.stringify({
        schema: "server-worker-relay/v1",
        type: "hello",
        workerId: "worker-1",
        generation: 1,
        messageId: "msg-1",
        versions: ["server-worker-relay/v1"],
        capabilities: ["process.exec", "runtime.dev"],
      }),
    );
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr() || parsed.value.type !== "hello") return;
    expect(
      negotiateServerWorkerHello(parsed.value, {
        versions: ["server-worker-relay/v1"],
        requiredCapabilities: ["runtime.dev"],
      }),
    ).toEqual({ version: "server-worker-relay/v1", capabilities: ["runtime.dev"] });
    expect(parseServerWorkerFrame("x".repeat(1_048_577)).isErr()).toBe(true);
  });

  test("[SWR-LEASE-005][SWR-ORPHAN-015] fences stale, expired, and revoked workers", () => {
    const leases = new InMemoryServerWorkerLeaseRegistry({ leaseMs: 10_000 });
    expect(leases.connect("worker-1", 1, 1_000).isOk()).toBe(true);
    expect(leases.connect("worker-1", 2, 1_100).isOk()).toBe(true);
    expect(leases.admit("worker-1", 1, 1_200).isErr()).toBe(true);
    expect(leases.admit("worker-1", 2, 1_200).isOk()).toBe(true);
    expect(leases.admit("worker-1", 2, 11_100).isErr()).toBe(true);
    leases.revoke("worker-1");
    expect(leases.admit("worker-1", 2, 1_300).isErr()).toBe(true);
  });

  test("[SWR-ENROLL-001] consumes only the stored token hash once", () => {
    const tokens = new OneTimeEnrollmentTokenRegistry();
    const issued = tokens.issue({ workerId: "worker-1", expiresAt: 2_000 }, "secret-token");
    expect(JSON.stringify(issued)).not.toContain("secret-token");
    expect(tokens.consume("secret-token", 1_000).isOk()).toBe(true);
    expect(tokens.consume("secret-token", 1_001).isErr()).toBe(true);
  });
});
