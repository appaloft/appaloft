import {
  type TunnelProviderHandle,
  type TunnelProviderKey,
  type TunnelProviderPort,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

type TunnelSubprocess = ReturnType<typeof Bun.spawn>;

export interface LocalAgentTunnelProviderOptions {
  executable?: string;
  startTimeoutMs?: number;
  environment?: Record<string, string | undefined>;
}

function publicUrlPattern(providerKey: TunnelProviderKey): RegExp {
  return providerKey === "cloudflare-quick"
    ? /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
    : /https:\/\/[a-z0-9-]+\.(?:ngrok-free\.app|ngrok\.app|ngrok\.io)/i;
}

function sanitizePublicUrl(providerKey: TunnelProviderKey, value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    const allowed = providerKey === "cloudflare-quick"
      ? hostname.endsWith(".trycloudflare.com")
      : [".ngrok-free.app", ".ngrok.app", ".ngrok.io"].some((suffix) => hostname.endsWith(suffix));
    return allowed ? `${url.protocol}//${url.host}` : null;
  } catch {
    return null;
  }
}

function waitForReadiness(
  streams: ReadonlyArray<ReadableStream<Uint8Array>>,
  providerKey: TunnelProviderKey,
): Promise<string> {
  let publicUrl: string | null = null;
  let providerReady = false;
  let settled = false;
  return new Promise((resolve, reject) => {
    let endedStreams = 0;
    const inspect = (buffered: string) => {
      const match = buffered.match(publicUrlPattern(providerKey));
      publicUrl = publicUrl ?? (match?.[0] ? sanitizePublicUrl(providerKey, match[0]) : null);
      if (providerKey === "cloudflare-quick") {
        providerReady ||= buffered.includes("Registered tunnel connection");
      } else {
        providerReady = publicUrl !== null;
      }
      if (!settled && publicUrl && providerReady) {
        settled = true;
        resolve(publicUrl);
      }
    };
    for (const stream of streams) {
      void (async () => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffered = `${buffered}${decoder.decode(chunk.value, { stream: true })}`.slice(-32_768);
            inspect(buffered);
          }
        } catch {
          // Process exit and revoke close the pipe; readiness is settled by exit/timeout when needed.
        } finally {
          reader.releaseLock();
          endedStreams += 1;
          if (!settled && endedStreams === streams.length) {
            settled = true;
            reject(new Error("Tunnel agent exited before becoming ready"));
          }
        }
      })();
    }
  });
}

export class LocalAgentTunnelProvider implements TunnelProviderPort {
  readonly key: TunnelProviderKey;
  private readonly executable: string;
  private readonly startTimeoutMs: number;
  private readonly environment: Record<string, string | undefined>;
  private readonly processes = new Map<string, TunnelSubprocess>();

  constructor(providerKey: TunnelProviderKey, options: LocalAgentTunnelProviderOptions = {}) {
    this.key = providerKey;
    this.executable = options.executable ?? (providerKey === "cloudflare-quick" ? "cloudflared" : "ngrok");
    this.startTimeoutMs = options.startTimeoutMs ?? 20_000;
    this.environment = options.environment ?? process.env;
  }

  async start(input: {
    sessionId: string;
    originUrl: string;
    expiresAt: string;
  }): Promise<Result<{ publicUrl: string; handle: TunnelProviderHandle }>> {
    if (this.key === "ngrok" && !this.environment.NGROK_AUTHTOKEN) {
      return err(domainError.providerCapabilityUnsupported("NGROK_AUTHTOKEN is required", {
        phase: "tunnel-provider-start",
        providerKey: this.key,
      }));
    }
    const args = this.key === "cloudflare-quick"
      ? [this.executable, "tunnel", "--url", input.originUrl]
      : [this.executable, "http", input.originUrl, "--log=stdout", "--log-format=json"];
    let child: TunnelSubprocess;
    try {
      child = Bun.spawn(args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: this.key === "cloudflare-quick"
          ? { ...this.environment, NO_AUTOUPDATE: "true" }
          : this.environment,
      });
    } catch (error) {
      return err(domainError.provider("Tunnel agent could not be started", {
        phase: "tunnel-provider-start",
        providerKey: this.key,
        reason: error instanceof Error ? error.message : "unknown",
      }));
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Tunnel agent readiness timed out")), this.startTimeoutMs);
      });
      const exited = child.exited.then((code) => {
        throw new Error(`Tunnel agent exited before readiness (exit ${code})`);
      });
      const publicUrl = await Promise.race([
        waitForReadiness(
          [child.stdout, child.stderr] as ReadonlyArray<ReadableStream<Uint8Array>>,
          this.key,
        ),
        exited,
        timedOut,
      ]);
      const sessionRef = `${this.key}:${input.sessionId}`;
      this.processes.set(sessionRef, child);
      return ok({
        publicUrl,
        handle: {
          sessionRef,
          processId: child.pid,
          executable: this.executable,
          originUrl: input.originUrl,
        },
      });
    } catch (error) {
      child.kill();
      await child.exited.catch(() => undefined);
      return err(domainError.provider("Tunnel agent did not become ready", {
        phase: "tunnel-provider-readiness",
        providerKey: this.key,
        reason: error instanceof Error ? error.message : "unknown",
      }));
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private verifiedProcessIsRunning(handle: TunnelProviderHandle): boolean {
    try {
      const result = Bun.spawnSync(["ps", "-p", String(handle.processId), "-o", "command="], {
        stdout: "pipe",
        stderr: "ignore",
      });
      if (result.exitCode !== 0) return false;
      const command = result.stdout.toString();
      return command.includes(handle.executable) && command.includes(handle.originUrl);
    } catch {
      return false;
    }
  }

  async inspect(handle: TunnelProviderHandle): Promise<Result<{ running: boolean }>> {
    const child = this.processes.get(handle.sessionRef);
    if (child) return ok({ running: child.exitCode === null });
    return ok({ running: this.verifiedProcessIsRunning(handle) });
  }

  async revoke(handle: TunnelProviderHandle): Promise<Result<void>> {
    const child = this.processes.get(handle.sessionRef);
    try {
      if (child) {
        if (child.exitCode === null) child.kill();
        await child.exited.catch(() => undefined);
        this.processes.delete(handle.sessionRef);
        return ok(undefined);
      }
      if (this.verifiedProcessIsRunning(handle)) process.kill(handle.processId, "SIGTERM");
      return ok(undefined);
    } catch (error) {
      return err(domainError.provider("Tunnel agent could not be revoked", {
        phase: "tunnel-provider-revoke",
        providerKey: this.key,
        reason: error instanceof Error ? error.message : "unknown",
      }));
    }
  }
}
