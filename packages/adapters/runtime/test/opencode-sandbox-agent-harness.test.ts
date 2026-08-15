import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type SandboxExecResult,
  type SandboxProcessDescriptor,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";

import {
  OpenCodeSandboxAgentHarness,
  type OpenCodeSandboxExecutionPort,
} from "../src";

const context = createExecutionContext({
  entrypoint: "worker",
  requestId: "req_opencode_harness",
  tenant: { tenantId: "tenant_opencode" },
});

const modelCredentialBinding = {
  requirementId: "model-api",
  kind: "model-api" as const,
  purpose: "Agent model access",
  delivery: { kind: "stdin" as const },
  connectionReference: "model-connection-opencode",
};

const modelAccess = {
  async issue() {
    return {
      capabilityId: "smc_opencode",
      baseUrl: "http://sandbox-gateway:8788/m/smc_opencode/secret/v1",
      accessToken: "appaloft-scoped-capability",
      provider: "appaloft",
      model: "coding-model",
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
  },
  async revoke() {},
};

function isHealthProbe(input: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2]): boolean {
  return input.argv.some((argument) => argument.endsWith("/global/health"));
}

describe("OpenCodeSandboxAgentHarness", () => {
  test("[AGENT-OPENCODE-011][AGENT-WS-ATTACH-016] reuses a healthy server with a still-valid short-lived capability", async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const marker = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "opencode-server-marker/v2",
        processId: "spr_server",
        capabilityId: "smc_opencode_runtime",
        expiresAt,
        provider: "appaloft",
        model: "coding-model",
      }),
    );
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    let issueCalls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        throw new Error("existing server must not restart");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        throw new Error("existing server must not terminate");
      },
      async readFile() {
        return ok(marker);
      },
      async writeFile() {
        throw new Error("existing marker must not be replaced");
      },
      async removeFile() {
        throw new Error("existing marker must not be removed");
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollIntervalMs: 1,
      modelAccess: {
        async issue() {
          issueCalls += 1;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
    });

    expect(issueCalls).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.argv).toEqual(
      expect.arrayContaining(["curl", "http://127.0.0.1:4096/global/health"]),
    );
  });

  test("[AGENT-OPENCODE-011][AGENT-WS-ATTACH-016] retries a transient marker read without starting a competing server", async () => {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const marker = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "opencode-server-marker/v2",
        processId: "spr_server",
        capabilityId: "smc_opencode_runtime",
        expiresAt,
        provider: "appaloft",
        model: "coding-model",
      }),
    );
    let markerReads = 0;
    let issueCalls = 0;
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        throw new Error("transient marker recovery must not start another server");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        throw new Error("recovered server must not terminate");
      },
      async readFile() {
        markerReads += 1;
        return markerReads === 1
          ? err({
              code: "sandbox_provider_operation_failed",
              category: "provider",
              message: "temporary registered Server read failure",
              retryable: true,
              details: {},
            })
          : ok(marker);
      },
      async writeFile() {
        throw new Error("recovered marker must not be replaced");
      },
      async removeFile() {
        throw new Error("recovered marker must not be removed");
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          issueCalls += 1;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
    });

    expect(markerReads).toBe(2);
    expect(issueCalls).toBe(0);
    expect(calls).toHaveLength(1);
  });

  test("[AGENT-OPENCODE-011][AGENT-WS-ATTACH-016] fails closed on a non-retryable marker read", async () => {
    let issued = false;
    let executed = false;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec() {
        executed = true;
        throw new Error("marker failure must precede execution");
      },
      async listProcesses() {
        throw new Error("marker failure must precede process lookup");
      },
      async terminateProcess() {
        throw new Error("marker failure must precede termination");
      },
      async readFile() {
        return err({
          code: "sandbox_provider_operation_failed",
          category: "provider",
          message: "registered Server read denied",
          retryable: false,
          details: {},
        });
      },
      async writeFile() {
        throw new Error("marker failure must precede write");
      },
      async removeFile() {
        throw new Error("marker failure must precede removal");
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          issued = true;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });

    await expect(
      harness.prepareRuntime?.({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
      }),
    ).rejects.toThrow("registered Server read denied");
    expect(executed).toBe(false);
    expect(issued).toBe(false);
  });

  test("[AGENT-OPENCODE-011][AGENT-WS-ATTACH-016] records startup only after delayed HTTP readiness", async () => {
    const files = new Map<string, Uint8Array>();
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    let healthPolls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.18.4\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          });
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" });
        }
        if (isHealthProbe(input)) {
          healthPolls += 1;
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: healthPolls < 3 ? 7 : 0 }],
          });
        }
        throw new Error("unexpected command");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollAttempts: 4,
      startupPollIntervalMs: 1,
      modelAccess,
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
    });

    expect(healthPolls).toBe(3);
    expect(files.has(".appaloft-agent/sar_open/opencode-process-id")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain("appaloft-scoped-capability");
  });

  test("[AGENT-OPENCODE-011][WS-ATTACH-NATIVE-015][GH-AUTO-NATIVE-STATE-027] keeps one native server and translates independently scoped JSON runs", async () => {
    const files = new Map<string, Uint8Array>();
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const issued: Array<{ runId: string; connectionReference: string }> = [];
    const revoked: Array<{ runId: string; capabilityId: string }> = [];
    let runPolls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" } satisfies SandboxExecResult);
        }
        files.set(
          "app/.appaloft-agent/srun_open/stdout.jsonl",
          new TextEncoder().encode(
            '{"type":"text","sessionID":"ses_open","part":{"text":"done"}}\n',
          ),
        );
        files.set("app/.appaloft-agent/srun_open/stderr.log", new Uint8Array());
        files.set("app/.appaloft-agent/srun_open/exit-code", new TextEncoder().encode("0"));
        return ok({ mode: "background", processId: "spr_run" } satisfies SandboxExecResult);
      },
      async listProcesses() {
        runPolls += 1;
        return ok(
          runPolls < 3
            ? ([
                { processId: "spr_server", status: "running" },
                { processId: "spr_run", status: "running" },
              ] satisfies SandboxProcessDescriptor[])
            : ([
                { processId: "spr_server", status: "running" },
                { processId: "spr_run", status: "exited", exitCode: 0 },
              ] satisfies SandboxProcessDescriptor[]),
        );
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      cwd: "app",
      port: 4096,
      startupPollIntervalMs: 1,
      modelAccess: {
        async issue(input) {
          issued.push({
            runId: input.runId,
            connectionReference: input.credentialBinding.connectionReference,
          });
          const capability = await modelAccess.issue();
          const capabilityId =
            input.runId === "sar_open" ? "smc_opencode_runtime" : "smc_opencode_run";
          return {
            ...capability,
            capabilityId,
            baseUrl: `http://sandbox-gateway:8788/m/${capabilityId}/secret/v1`,
            expiresAt:
              input.runId === "sar_open"
                ? capability.expiresAt
                : new Date(Date.now() + 5 * 60_000).toISOString(),
          };
        },
        async revoke(input) {
          revoked.push({ runId: input.runId, capabilityId: input.capabilityId });
        },
      },
    });

    expect(
      harness.admitSandbox({ kind: "template", templateId: "stp_opencode_pinned" }),
    ).toBe(true);
    expect(harness.interaction).toEqual({
      transport: "native-attach",
      command: ["opencode", "attach", "http://127.0.0.1:4096", "--dir", "/workspace/app"],
      sessionRecovery: "native-session-store",
      clientHandoff: "local-client-exec",
      serverPort: 4096,
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
    });
    const emitted: Array<{ type: string; data: Record<string, unknown> }> = [];
    const result = await harness.execute({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
      runId: "srun_open",
      task: "Build it",
      context: { mode: "fresh" },
      requestApproval: async () => "rejected",
      emitEvent: async (event) => {
        emitted.push(event);
      },
    });

    const server = calls.find(
      (call) => Array.isArray(call.argv) && call.argv.includes("serve"),
    );
    expect(server).toMatchObject({
      background: true,
      argv: expect.arrayContaining([
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        "XDG_CONFIG_HOME=/workspace/.config",
        "XDG_STATE_HOME=/workspace/.local/state",
        "XDG_CACHE_HOME=/workspace/.cache",
        "serve",
        "--hostname",
        "0.0.0.0",
        "--port",
        "4096",
      ]),
    });
    expect(server?.stdin).toBeInstanceOf(Uint8Array);
    expect(JSON.stringify(server?.argv)).not.toContain("/secret/");
    expect(JSON.stringify(server?.argv)).not.toContain("appaloft-scoped-capability");
    const validations = calls.filter(
      (call) => Array.isArray(call.argv) && call.argv.includes("debug") && call.argv.includes("config"),
    );
    expect(validations).toHaveLength(2);
    for (const validation of validations) {
      const validationArgv = [...validation.argv];
      expect(validationArgv).toEqual(expect.arrayContaining(["debug", "config"]));
      expect(validation.background).not.toBe(true);
      expect(validation.stdin).toBeInstanceOf(Uint8Array);
      expect(validationArgv.some((argument) => argument.includes(">/dev/null 2>&1"))).toBe(true);
      expect(JSON.stringify(validationArgv)).not.toContain("/secret/");
      expect(JSON.stringify(validationArgv)).not.toContain("appaloft-scoped-capability");
    }
    const run = calls.find((call) => Array.isArray(call.argv) && call.argv.includes("run"));
    expect(run?.argv).toEqual(
      expect.arrayContaining([
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        "XDG_CONFIG_HOME=/workspace/.config",
        "XDG_STATE_HOME=/workspace/.local/state",
        "XDG_CACHE_HOME=/workspace/.cache",
        "run",
        "--dir",
        "/workspace/app",
        "--model",
        "appaloft/coding-model",
        "--format",
        "json",
        "--auto",
        "Build it",
      ]),
    );
    expect(run?.argv).not.toContain("--attach");
    expect(run?.cwd).toBe("app");
    expect(run?.stdin).toBeInstanceOf(Uint8Array);
    expect(JSON.stringify(run?.argv)).not.toContain("/secret/");
    expect(JSON.stringify(run?.argv)).not.toContain("appaloft-scoped-capability");
    expect(new TextDecoder().decode(run?.stdin)).toContain(
      "http://sandbox-gateway:8788/m/smc_opencode_run/secret/v1",
    );
    expect(JSON.parse(new TextDecoder().decode(run?.stdin).split("\n")[0] ?? "null")).toEqual({
      model: "appaloft/coding-model",
      snapshot: false,
      skills: { paths: ["/workspace/skills", "/workspace/.agents/skills"] },
      provider: {
        appaloft: {
          npm: "@ai-sdk/openai-compatible",
          name: "Appaloft scoped model gateway",
          options: {
            baseURL: "http://sandbox-gateway:8788/m/smc_opencode_run/secret/v1",
            apiKey: "{env:APPALOFT_MODEL_ACCESS_TOKEN}",
          },
          models: {
            "coding-model": { name: "coding-model" },
          },
        },
      },
    });
    expect(emitted).toEqual([
      {
        type: "text",
        data: {
          type: "text",
          sessionID: "ses_open",
          part: { text: "done" },
        },
      },
    ]);
    expect(result.outcomeDigest).toStartWith("sha256:");
    expect(issued).toEqual([
      { runId: "sar_open", connectionReference: "model-connection-opencode" },
      { runId: "srun_open", connectionReference: "model-connection-opencode" },
    ]);
    expect(revoked).toEqual([
      { runId: "srun_open", capabilityId: "smc_opencode_run" },
    ]);
    expect(
      JSON.parse(
        new TextDecoder().decode(files.get(".appaloft-agent/sar_open/opencode-process-id")),
      ),
    ).toEqual({
      schemaVersion: "opencode-server-marker/v3",
      processId: "spr_server",
      capabilityId: "smc_opencode_runtime",
      expiresAt: "2099-01-01T00:00:00.000Z",
      provider: "appaloft",
      model: "coding-model",
      mcpBindingDigest:
        "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
      githubAccessDigest:
        "sha256:0e2a58cbed86012305595b865bcee8336c718c4f6658a667354dbb26f5f5662f",
      mcpCapabilities: [],
    });
  });

  test("[GH-AUTO-NATIVE-STATE-027] rejects an invalid pinned native config before server startup", async () => {
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const revoked: string[] = [];
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.18.4\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        return ok({
          mode: "foreground",
          frames: [
            { kind: "stderr", sequence: 1, data: "Configuration is invalid at a secret path" },
            { kind: "exit", sequence: 2, exitCode: 1 },
          ],
        } satisfies SandboxExecResult);
      },
      async listProcesses() {
        return ok([]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile() {
        return err({
          code: "sandbox_file_not_found",
          category: "user",
          message: "missing",
          retryable: false,
          details: {},
        });
      },
      async writeFile() {
        throw new Error("unexpected write");
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          return modelAccess.issue();
        },
        async revoke(input) {
          revoked.push(input.capabilityId);
        },
      },
    });

    expect(
      harness.prepareRuntime?.({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
      }),
    ).rejects.toThrow("opencode_harness_config_invalid");
    expect(calls.some((call) => call.argv.includes("serve"))).toBe(false);
    expect(revoked).toEqual(["smc_opencode"]);
    expect(JSON.stringify(calls)).not.toContain("appaloft-scoped-capability");
  });

  test("[GH-AUTO-NATIVE-STATE-027] rejects an invalid run-scoped config before headless startup", async () => {
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const revoked: string[] = [];
    const marker = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "opencode-server-marker/v2",
        processId: "spr_server",
        capabilityId: "smc_opencode_runtime",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provider: "appaloft",
        model: "coding-model",
      }),
    );
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        return ok({
          mode: "foreground",
          frames: [
            { kind: "stderr", sequence: 1, data: "Configuration is invalid" },
            { kind: "exit", sequence: 2, exitCode: 1 },
          ],
        } satisfies SandboxExecResult);
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        return input.path.endsWith("opencode-process-id")
          ? ok(marker)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile() {
        throw new Error("unexpected write");
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          return {
            ...(await modelAccess.issue()),
            capabilityId: "smc_opencode_run",
          };
        },
        async revoke(input) {
          revoked.push(input.capabilityId);
        },
      },
    });

    await expect(
      harness.execute({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
        runId: "srun_open",
        task: "Build it",
        context: { mode: "fresh" },
        requestApproval: async () => "rejected",
      }),
    ).rejects.toThrow("opencode_harness_config_invalid");
    expect(calls.some((call) => call.background === true)).toBe(false);
    expect(revoked).toEqual(["smc_opencode_run"]);
  });

  test("[AGENT-WS-OPEN-008] rejects and revokes a run capability without the startup safety window", async () => {
    const revoked: string[] = [];
    const marker = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "opencode-server-marker/v2",
        processId: "spr_server",
        capabilityId: "smc_opencode_runtime",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provider: "appaloft",
        model: "coding-model",
      }),
    );
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        throw new Error("near-expiry capability must fail before child startup");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        return input.path.endsWith("opencode-process-id")
          ? ok(marker)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile() {
        throw new Error("unexpected write");
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.18.4",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          return {
            ...(await modelAccess.issue()),
            capabilityId: "smc_opencode_near_expiry",
            expiresAt: new Date(Date.now() + 20_000).toISOString(),
          };
        },
        async revoke(input) {
          revoked.push(input.capabilityId);
        },
      },
    });

    await expect(
      harness.execute({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
        runId: "srun_near_expiry",
        task: "Fail before startup",
        context: { mode: "fresh" },
        requestApproval: async () => "rejected",
      }),
    ).rejects.toThrow("opencode_model_access_invalid");
    expect(revoked).toEqual(["smc_opencode_near_expiry"]);
  });

  test("[AGENT-OPENCODE-011] cleans server and model capability when durable startup state fails", async () => {
    const terminated: string[] = [];
    const revoked: string[] = [];
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          });
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        return ok({ mode: "background", processId: "spr_server" });
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess(_context, _sandboxId, processId) {
        terminated.push(processId);
        return ok(undefined);
      },
      async readFile() {
        return err({
          code: "sandbox_file_not_found",
          category: "user",
          message: "missing",
          retryable: false,
          details: {},
        });
      },
      async writeFile() {
        return err({
          code: "sandbox_marker_write_failed",
          category: "system",
          message: "marker unavailable",
          retryable: true,
          details: {},
        });
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollIntervalMs: 1,
      modelAccess: {
        ...modelAccess,
        async revoke(input) {
          revoked.push(input.capabilityId);
        },
      },
    });

    await expect(
      harness.prepareRuntime?.({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
      }),
    ).rejects.toThrow("marker unavailable");
    expect(terminated).toEqual(["spr_server"]);
    expect(revoked).toEqual(["smc_opencode"]);
  });

  test("[AGENT-WS-OPEN-008] revokes the run capability when headless execution fails", async () => {
    const revoked: Array<{ runId: string; capabilityId: string }> = [];
    const files = new Map<string, Uint8Array>([
      [
        ".appaloft-agent/sar_open/opencode-process-id",
        new TextEncoder().encode(
          JSON.stringify({
            schemaVersion: "opencode-server-marker/v2",
            processId: "spr_server",
            capabilityId: "smc_opencode_runtime",
            expiresAt: "2099-01-01T00:00:00.000Z",
            provider: "appaloft",
            model: "coding-model",
          }),
        ),
      ],
      [".appaloft-agent/srun_failed/stdout.jsonl", new Uint8Array()],
      [
        ".appaloft-agent/srun_failed/stderr.log",
        new TextEncoder().encode("provider unavailable"),
      ],
      [".appaloft-agent/srun_failed/exit-code", new TextEncoder().encode("1")],
    ]);
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        return ok({ mode: "background", processId: "spr_run" });
      },
      async listProcesses() {
        return ok([
          { processId: "spr_server", status: "running" },
          { processId: "spr_run", status: "exited", exitCode: 1 },
        ]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollIntervalMs: 1,
      modelAccess: {
        ...modelAccess,
        async issue(input) {
          const capability = await modelAccess.issue();
          return {
            ...capability,
            capabilityId:
              input.runId === "sar_open" ? "smc_opencode_runtime" : "smc_opencode_failed",
            expiresAt:
              input.runId === "sar_open"
                ? capability.expiresAt
                : new Date(Date.now() + 5 * 60_000).toISOString(),
          };
        },
        async revoke(input) {
          revoked.push({ runId: input.runId, capabilityId: input.capabilityId });
        },
      },
    });

    await expect(
      harness.execute({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
        runId: "srun_failed",
        task: "Fail safely",
        context: { mode: "fresh" },
        requestApproval: async () => "rejected",
      }),
    ).rejects.toThrow("provider unavailable");
    expect(revoked).toEqual([
      { runId: "srun_failed", capabilityId: "smc_opencode_failed" },
    ]);
  });

  test("[AGENT-OPENCODE-011][SBX-RUNTIME-005][GH-AUTO-RUNTIME-HOME-024] uses the provider workspace home for native probes and preserves exec errors", async () => {
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        return err({
          code: "sandbox_exec_rejected",
          category: "user",
          message: "Sandbox exec was rejected",
          retryable: false,
          details: {},
        });
      },
      async listProcesses() {
        return ok([]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile() {
        return err({
          code: "sandbox_file_not_found",
          category: "user",
          message: "missing",
          retryable: false,
          details: {},
        });
      },
      async writeFile(_context, _sandboxId, input) {
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile() {
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess,
    });

    await expect(
      harness.prepareRuntime?.({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        credentialBindings: [modelCredentialBinding],
      }),
    ).rejects.toThrow("Sandbox exec was rejected");
    expect(calls).toEqual([
      {
        argv: [
          "env",
          "HOME=/workspace",
          "XDG_DATA_HOME=/workspace/.local/share",
          "XDG_CONFIG_HOME=/workspace/.config",
          "XDG_STATE_HOME=/workspace/.local/state",
          "XDG_CACHE_HOME=/workspace/.cache",
          "opencode",
          "--version",
        ],
      },
    ]);
  });

  test("[WS-REMOTE-PROFILE-008] starts OpenCode occupancy without a required model binding", async () => {
    const files = new Map<string, Uint8Array>();
    let issueCalls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" });
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        throw new Error("unexpected command");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollAttempts: 1,
      startupPollIntervalMs: 0,
      modelAccess: {
        async issue() {
          issueCalls += 1;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    });

    expect(issueCalls).toBe(0);
    const marker = files.get(".appaloft-agent/sar_open/opencode-process-id");
    expect(marker).toBeDefined();
    expect(JSON.parse(new TextDecoder().decode(marker)).capabilityId).toBe("vendor-login");
  });

  test("[WS-REMOTE-GITHUB-DELIVERY-022] injects GH_TOKEN into occupancy OpenCode serve without argv leakage", async () => {
    const files = new Map<string, Uint8Array>();
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" });
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        throw new Error("unexpected command");
      },
      async listProcesses() {
        return ok([{ processId: "spr_server", status: "running" }]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollAttempts: 1,
      startupPollIntervalMs: 0,
      githubAccess: {
        async getAccessToken() {
          return "gho_occupancy-delivery-token";
        },
      },
    });

    await harness.prepareRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    });

    const serve = calls.find((call) => call.argv.includes("serve"));
    expect(JSON.stringify(serve?.argv)).not.toContain("gho_occupancy-delivery-token");
    expect(new TextDecoder().decode(serve?.stdin)).toContain("gho_occupancy-delivery-token");
    expect(serve?.argv.some((argument) => argument.includes("GH_TOKEN"))).toBe(true);
    const marker = JSON.parse(
      new TextDecoder().decode(files.get(".appaloft-agent/sar_open/opencode-process-id")),
    ) as { githubAccessDigest?: string };
    expect(marker.githubAccessDigest).toMatch(/^sha256:/);
  });


  test("[R8-OCC-TASK-004] attaches occupancy headless run to the vendor-login OpenCode server", async () => {
    const files = new Map<string, Uint8Array>();
    const calls: Parameters<OpenCodeSandboxExecutionPort["exec"]>[2][] = [];
    let issueCalls = 0;
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        calls.push(input);
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" });
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("run")) {
          files.set(
            ".appaloft-agent/srun_open/stdout.jsonl",
            new TextEncoder().encode(`${JSON.stringify({ type: "text", part: { text: "done" } })}\n`),
          );
          files.set(".appaloft-agent/srun_open/stderr.log", new Uint8Array());
          files.set(".appaloft-agent/srun_open/exit-code", new TextEncoder().encode("0"));
          return ok({ mode: "background", processId: "spr_run" });
        }
        throw new Error("unexpected command");
      },
      async listProcesses() {
        return ok([
          { processId: "spr_server", status: "running" },
          { processId: "spr_run", status: "exited" },
        ]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollAttempts: 1,
      startupPollIntervalMs: 0,
      modelAccess: {
        async issue() {
          issueCalls += 1;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });

    const result = await harness.execute({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      runId: "srun_open",
      task: "open a PR",
      context: { mode: "fresh" },
      idempotencyKey: "run_occupancy_vendor",
    });

    expect(issueCalls).toBe(0);
    expect(result.outcomeDigest).toStartWith("sha256:");
    const run = calls.find((call) => Array.isArray(call.argv) && call.argv.includes("run"));
    expect(run?.argv).toEqual(
      expect.arrayContaining(["run", "--attach", "http://127.0.0.1:4096", "--format", "json", "--auto", "open a PR"]),
    );
    expect(run?.argv).not.toContain("--model");
    expect(new TextDecoder().decode(run?.stdin)).toBe("\n\n");
  });

  test("[R8-OCC-TASK-005] fails closed when vendor-login OpenCode exits empty", async () => {
    const files = new Map<string, Uint8Array>();
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (input.argv.includes("--version")) {
          return ok({
            mode: "foreground",
            frames: [
              { kind: "stdout", sequence: 1, data: "1.1.60\n" },
              { kind: "exit", sequence: 2, exitCode: 0 },
            ],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("serve")) {
          return ok({ mode: "background", processId: "spr_server" });
        }
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          } satisfies SandboxExecResult);
        }
        if (input.argv.includes("run")) {
          files.set(".appaloft-agent/srun_empty/stdout.jsonl", new Uint8Array());
          files.set(".appaloft-agent/srun_empty/stderr.log", new Uint8Array());
          files.set(".appaloft-agent/srun_empty/exit-code", new TextEncoder().encode("0"));
          return ok({ mode: "background", processId: "spr_run" });
        }
        throw new Error("unexpected command");
      },
      async listProcesses() {
        return ok([
          { processId: "spr_server", status: "running" },
          { processId: "spr_run", status: "exited" },
        ]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        const value = files.get(input.path);
        return value
          ? ok(value)
          : err({
              code: "sandbox_file_not_found",
              category: "user",
              message: "missing",
              retryable: false,
              details: {},
            });
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollAttempts: 1,
      startupPollIntervalMs: 0,
      modelAccess,
    });

    await expect(
      harness.execute({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
        runId: "srun_empty",
        task: "open a PR",
        context: { mode: "fresh" },
        idempotencyKey: "run_occupancy_empty",
      }),
    ).rejects.toThrow("opencode_empty_run_result");
  });




  test("[MODEL-ACCESS-BIND-003] fails before native startup when the model binding is ambiguous", async () => {
    const context = createExecutionContext({ requestId: "req_open" });
    let issueCalls = 0;
    const execution = {
      async exec() {
        issueCalls += 1;
        return ok({
          mode: "foreground" as const,
          exitCode: 0,
          stdout: new TextEncoder().encode("1.1.60"),
          stderr: new Uint8Array(),
        });
      },
      async listProcesses() {
        return ok([]);
      },
      async terminateProcess() {
        return ok(undefined);
      },
      async readFile() {
        return err({ message: "missing", retryable: false });
      },
      async writeFile() {
        return ok({ path: "unused", sizeBytes: 0 });
      },
      async removeFile() {
        return ok(undefined);
      },
    } satisfies OpenCodeSandboxExecutionPort;
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        async issue() {
          issueCalls += 1;
          return modelAccess.issue();
        },
        async revoke() {},
      },
    });
    const baseInput = {
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    };

    await expect(
      harness.prepareRuntime?.({
        ...baseInput,
        credentialBindings: [
          modelCredentialBinding,
          { ...modelCredentialBinding, connectionReference: "model-connection-other" },
        ],
      }),
    ).rejects.toThrow("sandbox_agent_model_connection_binding_ambiguous");
    expect(issueCalls).toBe(0);
  });


  test("[AGENT-WS-OPEN-008] cancellation stops the headless child and runtime termination stops the native server", async () => {
    const terminated: string[] = [];
    const revoked: Array<{ runId: string; capabilityId: string }> = [];
    const files = new Map<string, Uint8Array>([
      [
        ".appaloft-agent/sar_open/opencode-process-id",
        new TextEncoder().encode(
          JSON.stringify({
            schemaVersion: "opencode-server-marker/v2",
            processId: "spr_server",
            capabilityId: "smc_opencode",
            expiresAt: "2099-01-01T00:00:00.000Z",
            provider: "appaloft",
            model: "coding-model",
          }),
        ),
      ],
    ]);
    const execution: OpenCodeSandboxExecutionPort = {
      async exec(_context, _sandboxId, input) {
        if (isHealthProbe(input)) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        if (input.argv.includes("debug") && input.argv.includes("config")) {
          return ok({
            mode: "foreground",
            frames: [{ kind: "exit", sequence: 1, exitCode: 0 }],
          });
        }
        return ok({ mode: "background", processId: "spr_run" });
      },
      async listProcesses() {
        return ok([
          { processId: "spr_server", status: "running" },
          { processId: "spr_run", status: "running" },
        ]);
      },
      async terminateProcess(_context, _sandboxId, processId) {
        terminated.push(processId);
        return ok(undefined);
      },
      async readFile(_context, _sandboxId, input) {
        return ok(files.get(input.path) ?? new Uint8Array());
      },
      async writeFile(_context, _sandboxId, input) {
        files.set(input.path, input.content);
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
      },
      async removeFile(_context, _sandboxId, input) {
        files.delete(input.path);
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      startupPollIntervalMs: 1,
      modelAccess: {
        ...modelAccess,
        async revoke(input) {
          revoked.push({ runId: input.runId, capabilityId: input.capabilityId });
        },
      },
    });

    const running = harness.execute({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      credentialBindings: [modelCredentialBinding],
      runId: "srun_cancel",
      task: "Keep working",
      context: { mode: "continue", parentRunId: "srun_parent" },
      requestApproval: async () => "rejected",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await harness.cancel({
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
      runId: "srun_cancel",
    });
    await expect(running).rejects.toThrow("opencode_process_cancelled");
    await harness.terminateRuntime?.({
      executionContext: context,
      sandboxId: "sbx_open",
      runtimeId: "sar_open",
    });

    expect(terminated).toEqual(["spr_run", "spr_server"]);
    expect(revoked).toEqual([
      { runId: "srun_cancel", capabilityId: "smc_opencode" },
      { runId: "sar_open", capabilityId: "smc_opencode" },
    ]);
  });

  test("[MCP-ACCESS-REVOKE-007] runtime termination attempts every revoke after process failure", async () => {
    const cleanup: string[] = [];
    const marker = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "opencode-server-marker/v3",
        processId: "spr_server",
        capabilityId: "smc_server",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provider: "appaloft",
        model: "coding-model",
        mcpBindingDigest: `sha256:${"a".repeat(64)}`,
        mcpCapabilities: [
          { capabilityId: "mcp_cap_server", expiresAt: "2099-01-01T00:00:00.000Z" },
        ],
      }),
    );
    const execution: OpenCodeSandboxExecutionPort = {
      async exec() {
        return ok({ mode: "foreground", frames: [] });
      },
      async listProcesses() {
        return ok([]);
      },
      async terminateProcess() {
        cleanup.push("process");
        return err({
          code: "sandbox_process_terminate_failed",
          category: "system",
          message: "terminate failed",
          retryable: true,
          details: {},
        });
      },
      async readFile() {
        return ok(marker);
      },
      async writeFile() {
        return ok({ path: "unused", sizeBytes: 0 });
      },
      async removeFile() {
        cleanup.push("marker");
        return ok(undefined);
      },
    };
    const harness = new OpenCodeSandboxAgentHarness(execution, {
      templateId: "aht_opencode_managed_v1",
      sandboxTemplateId: "stp_opencode_pinned",
      version: "1.1.60",
      templateDigest: `sha256:${"b".repeat(64)}`,
      modelAccess: {
        ...modelAccess,
        async revoke() {
          cleanup.push("model");
        },
      },
      mcpAccess: {
        async issue() {
          throw new Error("not used");
        },
        async revoke() {
          cleanup.push("mcp");
        },
        async revokeScope() {
          cleanup.push("scope");
        },
      },
    });

    await expect(
      harness.terminateRuntime?.({
        executionContext: context,
        sandboxId: "sbx_open",
        runtimeId: "sar_open",
      }),
    ).rejects.toThrow("terminate failed");
    expect(cleanup).toEqual(["process", "model", "mcp", "scope", "marker"]);
  });
});
