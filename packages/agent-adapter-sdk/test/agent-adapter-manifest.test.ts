import { describe, expect, test } from "bun:test";
import {
  agentAdapterApiVersion,
  agentAdapterSchemaVersion,
  resolveAgentAdapterCredentialBindings,
  validateAgentAdapterManifest,
} from "../src";

const digest = `sha256:${"a".repeat(64)}`;

function validManifest() {
  return {
    schemaVersion: agentAdapterSchemaVersion,
    id: "codex-cli",
    displayName: "Codex CLI",
    version: "1.2.3",
    description: "Run Codex through its own terminal or headless client.",
    kind: "declarative",
    requirements: {
      adapterApi: `>=${agentAdapterApiVersion} <2.0.0`,
      sandboxTemplate: {
        id: "node-agent",
        version: ">=22.0.0 <23.0.0",
        digest,
      },
      runtimes: [{ id: "codex", version: ">=0.1.0 <1.0.0" }],
      capabilities: {
        required: ["managed-terminal", "credential-grants"],
        optional: ["background-task"],
      },
    },
    interactionModes: [
      {
        id: "terminal",
        transport: "terminal",
        command: ["codex"],
        eventFidelity: "raw-pty",
        sessionRecovery: "process-lifetime",
      },
      {
        id: "headless",
        transport: "headless",
        command: ["codex", "exec"],
        taskInput: "append-argument",
        eventFidelity: "line-events",
        sessionRecovery: "managed-run-lineage",
      },
    ],
    persistentPaths: ["/workspace/.codex"],
    healthcheck: { kind: "process" },
    credentials: [
      {
        id: "model-api",
        kind: "model-api",
        required: true,
        purpose: "Call the configured model provider.",
        delivery: {
          kind: "process-environment",
          variable: "OPENAI_API_KEY",
        },
      },
    ],
  } as const;
}

