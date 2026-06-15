import {
  type ResourceDeleteBlocker,
  type ResourceDeleteBlockerKind,
  type ResourceDeletionBlocker,
} from "../../ports";

export function activeResourceDeleteBlocker(resourceId: string): ResourceDeleteBlocker {
  return {
    kind: "active-resource",
    relatedEntityId: resourceId,
    relatedEntityType: "resource",
    count: 1,
  };
}

export function buildResourceDeleteBlockers(input: {
  resourceId: string;
  lifecycleStatus: "active" | "archived";
  retainedBlockers: ResourceDeletionBlocker[];
}): ResourceDeleteBlocker[] {
  return [
    ...(input.lifecycleStatus === "active" ? [activeResourceDeleteBlocker(input.resourceId)] : []),
    ...input.retainedBlockers,
  ];
}

export function uniqueResourceDeleteBlockerKinds(
  blockers: ResourceDeleteBlocker[],
): ResourceDeleteBlockerKind[] {
  return [...new Set(blockers.map((blocker) => blocker.kind))];
}
