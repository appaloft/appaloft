import { describe, expect, test } from "bun:test";
import type { ProxyReloadPlan } from "@yundu/application";
import { executeProxyReloadPlan } from "../src/proxy-reload-execution";

function reloadPlan(input?: {
  command?: string;
  mode?: "automatic" | "command";
}): ProxyReloadPlan {
  const mode = input?.mode ?? "command";
  return {
    providerKey: "test-proxy",
    proxyKind: "traefik",
    displayName: "Test Proxy",
    required: true,
    steps: [
      {
        name: "test-reload",
        mode,
        successMessage: "Test proxy reload completed",
        failureMessage: "Test proxy reload failed",
        ...(mode === "command" ? { command: input?.command ?? "printf reload-ok" } : {}),
        timeoutMs: 5_000,
      },
    ],
  };
}

describe("executeProxyReloadPlan", () => {
  test("EDGE-PROXY-RELOAD-002 executes provider-produced command reload steps", () => {
    const commands: string[] = [];
    const result = executeProxyReloadPlan({
      plan: reloadPlan({ command: "printf reload-ok" }),
      runCommand: (step) => {
        commands.push(step.command ?? "");
        return {
          failed: false,
          stdout: "reload-ok",
          stderr: "",
        };
      },
    });

    expect(result.status).toBe("succeeded");
    expect(commands).toEqual(["printf reload-ok"]);
    expect(result.logs.map((entry) => entry.message)).toContain("Test proxy reload completed");
  });

  test("EDGE-PROXY-RELOAD-003 fails when a provider-produced command reload step fails", () => {
    const result = executeProxyReloadPlan({
      plan: reloadPlan({ command: "false" }),
      runCommand: () => ({
        failed: true,
        stdout: "",
        stderr: "reload failed",
      }),
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe("proxy_reload_failed");
      expect(result.stepName).toBe("test-reload");
      expect(result.retryable).toBe(true);
      expect(result.message).toBe("Test proxy reload failed");
    }
  });

  test("EDGE-PROXY-RELOAD-001 records automatic reload steps without executing commands", () => {
    const commands: string[] = [];
    const result = executeProxyReloadPlan({
      plan: reloadPlan({ mode: "automatic" }),
      runCommand: (step) => {
        commands.push(step.command ?? "");
        return {
          failed: false,
          stdout: "",
          stderr: "",
        };
      },
    });

    expect(result.status).toBe("succeeded");
    expect(commands).toEqual([]);
    expect(result.logs).toEqual([
      expect.objectContaining({
        stepName: "test-reload",
        mode: "automatic",
        message: "Test proxy reload completed",
      }),
    ]);
  });
});
