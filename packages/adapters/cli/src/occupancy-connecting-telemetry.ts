import { occupancyAgentWokeLine } from "./occupancy-agent-name.js";
import {
  OCCUPANCY_VENDOR_LABEL,
  type OccupancyHarness,
  type OccupancyVendor,
} from "./occupancy-vendor.js";

export const OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA = "appaloft.occupancy-connecting/v1" as const;

export type OccupancyConnectingStepId = "credential" | "skills" | "disk";

export interface OccupancyConnectingStep {
  readonly id: OccupancyConnectingStepId;
  readonly message: string;
}

export interface OccupancyConnectingTelemetry {
  readonly schemaVersion: typeof OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA;
  readonly vendor?: OccupancyVendor;
  readonly harness: OccupancyHarness;
  readonly agentName?: string;
  readonly credential?: {
    readonly vendor: OccupancyVendor;
    readonly kind: "auth.json" | "setup-token";
    readonly occupancyPath: string;
    readonly offered: boolean;
  };
  readonly skillCount: number;
  readonly workOnDisk: true;
  readonly mcp: {
    readonly firstParty: boolean;
    readonly remoteStdio: true;
    readonly controlPlaneLogin?: true;
    readonly appaloftCli?: true;
  };
  readonly steps: readonly OccupancyConnectingStep[];
}

function withPath(message: string, path?: string): string {
  return path ? `${message} (${path})` : message;
}

export function occupancyConnectingSteps(input: {
  readonly vendor?: OccupancyVendor;
  readonly credentialOffered?: boolean;
  readonly opencodeConnectOffered?: boolean;
  readonly controlPlaneLogin?: boolean;
  readonly appaloftCli?: boolean;
  readonly skillCount: number;
  readonly credentialPath?: string;
  readonly skillsPath?: string;
  readonly agentName?: string;
}): OccupancyConnectingStep[] {
  const steps: OccupancyConnectingStep[] = [];
  if (input.vendor && input.credentialOffered) {
    steps.push({
      id: "credential",
      message:
        withPath(
          `Using your ${OCCUPANCY_VENDOR_LABEL[input.vendor]} credential`,
          input.credentialPath,
        ) + " on the agent",
    });
  } else if (input.opencodeConnectOffered) {
    steps.push({
      id: "credential",
      message: withPath("Using your OpenCode login", input.credentialPath) + " on the agent",
    });
  }
  if (input.controlPlaneLogin) {
    steps.push({
      id: "credential",
      message: "Using your Appaloft login on the agent",
    });
  }
  steps.push({
    id: "skills",
    message: withPath(`Including ${input.skillCount} of your skills`, input.skillsPath),
  });

  steps.push({
    id: "disk",
    message: input.agentName ? occupancyAgentWokeLine(input.agentName) : "your work is on its disk",
  });
  return steps;
}

export function occupancyConnectingStepLines(
  telemetry: OccupancyConnectingTelemetry,
): readonly string[] {
  return telemetry.steps.map((step) => step.message);
}

export function occupancyConnectingTelemetry(input: {
  readonly vendor?: OccupancyVendor;
  readonly harness: OccupancyHarness;
  readonly credential?: OccupancyConnectingTelemetry["credential"];
  readonly opencodeConnectOffered?: boolean;
  readonly controlPlaneLogin?: boolean;
  readonly appaloftCli?: boolean;
  readonly skillCount: number;
  readonly firstPartyMcp: boolean;
  readonly credentialPath?: string;
  readonly skillsPath?: string;
  readonly agentName?: string;
}): OccupancyConnectingTelemetry {
  return {
    schemaVersion: OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA,
    ...(input.vendor ? { vendor: input.vendor } : {}),
    harness: input.harness,
    ...(input.agentName ? { agentName: input.agentName } : {}),
    ...(input.credential ? { credential: input.credential } : {}),
    skillCount: input.skillCount,
    workOnDisk: true,
    mcp: {
      firstParty: input.firstPartyMcp,
      remoteStdio: true,
      ...(input.controlPlaneLogin ? { controlPlaneLogin: true } : {}),
      ...(input.appaloftCli ? { appaloftCli: true } : {}),
    },
    steps: occupancyConnectingSteps({
      skillCount: input.skillCount,
      ...(input.vendor ? { vendor: input.vendor } : {}),
      ...(input.credential ? { credentialOffered: input.credential.offered } : {}),
      ...(input.opencodeConnectOffered ? { opencodeConnectOffered: true } : {}),
      ...(input.controlPlaneLogin ? { controlPlaneLogin: true } : {}),
      ...(input.appaloftCli ? { appaloftCli: true } : {}),
      ...(input.credentialPath ? { credentialPath: input.credentialPath } : {}),
      ...(input.skillsPath ? { skillsPath: input.skillsPath } : {}),
      ...(input.agentName ? { agentName: input.agentName } : {}),
    }),
  };
}
