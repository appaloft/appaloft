import {
  validateAgentAdapterManifest,
  validateAgentWorkspaceProfile,
} from "@appaloft/agent-adapter-sdk";
import {
  type CommunityRemoteWorkspaceDefaultProfileConfig,
  OCCUPANCY_FIRST_PARTY_MCP_DISCOVERY_TOOLS,
  occupancyRemoteProfileId,
  type SandboxAgentHarnessCapabilities,
  type SandboxAgentHarnessInteraction,
} from "@appaloft/application";
import { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "@appaloft/application/community-remote-default-network-policy";

export { COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY } from "@appaloft/application/community-remote-default-network-policy";

const occupancyDisplayNames: Readonly<Record<string, string>> = {
  opencode: "Appaloft Remote",
};

type OccupancyTransport = NonNullable<SandboxAgentHarnessInteraction["transport"]>;

interface OccupancyTransportAdapter {
  readonly requiredCapability: "native-attach" | "managed-terminal";
  readonly interactiveModeId: "native" | "terminal";
  interactiveMode(input: {
    readonly command: readonly string[];
    readonly serverPort: number;
  }): Record<string, unknown>;
  headlessCommand(harnessKey: string, attachCommand: readonly string[]): readonly string[];
  runtime(input: {
    readonly harnessKey: string;
    readonly serverPort: number;
    readonly healthcheck?: SandboxAgentHarnessCapabilities["healthcheck"];
  }): Record<string, unknown>;
}

const occupancyTransportAdapters: Readonly<Record<OccupancyTransport, OccupancyTransportAdapter>> =
  {
    "native-attach": {
      requiredCapability: "native-attach",
      interactiveModeId: "native",
      interactiveMode({ command, serverPort }) {
        return {
          id: "native",
          transport: "native-attach",
          command: [...command],
          eventFidelity: "raw-pty",
          sessionRecovery: "native-session-store",
          clientHandoff: "local-client-exec",
          serverPort,
        };
      },
      headlessCommand(harnessKey) {
        return [harnessKey, "run"];
      },
      runtime({ harnessKey, serverPort, healthcheck }) {
        return {
          start: [harnessKey, "serve", "--port", String(serverPort)],
          healthcheck: healthcheck ?? { kind: "http", port: serverPort, path: "/ready" },
        };
      },
    },
    "managed-terminal": {
      requiredCapability: "managed-terminal",
      interactiveModeId: "terminal",
      interactiveMode({ command }) {
        return {
          id: "terminal",
          transport: "terminal",
          command: [...command],
          eventFidelity: "raw-pty",
          sessionRecovery: "process-lifetime",
        };
      },
      headlessCommand(_harnessKey, attachCommand) {
        return [...attachCommand];
      },
      runtime({ healthcheck }) {
        return { healthcheck: healthcheck ?? { kind: "process" } };
      },
    },
  };

function occupancyTransportOf(interaction?: SandboxAgentHarnessInteraction): OccupancyTransport {
  return interaction?.transport ?? "managed-terminal";
}

export function createCommunityRemoteDefaultProfile(input: {
  readonly harnessKey: string;
  readonly templateId: string;
  readonly sandboxTemplateId: string;
  readonly version: string;
  readonly templateDigest: string;
  readonly interaction?: SandboxAgentHarnessInteraction;
  readonly capabilities?: SandboxAgentHarnessCapabilities;
}): CommunityRemoteWorkspaceDefaultProfileConfig | undefined {
  const transport = occupancyTransportOf(input.interaction);
  const adapter = occupancyTransportAdapters[transport];
  const remoteId = occupancyRemoteProfileId(input.harnessKey);
  const displayName =
    occupancyDisplayNames[input.harnessKey] ?? `Appaloft Remote ${input.harnessKey}`;
  const attachCommand = input.interaction?.command ?? [input.harnessKey];
  const serverPort = input.interaction?.serverPort ?? 4096;
  const adapterManifest = {
    schemaVersion: "appaloft.agent-adapter/v1",
    id: remoteId,
    displayName,
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
        required: [adapter.requiredCapability],
        optional: ["headless"],
      },
    },
    interactionModes: [
      adapter.interactiveMode({ command: attachCommand, serverPort }),
      {
        id: "headless",
        transport: "headless",
        command: [...adapter.headlessCommand(input.harnessKey, attachCommand)],
        taskInput: "append-argument",
        eventFidelity: "line-events",
        sessionRecovery: "managed-run-lineage",
      },
    ],
    ...adapter.runtime({
      harnessKey: input.harnessKey,
      serverPort,
      healthcheck: input.capabilities?.healthcheck,
    }),
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
    mcpServers: [
      {
        id: "appaloft-tools",
        required: false,
        purpose: "Deploy and inspect Appaloft from occupancy",
        requestedTools: [...OCCUPANCY_FIRST_PARTY_MCP_DISCOVERY_TOOLS],
      },
    ],
  };
  const validatedAdapter = validateAgentAdapterManifest(adapterManifest);
  if (!validatedAdapter.ok) return undefined;
  const profileManifest = {
    schemaVersion: "appaloft.agent-workspace-profile/v1",
    id: remoteId,
    displayName,
    version: "1.0.0",
    adapter: {
      id: adapterManifest.id,
      version: adapterManifest.version,
      digest: validatedAdapter.definition.digest,
      interactiveModeId: adapter.interactiveModeId,
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
      networkPolicy: COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY,
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
