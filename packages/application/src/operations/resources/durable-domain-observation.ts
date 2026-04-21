import { type DomainBindingSummary, type ResourceAccessSummary } from "../../ports";

const nonReadyDurableStatuses = new Set<DomainBindingSummary["status"]>([
  "requested",
  "pending_verification",
  "bound",
  "certificate_pending",
  "not_ready",
]);

function compareCreatedAtDesc(
  left: Pick<DomainBindingSummary, "createdAt" | "id">,
  right: Pick<DomainBindingSummary, "createdAt" | "id">,
): number {
  const createdCompare = right.createdAt.localeCompare(left.createdAt);
  if (createdCompare !== 0) {
    return createdCompare;
  }

  return right.id.localeCompare(left.id);
}

export function currentNonReadyDurableDomainBinding(
  bindings: DomainBindingSummary[],
  accessSummary: ResourceAccessSummary | undefined,
): DomainBindingSummary | undefined {
  if (accessSummary?.latestDurableDomainRoute) {
    return undefined;
  }

  return [...bindings]
    .filter((binding) => !binding.redirectTo)
    .filter((binding) => binding.proxyKind !== "none")
    .filter((binding) => nonReadyDurableStatuses.has(binding.status))
    .sort(compareCreatedAtDesc)[0];
}

export function durableDomainBindingUrl(
  binding: Pick<DomainBindingSummary, "domainName" | "pathPrefix" | "tlsMode">,
): string {
  const scheme = binding.tlsMode === "auto" ? "https" : "http";
  const path = binding.pathPrefix === "/" ? "" : binding.pathPrefix;
  return `${scheme}://${binding.domainName}${path}`;
}

export function durableDomainBindingNotReadyCategory(
  binding: Pick<DomainBindingSummary, "status">,
): "infra" | "user" {
  if (binding.status === "requested" || binding.status === "pending_verification") {
    return "user";
  }

  return "infra";
}

export function durableDomainBindingNotReadyMessage(
  binding: Pick<DomainBindingSummary, "domainName" | "status">,
): string {
  return `Durable domain binding ${binding.domainName} is ${binding.status} and not ready for traffic.`;
}