describe("Agent Adapter manifest validation", () => {
  test("[ADAPTER-MANIFEST-001] normalizes a manifest and produces a stable digest", () => {
    const first = validateAgentAdapterManifest(validManifest(), {
      availableCapabilities: ["credential-grants", "managed-terminal"],
      sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
      runtimes: [{ id: "codex", version: "0.82.0" }],
    });
    const reordered = {
      ...validManifest(),
      requirements: {
        ...validManifest().requirements,
        capabilities: {
          optional: ["background-task"],
          required: ["managed-terminal", "credential-grants"],
        },
      },
    };
    const second = validateAgentAdapterManifest(reordered, {
      availableCapabilities: ["managed-terminal", "credential-grants"],
      sandboxTemplates: [{ digest, version: "22.4.1", id: "node-agent" }],
      runtimes: [{ version: "0.82.0", id: "codex" }],
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected valid definitions");
    expect(first.definition.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.definition.digest).toBe(first.definition.digest);
    expect(first.definition.compatibility).toEqual({
      status: "compatible",
      unavailableOptionalCapabilities: ["background-task"],
    });
  });

  test("[ADAPTER-MANIFEST-002] fails closed on schema and Adapter API incompatibility", () => {
    const unknownSchema = validateAgentAdapterManifest({
      ...validManifest(),
      schemaVersion: "appaloft.agent-adapter/v2",
    });
    const incompatibleApi = validateAgentAdapterManifest({
      ...validManifest(),
      requirements: {
        ...validManifest().requirements,
        adapterApi: ">=2.0.0 <3.0.0",
      },
    });

    expect(unknownSchema).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["schemaVersion"] }],
    });
    expect(incompatibleApi).toMatchObject({
      ok: false,
      issues: [{ code: "incompatible_adapter_api", path: ["requirements", "adapterApi"] }],
    });
  });

  test("[ADAPTER-TRUST-003] rejects code entrypoints and shell command strings", () => {
    const codeEntrypoint = validateAgentAdapterManifest({
      ...validManifest(),
      entrypoint: "./adapter.js",
    });
    const shellCommand = validateAgentAdapterManifest({
      ...validManifest(),
      interactionModes: [
        {
          id: "terminal",
          transport: "terminal",
          command: ["sh", "-c", "codex"],
          eventFidelity: "raw-pty",
          sessionRecovery: "process-lifetime",
        },
      ],
    });

    expect(codeEntrypoint).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: [] }],
    });
    expect(shellCommand).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["interactionModes", 0, "command", 0] }],
    });
  });

  test("[ADAPTER-CAP-004] rejects missing required capabilities but only reports optional gaps", () => {
    const missingRequired = validateAgentAdapterManifest(validManifest(), {
      availableCapabilities: ["credential-grants"],
    });
    const optionalGap = validateAgentAdapterManifest(validManifest(), {
      availableCapabilities: ["managed-terminal", "credential-grants"],
    });

    expect(missingRequired).toMatchObject({
      ok: false,
      issues: [
        {
          code: "missing_required_capability",
          path: ["requirements", "capabilities", "required"],
        },
      ],
    });
    expect(optionalGap.ok).toBe(true);
    if (!optionalGap.ok) throw new Error("Expected optional capability gap to be accepted");
    expect(optionalGap.definition.compatibility.unavailableOptionalCapabilities).toEqual([
      "background-task",
    ]);
  });

  test("[ADAPTER-MANIFEST-002] verifies exact template digest and runtime versions", () => {
    const templateMismatch = validateAgentAdapterManifest(validManifest(), {
      sandboxTemplates: [
        {
          id: "node-agent",
          version: "22.4.1",
          digest: `sha256:${"b".repeat(64)}`,
        },
      ],
    });
    const runtimeMismatch = validateAgentAdapterManifest(validManifest(), {
      runtimes: [{ id: "codex", version: "1.1.0" }],
    });

    expect(templateMismatch).toMatchObject({
      ok: false,
      issues: [
        {
          code: "sandbox_template_digest_mismatch",
          path: ["requirements", "sandboxTemplate", "digest"],
        },
      ],
    });
    expect(runtimeMismatch).toMatchObject({
      ok: false,
      issues: [
        {
          code: "incompatible_runtime_version",
          path: ["requirements", "runtimes", 0, "version"],
        },
      ],
    });
  });

  test("[ADAPTER-EVENT-005] enforces event fidelity and task-input combinations", () => {
    const terminalLines = validateAgentAdapterManifest({
      ...validManifest(),
      interactionModes: [
        {
          id: "terminal",
          transport: "terminal",
          command: ["codex"],
          eventFidelity: "line-events",
          sessionRecovery: "process-lifetime",
        },
      ],
    });
    const headlessWithoutTaskInput = validateAgentAdapterManifest({
      ...validManifest(),
      interactionModes: [
        {
          id: "headless",
          transport: "headless",
          command: ["codex", "exec"],
          eventFidelity: "line-events",
          sessionRecovery: "managed-run-lineage",
        },
      ],
    });

    expect(terminalLines).toMatchObject({
      ok: false,
      issues: [
        {
          code: "invalid_manifest",
          path: ["interactionModes", 0, "eventFidelity"],
        },
      ],
    });
    expect(headlessWithoutTaskInput).toMatchObject({
      ok: false,
      issues: [
        {
          code: "invalid_manifest",
          path: ["interactionModes", 0, "taskInput"],
        },
      ],
    });
  });

  test("[ADAPTER-CRED-006] rejects credential values and unsafe persistent paths", () => {
    const credentialValue = validateAgentAdapterManifest({
      ...validManifest(),
      credentials: [
        {
          ...validManifest().credentials[0],
          value: "secret",
        },
      ],
    });
    const escapingPath = validateAgentAdapterManifest({
      ...validManifest(),
      persistentPaths: ["/workspace/../root"],
    });

    expect(credentialValue).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["credentials", 0] }],
    });
    expect(escapingPath).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["persistentPaths", 0] }],
    });
  });

  test("[ADAPTER-CRED-006] resolves required credential references without secret values", () => {
    const resolved = resolveAgentAdapterCredentialBindings(validManifest(), [
      {
        requirementId: "model-api",
        secretRef: "vault://agents/codex#openai-api-key",
      },
    ]);

    expect(resolved).toEqual({
      ok: true,
      bindings: [
        {
          requirementId: "model-api",
          kind: "model-api",
          purpose: "Call the configured model provider.",
          delivery: {
            kind: "process-environment",
            variable: "OPENAI_API_KEY",
          },
          secretRef: "vault://agents/codex#openai-api-key",
        },
      ],
    });
    expect(JSON.stringify(resolved)).not.toContain("secretValue");
  });

  test("[ADAPTER-CRED-006] rejects missing, unknown, duplicate, raw and ambiguous stdin bindings", () => {
    expect(resolveAgentAdapterCredentialBindings(validManifest(), [])).toMatchObject({
      ok: false,
      issues: [{ code: "missing_required_credential", requirementId: "model-api" }],
    });
    const unknown = resolveAgentAdapterCredentialBindings(validManifest(), [
      { requirementId: "unknown", secretRef: "vault://agents/unknown#token" },
    ]);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.issues.map(({ code, requirementId }) => ({ code, requirementId }))).toEqual([
        { code: "unknown_credential_requirement", requirementId: "unknown" },
        { code: "missing_required_credential", requirementId: "model-api" },
      ]);
    }
    const duplicate = resolveAgentAdapterCredentialBindings(validManifest(), [
      { requirementId: "model-api", secretRef: "vault://agents/codex#first" },
      { requirementId: "model-api", secretRef: "vault://agents/codex#second" },
    ]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.issues.map(({ code, requirementId }) => ({ code, requirementId }))).toEqual([
        { code: "duplicate_credential_binding", requirementId: "model-api" },
      ]);
    }
    expect(
      resolveAgentAdapterCredentialBindings(validManifest(), [
        { requirementId: "model-api", secretRef: "raw-model-api-key" },
      ]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_credential_binding", path: [0, "secretRef"] }],
    });

    const stdinManifest = {
      ...validManifest(),
      credentials: [
        {
          id: "first",
          kind: "custom",
          required: true,
          purpose: "First stdin credential.",
          delivery: { kind: "stdin" },
        },
        {
          id: "second",
          kind: "custom",
          required: true,
          purpose: "Second stdin credential.",
          delivery: { kind: "stdin" },
        },
      ],
    } as const;
    expect(
      resolveAgentAdapterCredentialBindings(stdinManifest, [
        { requirementId: "first", secretRef: "secret://agents/first" },
        { requirementId: "second", secretRef: "secret://agents/second" },
      ]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "ambiguous_stdin_credential_bindings" }],
    });
  });
});
