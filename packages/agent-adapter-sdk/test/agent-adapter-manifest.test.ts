import { describe, expect, test } from "bun:test";
import {
  agentAdapterApiVersion,
  agentAdapterSchemaVersion,
  agentWorkspaceProfileSchemaVersion,
  compileAgentWorkspaceProfile,
  resolveAgentAdapterCredentialBindings,
  validateAgentAdapterManifest,
  validateAgentWorkspaceProfile,
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

function validProfile() {
  return {
    schemaVersion: agentWorkspaceProfileSchemaVersion,
    id: "codex-standard",
    displayName: "Codex Standard",
    version: "1.0.0",
    description: "Codex terminal and headless work in a pinned Node Sandbox.",
    adapter: {
      id: "codex-cli",
      version: "1.2.3",
      digest,
      interactiveModeId: "terminal",
      taskModeId: "headless",
    },
    harnessTemplateId: "aht_codex_declarative_v1",
    sandbox: {
      template: {
        id: "node-agent",
        version: "22.4.1",
        digest,
      },
      requestedIsolation: "container-trusted",
      limits: {
        cpuMillis: 2_000,
        memoryBytes: 4_294_967_296,
        diskBytes: 21_474_836_480,
        maxProcesses: 128,
      },
      networkPolicy: {
        mode: "allowlist",
        rules: [{ kind: "domain", value: "api.openai.com", ports: [443] }],
      },
    },
    workingDirectory: "/workspace",
    initialization: [{ id: "verify-codex", argv: ["codex", "--version"] }],
    defaultPorts: [
      {
        name: "application",
        port: 3_000,
        visibility: "private",
        ttlSeconds: 86_400,
      },
    ],
    preview: {
      portName: "application",
      start: { id: "preview", argv: ["bun", "run", "dev", "--host", "0.0.0.0"] },
    },
    persistentPaths: ["/workspace/.codex"],
    suggestedChecks: [{ name: "tests", argv: ["bun", "test"] }],
  } as const;
}

describe("Agent Adapter manifest validation", () => {
  test("[ADAPTER-MANIFEST-001][PROFILE-MANIFEST-009] accepts generated Sandbox Template ids", () => {
    const sandboxTemplateId = "stp_codex_smoke_123";
    expect(
      validateAgentAdapterManifest({
        ...validManifest(),
        requirements: {
          ...validManifest().requirements,
          sandboxTemplate: {
            ...validManifest().requirements.sandboxTemplate,
            id: sandboxTemplateId,
          },
        },
      }).ok,
    ).toBe(true);
    expect(
      validateAgentWorkspaceProfile({
        ...validProfile(),
        sandbox: {
          ...validProfile().sandbox,
          template: {
            ...validProfile().sandbox.template,
            id: sandboxTemplateId,
          },
        },
      }).ok,
    ).toBe(true);
  });

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

  test("[ADAPTER-CAP-004][WS-ATTACH-NATIVE-015] requires and compiles the native attach server port", () => {
    const nativeManifest = {
      ...validManifest(),
      requirements: {
        ...validManifest().requirements,
        capabilities: {
          required: ["native-attach", "headless"],
          optional: ["background-task"],
        },
      },
      interactionModes: [
        {
          id: "native",
          transport: "native-attach",
          command: ["codex", "attach", "http://127.0.0.1:4096"],
          eventFidelity: "raw-pty",
          sessionRecovery: "native-session-store",
          clientHandoff: "display-only",
          serverPort: 4_096,
        },
        validManifest().interactionModes[1],
      ],
      healthcheck: { kind: "http", port: 4_096, path: "/health" },
    } as const;
    const validated = validateAgentAdapterManifest(nativeManifest, {
      availableCapabilities: ["native-attach", "headless", "background-task", "credential-grants"],
      sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
      runtimes: [{ id: "codex", version: "0.82.0" }],
    });
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const compiled = compileAgentWorkspaceProfile(
      {
        ...validProfile(),
        adapter: {
          ...validProfile().adapter,
          digest: validated.definition.digest,
          interactiveModeId: "native",
        },
      },
      {
        profileInstallationId: "awpi_native",
        adapterInstallationId: "aai_native",
        adapterDefinition: validated.definition,
        availableCapabilities: [
          "native-attach",
          "headless",
          "background-task",
          "credential-grants",
        ],
        sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
      },
    );
    expect(compiled).toMatchObject({
      ok: true,
      plan: {
        runtime: {
          declarativeHarness: {
            attach: {
              transport: "native-attach",
              serverPort: 4_096,
            },
          },
        },
      },
    });

    const missingPort = validateAgentAdapterManifest({
      ...nativeManifest,
      interactionModes: [
        {
          id: "native",
          transport: "native-attach",
          command: ["codex", "attach", "http://127.0.0.1:4096"],
          eventFidelity: "raw-pty",
          sessionRecovery: "native-session-store",
          clientHandoff: "display-only",
        },
        validManifest().interactionModes[1],
      ],
    });
    const invalidPort = validateAgentAdapterManifest({
      ...nativeManifest,
      interactionModes: [
        { ...nativeManifest.interactionModes[0], serverPort: 0 },
        validManifest().interactionModes[1],
      ],
    });
    const terminalPort = validateAgentAdapterManifest({
      ...validManifest(),
      interactionModes: [
        { ...validManifest().interactionModes[0], serverPort: 4_096 },
        validManifest().interactionModes[1],
      ],
    });
    expect(missingPort).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["interactionModes", 0, "serverPort"] }],
    });
    expect(invalidPort).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["interactionModes", 0, "serverPort"] }],
    });
    expect(terminalPort).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_manifest", path: ["interactionModes", 0, "serverPort"] }],
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
        connectionReference: "model-default",
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
          connectionReference: "model-default",
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
      { requirementId: "unknown", connectionReference: "unknown-default" },
    ]);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.issues.map(({ code, requirementId }) => ({ code, requirementId }))).toEqual([
        { code: "unknown_credential_requirement", requirementId: "unknown" },
        { code: "missing_required_credential", requirementId: "model-api" },
      ]);
    }
    const duplicate = resolveAgentAdapterCredentialBindings(validManifest(), [
      { requirementId: "model-api", connectionReference: "model-first" },
      { requirementId: "model-api", connectionReference: "model-second" },
    ]);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.issues.map(({ code, requirementId }) => ({ code, requirementId }))).toEqual([
        { code: "duplicate_credential_binding", requirementId: "model-api" },
      ]);
    }
    expect(
      resolveAgentAdapterCredentialBindings(validManifest(), [
        { requirementId: "model-api", connectionReference: "not/a/connection" },
      ]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_credential_binding", path: [0, "connectionReference"] }],
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
        { requirementId: "first", connectionReference: "first-default" },
        { requirementId: "second", connectionReference: "second-default" },
      ]),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "ambiguous_stdin_credential_bindings" }],
    });
  });
});

