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

describe("OpenCodeSandboxAgentHarness", () => {
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
      schemaVersion: "opencode-server-marker/v2",
      processId: "spr_server",
      capabilityId: "smc_opencode_runtime",
      expiresAt: "2099-01-01T00:00:00.000Z",
      provider: "appaloft",
      model: "coding-model",
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

  test("[MODEL-ACCESS-BIND-002][MODEL-ACCESS-BIND-003] fails before native startup when the model binding is missing or ambiguous", async () => {
    let issueCalls = 0;
    const execution = {
      async exec() {
        throw new Error("child_must_not_start");
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
          category: "user" as const,
          message: "missing",
          retryable: false,
          details: {},
        });
      },
      async writeFile(_context: unknown, _sandboxId: string, input: { path: string; content: Uint8Array }) {
        return ok({ path: input.path, sizeBytes: input.content.byteLength });
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

    await expect(harness.prepareRuntime?.(baseInput)).rejects.toThrow(
      "sandbox_agent_model_connection_binding_missing",
    );
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
});
