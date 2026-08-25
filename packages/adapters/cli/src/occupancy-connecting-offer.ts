import { homedir } from "node:os";

import {
  type ExecuteSandboxCommand,
  type ReadSandboxFileQuery,
  type WriteSandboxFileCommand,
} from "@appaloft/application";
import { type Result } from "@appaloft/core";

import { resolveAppaloftSkillPath } from "./local-scratch-session.js";
import {
  type OccupancyConnectingTelemetry,
  occupancyConnectingTelemetry,
} from "./occupancy-connecting-telemetry.js";
import {
  offerOccupancyOpenCodeConnectAuth,
  offerOccupancyVendorCredential,
} from "./occupancy-credential-offer.js";
import { offerOccupancyFirstPartyMcp } from "./occupancy-mcp-offer.js";
import {
  listOccupancyHomeSkillOfferFiles,
  occupancyHomeSkillDestinationExists,
} from "./occupancy-skill-offer.js";
import { type OccupancyHarness, type OccupancyVendor } from "./occupancy-vendor.js";

export async function countOccupancyConnectingSkills(input: {
  readonly homeDir?: string;
  readonly appaloftSkillDir?: string;
}): Promise<number> {
  const homeFiles = await listOccupancyHomeSkillOfferFiles(input.homeDir ?? homedir());
  const homeNames = new Set(homeFiles.map((file) => file.skillName));
  const appaloftDir = input.appaloftSkillDir ?? resolveAppaloftSkillPath();
  return homeNames.size + (appaloftDir ? 1 : 0);
}

export async function offerOccupancyConnectingMaterials(input: {
  readonly workspaceId: string;
  readonly harness: OccupancyHarness;
  readonly vendor?: OccupancyVendor;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly appaloftSkillDir?: string;
  readonly executeCommand: (
    command: WriteSandboxFileCommand | ExecuteSandboxCommand,
  ) => Promise<Result<unknown>>;
  readonly executeQuery: (query: ReadSandboxFileQuery) => Promise<Result<unknown>>;
  readonly skillCount?: number;
}): Promise<OccupancyConnectingTelemetry> {
  const destinationExists = occupancyHomeSkillDestinationExists({
    workspaceId: input.workspaceId,
    executeQuery: input.executeQuery,
  });
  const writeOnly = (command: WriteSandboxFileCommand | ExecuteSandboxCommand) =>
    input.executeCommand(command);
  let credential: OccupancyConnectingTelemetry["credential"];
  let opencodeConnectOffered = false;
  if (input.vendor) {
    const offered = await offerOccupancyVendorCredential({
      workspaceId: input.workspaceId,
      vendor: input.vendor,
      executeCommand: writeOnly,
      destinationExists,
      ...(input.homeDir ? { homeDir: input.homeDir } : {}),
      ...(input.env ? { env: input.env } : {}),
    });
    if (offered.offered && offered.occupancyPath && offered.kind) {
      credential = {
        vendor: input.vendor,
        kind: offered.kind,
        occupancyPath: offered.occupancyPath,
        offered: true,
      };
    }
  } else if (input.harness === "opencode") {
    const offered = await offerOccupancyOpenCodeConnectAuth({
      workspaceId: input.workspaceId,
      executeCommand: writeOnly,
      destinationExists,
      ...(input.homeDir ? { homeDir: input.homeDir } : {}),
      ...(input.env ? { env: input.env } : {}),
    });
    opencodeConnectOffered = offered.offered;
  }

  const mcp = await offerOccupancyFirstPartyMcp({
    workspaceId: input.workspaceId,
    executeCommand: writeOnly,
    destinationExists,
  });
  return occupancyConnectingTelemetry({
    harness: input.harness,
    skillCount:
      input.skillCount ??
      (await countOccupancyConnectingSkills({
        ...(input.homeDir ? { homeDir: input.homeDir } : {}),
        ...(input.appaloftSkillDir ? { appaloftSkillDir: input.appaloftSkillDir } : {}),
      })),
    firstPartyMcp: mcp.offered,
    ...(input.vendor ? { vendor: input.vendor } : {}),
    ...(credential ? { credential } : {}),
    ...(opencodeConnectOffered ? { opencodeConnectOffered: true } : {}),
  });
}
