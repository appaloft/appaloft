import {
  occupancyRemoteProfileId,
  OpenAgentWorkspaceCommand,
  type SandboxAgentAttachDescriptor,
} from "@appaloft/application";
import { type DomainError } from "@appaloft/core";

import {
  occupancyAliasFromHomeLabel,
  occupancyHarnessForAlias,
  type OccupancyHarness,
} from "./occupancy-vendor.js";
import {
  occupancyCloudCompatError,
  occupyLiveSessionMissingError,
  pinRemoteCodeDoorServer,
  resolveDefaultRemoteCodeDoor,
} from "./remote-code-session.js";

export async function occupyFromWorkspaceHome(input: {
  readonly path?: string;
  readonly vendor?: string;
  readonly projectId?: string;
  readonly forceNew?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly executeCommand: <T>(
    command: OpenAgentWorkspaceCommand,
  ) => Promise<{ isErr(): boolean; error?: DomainError; value?: T }>;
  readonly resolveDoor: typeof resolveDefaultRemoteCodeDoor;
  readonly reportProgress: (
    message: string,
    options?: { readonly status?: "retrying" | "failed" },
  ) => void;
  readonly signal?: AbortSignal;
}): Promise<{
  readonly workspaceId: string;
  readonly attach?: SandboxAgentAttachDescriptor;
  readonly projectName?: string;
}> {
  const path = input.path ?? ".";
  const alias = input.vendor ? occupancyAliasFromHomeLabel(input.vendor) : undefined;
  const harness: OccupancyHarness = occupancyHarnessForAlias(alias);
  const door = pinRemoteCodeDoorServer(
    await input.resolveDoor(
      {
        ...(input.env ? { env: input.env } : {}),
        forceNew: input.forceNew === true,
        onProgress: input.reportProgress,
        folderCwd: path,
      },
      path,
    ),
    undefined,
  );
  const selectedProfile = harness === "opencode" ? undefined : occupancyRemoteProfileId(harness);
  const command = OpenAgentWorkspaceCommand.create({
    repository: door.repository,
    repositoryIdentity: door.repositoryIdentity,
    ref: door.ref,
    branch: door.branch,
    commitSha: door.commitSha,
    targetServerId: door.serverId,
    attach: true,
    forceNew: input.forceNew === true,
    ...(selectedProfile ? { profile: selectedProfile } : {}),
    ...(input.projectId
      ? { projectId: input.projectId }
      : door.projectId && door.projectId !== "project"
        ? { projectId: door.projectId }
        : {}),
  });
  if (command.isErr()) throw command.error;
  const opened = await input.executeCommand(command.value);
  if (opened.isErr()) {
    throw occupancyCloudCompatError(
      opened.error as DomainError,
      { id: door.serverId, name: door.serverName },
      {
        repositoryIdentity: door.repositoryIdentity,
        repository: door.repository,
      },
    );
  }
  const result = opened.value as {
    readonly workspaceId: string;
    readonly attach?: SandboxAgentAttachDescriptor;
  };
  if (!result.attach) throw occupyLiveSessionMissingError();
  return {
    workspaceId: result.workspaceId,
    attach: result.attach,
    ...(door.projectName ? { projectName: door.projectName } : {}),
  };
}
