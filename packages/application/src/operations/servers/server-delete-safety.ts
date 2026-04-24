import {
  type ServerDeleteBlocker,
  type ServerDeleteBlockerKind,
  type ServerDeletionBlocker,
} from "../../ports";

export function activeServerDeleteBlocker(serverId: string): ServerDeleteBlocker {
  return {
    kind: "active-server",
    relatedEntityId: serverId,
    relatedEntityType: "server",
    count: 1,
  };
}

export function buildServerDeleteBlockers(input: {
  serverId: string;
  lifecycleStatus: "active" | "inactive";
  retainedBlockers: ServerDeletionBlocker[];
}): ServerDeleteBlocker[] {
  return [
    ...(input.lifecycleStatus === "active" ? [activeServerDeleteBlocker(input.serverId)] : []),
    ...input.retainedBlockers,
  ];
}

export function uniqueServerDeleteBlockerKinds(
  blockers: ServerDeleteBlocker[],
): ServerDeleteBlockerKind[] {
  return [...new Set(blockers.map((blocker) => blocker.kind))];
}
