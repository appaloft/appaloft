import { afterEach, describe, expect, test } from "bun:test";

import { LocalAgentTunnelProvider } from "../src/tunnel-provider";

const enabled = process.env.APPALOFT_E2E_TUNNEL_CLOUDFLARE === "true";
const executable = process.env.APPALOFT_E2E_CLOUDFLARED_PATH ?? "cloudflared";
const describeReal = enabled ? describe : describe.skip;

describeReal("Cloudflare Quick Tunnel smoke", () => {
  let server: ReturnType<typeof Bun.serve> | undefined;

  afterEach(() => {
    server?.stop(true);
    server = undefined;
  });

  test(
    "[TUNNEL-REAL-CF-009] starts, serves, inspects, and revokes a real quick tunnel",
    async () => {
      const marker = `appaloft-tunnel-${crypto.randomUUID()}`;
      server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => new Response(marker),
      });
      const provider = new LocalAgentTunnelProvider("cloudflare-quick", {
        executable,
        startTimeoutMs: 30_000,
      });
      const originUrl = `http://127.0.0.1:${server.port}`;
      const started = await provider.start({
        sessionId: "tun_real_cloudflare",
        originUrl,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      expect(started.isOk()).toBe(true);
      const ready = started._unsafeUnwrap();
      expect(ready.publicUrl).toMatch(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);
      expect((await provider.inspect(ready.handle))._unsafeUnwrap()).toEqual({ running: true });

      let responseBody = "";
      let lastEvidence = "no-request-attempt";
      for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
          const response = await fetch(ready.publicUrl, {
            signal: AbortSignal.timeout(3_000),
          });
          responseBody = await response.text();
          lastEvidence = `status=${response.status}; body=${responseBody.slice(0, 160)}`;
          if (response.ok && responseBody === marker) break;
        } catch (error) {
          lastEvidence = error instanceof Error ? error.message : "unknown-fetch-error";
          // The edge route may need a short propagation window after readiness output.
        }
        await Bun.sleep(1_000);
      }
      expect(responseBody, lastEvidence).toBe(marker);

      expect((await provider.revoke(ready.handle)).isOk()).toBe(true);
      expect((await provider.inspect(ready.handle))._unsafeUnwrap()).toEqual({ running: false });
    },
    120_000,
  );
});
