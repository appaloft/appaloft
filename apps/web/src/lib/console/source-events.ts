import { type SourceEventListItem } from "@appaloft/contracts";

export type SourceEventVisibleOutcome =
  | {
      kind: "created-deployment";
      value: string;
    }
  | {
      kind: "dedupe";
      value: SourceEventListItem["dedupeStatus"];
    }
  | {
      kind: "ignored-reason";
      value: SourceEventListItem["ignoredReasons"][number];
    };

export function sourceEventDeploymentHref(deploymentId: string): string {
  return `/deployments/${deploymentId}`;
}

export function sourceEventRevisionLabel(revision: string): string {
  return revision.length > 12 ? revision.slice(0, 12) : revision;
}

export function sourceEventVisibleOutcomes(
  event: Pick<SourceEventListItem, "createdDeploymentIds" | "dedupeStatus" | "ignoredReasons">,
): SourceEventVisibleOutcome[] {
  return [
    ...event.createdDeploymentIds.map((deploymentId) => ({
      kind: "created-deployment" as const,
      value: deploymentId,
    })),
    ...(event.dedupeStatus === "duplicate"
      ? [
          {
            kind: "dedupe" as const,
            value: event.dedupeStatus,
          },
        ]
      : []),
    ...event.ignoredReasons.map((reason) => ({
      kind: "ignored-reason" as const,
      value: reason,
    })),
  ];
}
