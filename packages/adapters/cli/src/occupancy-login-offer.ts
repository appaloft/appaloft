import { WriteSandboxFileCommand } from "@appaloft/application";
import { type Result } from "@appaloft/core";

import { type CliControlPlaneAuth } from "./control-plane-profile.js";
import {
  type CliControlPlaneDependencies,
  activeControlPlaneProfile,
} from "./control-plane-service.js";

export const OCCUPANCY_APPALOFT_PROFILE_PATH = ".appaloft/profiles.json";

export interface OccupancyAppaloftLogin {
  readonly name: string;
  readonly mode: "cloud" | "self-hosted";
  readonly baseUrl: string;
  readonly auth: CliControlPlaneAuth;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentOrganization?: {
    readonly organizationId: string;
    readonly name?: string;
    readonly slug?: string;
    readonly role?: string;
  };
}

export function occupancyAppaloftProfilesJson(login: OccupancyAppaloftLogin): string {
  return `${JSON.stringify(
    {
      activeProfile: login.name,
      profiles: {
        [login.name]: {
          name: login.name,
          mode: login.mode,
          baseUrl: login.baseUrl,
          auth: login.auth,
          createdAt: login.createdAt,
          updatedAt: login.updatedAt,
          ...(login.currentOrganization ? { currentOrganization: login.currentOrganization } : {}),
        },
      },
    },
    null,
    2,
  )}\n`;
}

export async function loadOccupancyAppaloftLogin(
  deps?: CliControlPlaneDependencies,
): Promise<OccupancyAppaloftLogin | undefined> {
  const profile = await activeControlPlaneProfile(deps);
  if (profile.isErr() || !profile.value) {
    return undefined;
  }
  return {
    name: profile.value.name,
    mode: profile.value.mode,
    baseUrl: profile.value.baseUrl,
    auth: profile.value.auth,
    createdAt: profile.value.createdAt,
    updatedAt: profile.value.updatedAt,
    ...(profile.value.currentOrganization
      ? { currentOrganization: profile.value.currentOrganization }
      : {}),
  };
}

export async function offerOccupancyAppaloftLogin(input: {
  readonly workspaceId: string;
  readonly login?: OccupancyAppaloftLogin;
  readonly deps?: CliControlPlaneDependencies;
  readonly executeCommand: (command: WriteSandboxFileCommand) => Promise<Result<unknown>>;
  readonly destinationExists?: (path: string) => Promise<boolean>;
}): Promise<{
  readonly offered: boolean;
  readonly occupancyPath: string;
  readonly login?: OccupancyAppaloftLogin;
}> {
  const login = input.login ?? (await loadOccupancyAppaloftLogin(input.deps));
  if (!login) {
    return { offered: false, occupancyPath: OCCUPANCY_APPALOFT_PROFILE_PATH };
  }
  if (input.destinationExists && (await input.destinationExists(OCCUPANCY_APPALOFT_PROFILE_PATH))) {
    return {
      offered: true,
      occupancyPath: OCCUPANCY_APPALOFT_PROFILE_PATH,
      login,
    };
  }
  const command = WriteSandboxFileCommand.create({
    sandboxId: input.workspaceId,
    path: OCCUPANCY_APPALOFT_PROFILE_PATH,
    contentBase64: Buffer.from(occupancyAppaloftProfilesJson(login)).toString("base64"),
  });
  if (command.isErr()) {
    return { offered: false, occupancyPath: OCCUPANCY_APPALOFT_PROFILE_PATH, login };
  }
  const written = await input.executeCommand(command.value);
  return {
    offered: written.isOk(),
    occupancyPath: OCCUPANCY_APPALOFT_PROFILE_PATH,
    login,
  };
}
