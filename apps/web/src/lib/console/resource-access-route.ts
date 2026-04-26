import { type ResourceSummary } from "@appaloft/contracts";

export type ResourceAccessSummary = NonNullable<ResourceSummary["accessSummary"]>;
export type CurrentResourceAccessRouteKind =
  | "durable-domain"
  | "server-applied-domain"
  | "generated-latest"
  | "generated-planned";
export type CurrentResourceAccessRoute =
  | {
      kind: "durable-domain";
      route: NonNullable<ResourceAccessSummary["latestDurableDomainRoute"]>;
    }
  | {
      kind: "server-applied-domain";
      route: NonNullable<ResourceAccessSummary["latestServerAppliedDomainRoute"]>;
    }
  | {
      kind: "generated-latest";
      route: NonNullable<ResourceAccessSummary["latestGeneratedAccessRoute"]>;
    }
  | {
      kind: "generated-planned";
      route: NonNullable<ResourceAccessSummary["plannedGeneratedAccessRoute"]>;
    };

export function selectCurrentResourceAccessRoute(
  accessSummary: ResourceAccessSummary | null | undefined,
): CurrentResourceAccessRoute | null {
  if (!accessSummary) {
    return null;
  }

  if (accessSummary.latestDurableDomainRoute) {
    return {
      kind: "durable-domain",
      route: accessSummary.latestDurableDomainRoute,
    };
  }

  if (accessSummary.latestServerAppliedDomainRoute) {
    return {
      kind: "server-applied-domain",
      route: accessSummary.latestServerAppliedDomainRoute,
    };
  }

  if (accessSummary.latestGeneratedAccessRoute) {
    return {
      kind: "generated-latest",
      route: accessSummary.latestGeneratedAccessRoute,
    };
  }

  if (accessSummary.plannedGeneratedAccessRoute) {
    return {
      kind: "generated-planned",
      route: accessSummary.plannedGeneratedAccessRoute,
    };
  }

  return null;
}
