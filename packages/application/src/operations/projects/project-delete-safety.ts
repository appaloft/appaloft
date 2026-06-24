import {
  type ProjectDeleteBlocker,
  type ProjectDeleteBlockerKind,
  type ProjectDeletionBlocker,
} from "../../ports";

export function activeProjectDeleteBlocker(projectId: string): ProjectDeleteBlocker {
  return {
    kind: "active-project",
    relatedEntityId: projectId,
    relatedEntityType: "project",
    count: 1,
  };
}

export function buildProjectDeleteBlockers(input: {
  projectId: string;
  lifecycleStatus: "active" | "archived";
  retainedBlockers: ProjectDeletionBlocker[];
}): ProjectDeleteBlocker[] {
  return [
    ...(input.lifecycleStatus === "active" ? [activeProjectDeleteBlocker(input.projectId)] : []),
    ...input.retainedBlockers.filter((blocker) => blocker.kind !== "audit-retention"),
  ];
}

export function uniqueProjectDeleteBlockerKinds(
  blockers: ProjectDeleteBlocker[],
): ProjectDeleteBlockerKind[] {
  return [...new Set(blockers.map((blocker) => blocker.kind))];
}
