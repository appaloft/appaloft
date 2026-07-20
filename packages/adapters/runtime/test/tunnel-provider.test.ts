import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LocalAgentTunnelProvider } from "../src/tunnel-provider";

const roots: string[] = [];

function agentScript(output: string): string {
  const root = mkdtempSync(join(tmpdir(), "appaloft-tunnel-agent-"));
  roots.push(root);
  const path = join(root, "agent.sh");
  writeFileSync(path, `#!/bin/sh\nprintf '%s\\n' '${output}' >&2\nsleep 30\n`, "utf8");
  chmodSync(path, 0o700);
  return path;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local tunnel provider adapters", () => {
  test("[TUNNEL-START-CF-001] parses a sanitized Cloudflare readiness URL and stops the owned process", async () => {
    const provider = new LocalAgentTunnelProvider("cloudflare-quick", {
      executable: agentScript(
        "INF Your quick Tunnel has been created! https://safe-agent.trycloudflare.com Registered tunnel connection",
      ),
      startTimeoutMs: 2_000,
    });
    const started = await provider.start({ sessionId: "tun_cf", originUrl: "http://127.0.0.1:3000", expiresAt: "2026-07-20T01:00:00.000Z" });
    expect(started.isOk()).toBe(true);
    expect(started._unsafeUnwrap().publicUrl).toBe("https://safe-agent.trycloudflare.com");
    expect((await provider.inspect(started._unsafeUnwrap().handle))._unsafeUnwrap().running).toBe(true);
    expect((await provider.revoke(started._unsafeUnwrap().handle)).isOk()).toBe(true);
    expect((await provider.inspect(started._unsafeUnwrap().handle))._unsafeUnwrap().running).toBe(false);
  });

  test("[TUNNEL-START-NGROK-002] reads ngrok token only from adapter environment and never returns it", async () => {
    const provider = new LocalAgentTunnelProvider("ngrok", {
      executable: agentScript('{"msg":"started tunnel","url":"https://safe-agent.ngrok-free.app"}'),
      startTimeoutMs: 2_000,
      environment: { ...process.env, NGROK_AUTHTOKEN: "do-not-return-this-token" },
    });
    const started = await provider.start({ sessionId: "tun_ngrok", originUrl: "http://127.0.0.1:3000", expiresAt: "2026-07-20T01:00:00.000Z" });
    expect(started.isOk()).toBe(true);
    expect(JSON.stringify(started._unsafeUnwrap())).not.toContain("do-not-return-this-token");
    expect(started._unsafeUnwrap().publicUrl).toBe("https://safe-agent.ngrok-free.app");
    await provider.revoke(started._unsafeUnwrap().handle);
  });

  test("[TUNNEL-AUTH-003] fails closed before spawning ngrok when its token is missing", async () => {
    const provider = new LocalAgentTunnelProvider("ngrok", {
      executable: "/definitely-not-an-ngrok-binary",
      environment: {},
    });
    const started = await provider.start({
      sessionId: "tun_ngrok_missing_token",
      originUrl: "http://127.0.0.1:3000",
      expiresAt: "2026-07-20T01:00:00.000Z",
    });

    expect(started.isErr()).toBe(true);
    expect(started._unsafeUnwrapErr()).toMatchObject({
      code: "provider_capability_unsupported",
      details: { phase: "tunnel-provider-start", providerKey: "ngrok" },
    });
    expect(JSON.stringify(started)).not.toContain("AUTHTOKEN=");
  });
});
