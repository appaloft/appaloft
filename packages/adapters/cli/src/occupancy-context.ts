import { ListResourcesQuery, ListSandboxesQuery } from "@appaloft/application";
import { Effect } from "effect";

import { type OccupancyResource, occupancyAppResourceId } from "./occupancy-chrome.js";
import { selectResumeOccupancy } from "./remote-code-session.js";
import { CliRuntime } from "./runtime.js";

export interface OccupancySandboxRow {
  readonly sandboxId: string;
  readonly status: string;
  readonly lastActivityAt?: string;
  readonly updatedAt?: string;
  readonly occupancy?: {
    readonly repositoryIdentity: string;
    readonly commitSha: string;
    readonly branch?: string;
  };
  readonly activation?: { readonly project?: { readonly projectId?: string } };
}

export function occupancyProjectIdFromSandboxes(
  sandboxes: readonly OccupancySandboxRow[],
): string | undefined {
  const occupancy = selectResumeOccupancy(
    sandboxes.map((item) => ({
      sandboxId: item.sandboxId,
      status: item.status,
      ...(item.occupancy ? { occupancy: item.occupancy } : {}),
      ...(typeof item.lastActivityAt === "string" ? { lastActivityAt: item.lastActivityAt } : {}),
      ...(typeof item.updatedAt === "string" ? { updatedAt: item.updatedAt } : {}),
    })),
  );
  return sandboxes.find((item) => item.sandboxId === occupancy?.sandboxId)?.activation?.project
    ?.projectId;
}

export function resolveLatestOccupancyProjectId() {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const sandboxesQuery = ListSandboxesQuery.create({ limit: 100, offset: 0 });
    if (sandboxesQuery.isErr()) return undefined;
    const sandboxesResult = yield* Effect.promise(() => cli.executeQuery(sandboxesQuery.value));
    if (sandboxesResult.isErr()) return undefined;
    return occupancyProjectIdFromSandboxes(
      ((sandboxesResult.value as { readonly items?: readonly OccupancySandboxRow[] }).items ??
        []) as OccupancySandboxRow[],
    );
  });
}

export function resolveLatestOccupancyAppResourceId() {
  return Effect.gen(function* () {
    const projectId = yield* resolveLatestOccupancyProjectId();
    if (!projectId) return undefined;
    const cli = yield* CliRuntime;
    const resourcesQuery = ListResourcesQuery.create({ projectId, limit: 100 });
    if (resourcesQuery.isErr()) return undefined;
    const resourcesResult = yield* Effect.promise(() => cli.executeQuery(resourcesQuery.value));
    if (resourcesResult.isErr()) return undefined;
    return occupancyAppResourceId(
      (resourcesResult.value as { readonly items?: readonly OccupancyResource[] }).items ?? [],
      projectId,
    );
  });
}
