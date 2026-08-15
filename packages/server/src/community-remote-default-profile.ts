import {
  validateAgentAdapterManifest,
  validateAgentWorkspaceProfile,
} from "@appaloft/agent-adapter-sdk";
import { type CommunityRemoteWorkspaceDefaultProfileConfig } from "@appaloft/application";

export function createCommunityRemoteDefaultProfile(input: {
  readonly harnessKey: string;
  readonly templateId: string;
  readonly sandboxTemplateId: string;
  readonly version: string;
  readonly templateDigest: string;
}): CommunityRemoteWorkspaceDefaultProfileConfig | undefined {
  const native = input.harnessKey === "opencode";
  const adapterManifest = {
    schemaVersion: "appaloft.agent-adapter/v1",
    id: "appaloft-remote",
    displayName: "Appaloft Remote",
    version: "1.0.0",
    kind: "declarative",
    requirements: {
      adapterApi: ">=1.0.0 <2.0.0",
      sandboxTemplate: {
        id: input.sandboxTemplateId,
        version: `>=${input.version} <2.0.0`,
        digest: input.templateDigest,
      },
      runtimes: [{ id: input.harnessKey, version: `>=${input.version} <2.0.0` }],
      capabilities: {
        required: [native ? "native-attach" : "managed-terminal"],
        optional: ["headless"],
      },
    },
    interactionModes: [
      native
        ? {
            id: "native",
            transport: "native-attach",
            command: [input.harnessKey, "attach", "http://127.0.0.1:4096"],
            eventFidelity: "raw-pty",
            sessionRecovery: "native-session-store",
            clientHandoff: "local-client-exec",
            serverPort: 4096,
          }
        : {
            id: "terminal",
            transport: "terminal",
            command: [input.harnessKey],
            eventFidelity: "raw-pty",
            sessionRecovery: "process-lifetime",
          },
      {
        id: "headless",
        transport: "headless",
        command: native ? [input.harnessKey, "run"] : [input.harnessKey],
        taskInput: "append-argument",
        eventFidelity: "line-events",
        sessionRecovery: "managed-run-lineage",
      },
    ],
    ...(native
      ? {
          start: [input.harnessKey, "serve", "--port", "4096"],
          healthcheck: { kind: "http", port: 4096, path: "/ready" },
        }
      : { healthcheck: { kind: "process" } }),
    persistentPaths: ["/workspace/.appaloft-agent"],
    credentials: [
      {
        id: "model-api",
        kind: "model-api",
        required: false,
        purpose: "Brokered or personal model access",
        delivery: { kind: "stdin" },
      },
    ],
  };
  const validatedAdapter = validateAgentAdapterManifest(adapterManifest);
  if (!validatedAdapter.ok) return undefined;
  const profileManifest = {
    schemaVersion: "appaloft.agent-workspace-profile/v1",
    id: "appaloft-remote",
    displayName: "Appaloft Remote",
    version: "1.0.0",
    adapter: {
      id: adapterManifest.id,
      version: adapterManifest.version,
      digest: validatedAdapter.definition.digest,
      interactiveModeId: native ? "native" : "terminal",
      taskModeId: "headless",
    },
    harnessTemplateId: input.templateId,
    sandbox: {
      template: {
        id: input.sandboxTemplateId,
        version: input.version,
        digest: input.templateDigest,
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
        rules: [
          { kind: "domain", value: "github.com", ports: [443] },
          { kind: "domain", value: "api.github.com", ports: [443] },
          { kind: "domain", value: "api.openai.com", ports: [443] },
          { kind: "domain", value: "api.anthropic.com", ports: [443] },
          { kind: "domain", value: "openrouter.ai", ports: [443] },
          { kind: "domain", value: "api.deepseek.com", ports: [443] },
          { kind: "domain", value: "api.x.ai", ports: [443] },
          { kind: "domain", value: "opencode.ai", ports: [443] },
        ],
      },
    },
    workingDirectory: "/workspace",
    initialization: [],
    defaultPorts: [],
    persistentPaths: ["/workspace/.appaloft-agent"],
    suggestedChecks: [],
  };
  const validatedProfile = validateAgentWorkspaceProfile(profileManifest);
  if (!validatedProfile.ok) return undefined;
  return { adapterManifest, profileManifest };
}
