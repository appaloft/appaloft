export interface PublicHealthRouteCandidate {
  pathPrefix: string;
  domains?: readonly string[] | undefined;
  proxyKind?: string | undefined;
  targetPort?: number | undefined;
  targetServiceName?: string | undefined;
  redirectTo?: string | undefined;
}

export interface PublicHealthRouteTarget<T extends PublicHealthRouteCandidate> {
  route: T;
  domain?: string;
}

function servedRoutesForTarget<T extends PublicHealthRouteCandidate>(
  routes: readonly T[],
  targetServiceName?: string,
): T[] {
  const servedRoutes = routes.filter((route) => !route.redirectTo);
  if (!targetServiceName) {
    return servedRoutes;
  }

  const exact = servedRoutes.filter((route) => route.targetServiceName === targetServiceName);
  if (exact.length > 0) {
    return exact;
  }

  return servedRoutes.filter((route) => !route.targetServiceName);
}

export function selectPublicHealthRouteTargets<T extends PublicHealthRouteCandidate>(
  routes: readonly T[],
  targetServiceName?: string,
): PublicHealthRouteTarget<T>[] {
  const targets: PublicHealthRouteTarget<T>[] = servedRoutesForTarget(
    routes,
    targetServiceName,
  ).flatMap((route): PublicHealthRouteTarget<T>[] => {
    if (route.proxyKind === "none") {
      return [{ route }];
    }

    const domains = [...new Set((route.domains ?? []).map((domain) => domain.trim()).filter(Boolean))];
    return domains.length > 0 ? domains.map((domain) => ({ route, domain })) : [{ route }];
  });
  const seen = new Set<string>();

  return targets.filter(({ route, domain }) => {
    const key = [
      route.proxyKind ?? "",
      domain ?? "",
      route.pathPrefix,
      route.targetServiceName ?? "",
      String(route.targetPort ?? ""),
    ].join("\u0000");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function selectPublicHealthRoute<T extends PublicHealthRouteCandidate>(
  routes: readonly T[],
  targetServiceName?: string,
): T | undefined {
  const candidates = servedRoutesForTarget(routes, targetServiceName);

  return (
    candidates.find((route) => route.pathPrefix === "/") ??
    [...candidates].sort((left, right) => left.pathPrefix.length - right.pathPrefix.length)[0]
  );
}