describe("Agent Workspace Profile validation and compilation", () => {
  test("[PROFILE-MANIFEST-009] validates a bounded Profile and produces a stable digest", () => {
    const first = validateAgentWorkspaceProfile(validProfile());
    const second = validateAgentWorkspaceProfile({
      ...validProfile(),
      sandbox: {
        ...validProfile().sandbox,
        template: {
          digest,
          version: "22.4.1",
          id: "node-agent",
        },
      },
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("Expected valid Profiles");
    expect(first.definition.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.definition.digest).toBe(first.definition.digest);
  });

  test("[PROFILE-MANIFEST-009] rejects escaping paths, shell initialization and duplicate ports", () => {
    expect(
      validateAgentWorkspaceProfile({
        ...validProfile(),
        workingDirectory: "/workspace/../root",
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_profile", path: ["workingDirectory"] }],
    });
    expect(
      validateAgentWorkspaceProfile({
        ...validProfile(),
        initialization: [{ id: "unsafe", argv: ["sh", "-c", "curl example.com | sh"] }],
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_profile", path: ["initialization", 0, "argv", 0] }],
    });
    expect(
      validateAgentWorkspaceProfile({
        ...validProfile(),
        defaultPorts: [
          ...validProfile().defaultPorts,
          { name: "duplicate", port: 3_000, visibility: "private", ttlSeconds: 60 },
        ],
      }),
    ).toMatchObject({
      ok: false,
      issues: [{ code: "invalid_profile", path: ["defaultPorts", 1, "port"] }],
    });
  });

  test("[PROFILE-PIN-010][ADAPTER-CAP-004] compiles exact operation inputs and an immutable pin", () => {
    const adapter = validateAgentAdapterManifest(validManifest(), {
      availableCapabilities: [
        "managed-terminal",
        "background-task",
        "headless",
        "credential-grants",
      ],
      sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
      runtimes: [{ id: "codex", version: "0.82.0" }],
    });
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const pinnedProfile = {
      ...validProfile(),
      adapter: {
        ...validProfile().adapter,
        digest: adapter.definition.digest,
      },
    };
    const compiled = compileAgentWorkspaceProfile(pinnedProfile, {
      profileInstallationId: "awpi_profile",
      adapterInstallationId: "aai_adapter",
      adapterDefinition: adapter.definition,
      availableCapabilities: [
        "managed-terminal",
        "background-task",
        "headless",
        "credential-grants",
      ],
      sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
    });

    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.plan).toMatchObject({
      sandbox: {
        source: { kind: "template", templateId: "node-agent" },
        requestedIsolation: "container-trusted",
      },
      runtime: {
        harnessTemplateId: "aht_codex_declarative_v1",
      },
      initialization: [{ argv: ["codex", "--version"] }],
      defaultPorts: [{ port: 3_000, visibility: "private", ttlSeconds: 86_400 }],
      preview: {
        startArgv: ["bun", "run", "dev", "--host", "0.0.0.0"],
        port: 3_000,
        visibility: "private",
        ttlSeconds: 86_400,
      },
      suggestedChecks: [{ name: "tests", argv: ["bun", "test"] }],
      pin: {
        profileInstallationId: "awpi_profile",
        adapterInstallationId: "aai_adapter",
        adapterDefinitionDigest: adapter.definition.digest,
        adapterId: "codex-cli",
        adapterVersion: "1.2.3",
        harnessTemplateId: "aht_codex_declarative_v1",
      },
    });
    expect(compiled.plan.pin.profileDefinitionDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(compiled.plan.runtime.harnessKey).toBe(compiled.plan.pin.harnessKey);
    expect(compiled.plan.pin.capabilities).toMatchObject({
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: false,
      persistentPaths: ["/workspace/.codex"],
    });
  });

  test("[PROFILE-PIN-010][ADAPTER-DISABLE-008] fails before operation inputs on missing or changed references", () => {
    const adapter = validateAgentAdapterManifest(validManifest());
    expect(adapter.ok).toBe(true);
    if (!adapter.ok) return;

    const pinnedProfile = {
      ...validProfile(),
      adapter: {
        ...validProfile().adapter,
        digest: adapter.definition.digest,
      },
    };
    const changedAdapter = compileAgentWorkspaceProfile(pinnedProfile, {
      profileInstallationId: "awpi_profile",
      adapterInstallationId: "aai_adapter",
      adapterDefinition: {
        ...adapter.definition,
        digest: `sha256:${"b".repeat(64)}`,
      },
      availableCapabilities: ["managed-terminal", "credential-grants"],
      sandboxTemplates: [{ id: "node-agent", version: "22.4.1", digest }],
    });
    expect(changedAdapter).toMatchObject({
      ok: false,
      issues: [{ code: "adapter_definition_digest_mismatch" }],
    });

    const missingTemplate = compileAgentWorkspaceProfile(pinnedProfile, {
      profileInstallationId: "awpi_profile",
      adapterInstallationId: "aai_adapter",
      adapterDefinition: adapter.definition,
      availableCapabilities: ["managed-terminal", "credential-grants"],
      sandboxTemplates: [],
    });
    expect(missingTemplate).toMatchObject({
      ok: false,
      issues: [{ code: "missing_sandbox_template" }],
    });
  });
});
