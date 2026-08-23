import {
  ListSandboxesQuery,
  ListServersQuery,
  occupancyRemoteProfileId,
  OpenAgentWorkspaceCommand,
  type SandboxAgentAttachDescriptor,
  ShowRepositoryBindingQuery,
} from "@appaloft/application";
import { type DomainError, type Result } from "@appaloft/core";

import {
  occupancyAliasFromHomeLabel,
  occupancyHarnessForAlias,
  type OccupancyHarness,
  saveOccupancyAgentPreference,
} from "./occupancy-vendor.js";
import {
  occupancyCloudCompatError,
  occupyLiveSessionMissingError,
  pinRemoteCodeDoorServer,
  type RemoteCodeDoorProbe,
  type RemoteCodeOccupancy,
  type RemoteCodeServerSummary,
  resolveDefaultRemoteCodeDoor,
} from "./remote-code-session.js";

export const OCCUPANCY_HOME_VENDORS = ["grok", "codex", "claude", "opencode", "pi"] as const;

export function occupancyHomeVendorLabel(alias?: string): string {
  const normalized = alias?.trim().toLowerCase();
  if (
    normalized &&
    OCCUPANCY_HOME_VENDORS.includes(normalized as (typeof OCCUPANCY_HOME_VENDORS)[number])
  ) {
    return normalized;
  }
  return "opencode";
}

export function occupancyHomeDoorProbe(input: {
  readonly executeQuery: <T>(query: unknown) => Promise<Result<T>>;
  readonly ensureFolderOnboarding?: RemoteCodeDoorProbe["ensureFolderOnboarding"];
  readonly resolveRemoteRef?: RemoteCodeDoorProbe["resolveRemoteRef"];
}): Pick<
  RemoteCodeDoorProbe,
  "listServers" | "listOccupancies" | "showBinding" | "ensureFolderOnboarding" | "resolveRemoteRef"
> {
  return {
    listServers: async () => {
      const query = ListServersQuery.create();
      if (query.isErr()) throw query.error;
      const listed = await input.executeQuery<{ items: readonly RemoteCodeServerSummary[] }>(
        query.value,
      );
      if (listed.isErr()) throw listed.error;
      return listed.value.items;
    },
    listOccupancies: async () => {
      const query = ListSandboxesQuery.create({ limit: 100, offset: 0 });
      if (query.isErr()) throw query.error;
      const listed = await input.executeQuery<{ items: readonly Record<string, unknown>[] }>(
        query.value,
      );
      if (listed.isErr()) throw listed.error;
      return listed.value.items.map((item) => ({
        sandboxId: String(item.sandboxId ?? ""),
        status: String(item.status ?? "unknown"),
        ...(typeof item.lastActivityAt === "string" ? { lastActivityAt: item.lastActivityAt } : {}),
        ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}),
        ...(item.occupancy &&
        typeof item.occupancy === "object" &&
        typeof (item.occupancy as { repositoryIdentity?: unknown }).repositoryIdentity ===
          "string" &&
        typeof (item.occupancy as { commitSha?: unknown }).commitSha === "string"
          ? {
              occupancy: {
                repositoryIdentity: (item.occupancy as { repositoryIdentity: string })
                  .repositoryIdentity,
                commitSha: (item.occupancy as { commitSha: string }).commitSha,
                ...((item.occupancy as { branch?: string }).branch
                  ? { branch: (item.occupancy as { branch: string }).branch }
                  : {}),
              },
            }
          : {}),
      })) satisfies RemoteCodeOccupancy[];
    },
    showBinding: async (repositoryIdentity) => {
      const query = ShowRepositoryBindingQuery.create({ repositoryIdentity });
      if (query.isErr()) throw query.error;
      const shown = await input.executeQuery(query.value);
      if (shown.isErr()) return null;
      return shown.value as never;
    },
    ...(input.ensureFolderOnboarding
      ? { ensureFolderOnboarding: input.ensureFolderOnboarding }
      : {}),
    ...(input.resolveRemoteRef ? { resolveRemoteRef: input.resolveRemoteRef } : {}),
  };
}

export async function occupyFromWorkspaceHome(input: {
  readonly path?: string;
  readonly vendor?: string;
  readonly projectId?: string;
  readonly forceNew?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  readonly executeCommand: <T>(
    command: OpenAgentWorkspaceCommand,
  ) => Promise<{ isErr(): boolean; error?: DomainError; value?: T }>;
  readonly resolveDoor?: typeof resolveDefaultRemoteCodeDoor;
  readonly doorProbe?: Omit<RemoteCodeDoorProbe, "env" | "forceNew" | "onProgress" | "folderCwd">;
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
  if (alias) {
    try {
      await saveOccupancyAgentPreference({
        alias,
        ...(input.homeDir ? { homeDir: input.homeDir } : {}),
        ...(input.env ? { env: input.env } : {}),
      });
    } catch {
      // Preference write is fail-soft; occupy still proceeds.
    }
  }
  const resolveDoor = input.resolveDoor ?? resolveDefaultRemoteCodeDoor;
  const door = pinRemoteCodeDoorServer(
    await resolveDoor(
      {
        ...(input.env ? { env: input.env } : {}),
        forceNew: input.forceNew === true,
        onProgress: input.reportProgress,
        folderCwd: path,
        ...(input.doorProbe ?? {}),
      },
      path,
    ),
    input.doorProbe?.explicitServerId,
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
      alias ? { alias, harness } : { harness },
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
