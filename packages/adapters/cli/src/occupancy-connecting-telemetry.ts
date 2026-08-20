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
  };
  readonly steps: readonly OccupancyConnectingStep[];
}

export function occupancyConnectingSteps(input: {
  readonly vendor?: OccupancyVendor;
  readonly credentialOffered?: boolean;
  readonly skillCount: number;
}): OccupancyConnectingStep[] {
  const steps: OccupancyConnectingStep[] = [];
  if (input.vendor && input.credentialOffered) {
    steps.push({
      id: "credential",
      message: `using your ${OCCUPANCY_VENDOR_LABEL[input.vendor]} credential`,
    });
  }
  steps.push({
    id: "skills",
    message: `including ${input.skillCount} skills`,
  });
  steps.push({
    id: "disk",
    message: "work is on its disk",
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
  readonly skillCount: number;
  readonly firstPartyMcp: boolean;
}): OccupancyConnectingTelemetry {
  return {
    schemaVersion: OCCUPANCY_CONNECTING_TELEMETRY_SCHEMA,
    ...(input.vendor ? { vendor: input.vendor } : {}),
    harness: input.harness,
    ...(input.credential ? { credential: input.credential } : {}),
    skillCount: input.skillCount,
    workOnDisk: true,
    mcp: {
      firstParty: input.firstPartyMcp,
      remoteStdio: true,
    },
    steps: occupancyConnectingSteps({
      skillCount: input.skillCount,
      ...(input.vendor ? { vendor: input.vendor } : {}),
      ...(input.credential ? { credentialOffered: input.credential.offered } : {}),
    }),
  };
}
