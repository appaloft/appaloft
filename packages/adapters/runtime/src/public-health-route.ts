export interface PublicHealthRouteCandidate {
  pathPrefix: string;
  targetServiceName?: string | undefined;
  redirectTo?: string | undefined;
}

export function selectPublicHealthRoute<T extends PublicHealthRouteCandidate>(
  routes: readonly T[],
  targetServiceName?: string,
): T | undefined {
  const servedRoutes = routes.filter((route) => !route.redirectTo);
  const targetRoutes = targetServiceName
    ? servedRoutes.filter((route) => route.targetServiceName === targetServiceName)
    : [];
  const candidates = targetRoutes.length > 0 ? targetRoutes : servedRoutes;

  return (
    candidates.find((route) => route.pathPrefix === "/") ??
    [...candidates].sort((left, right) => left.pathPrefix.length - right.pathPrefix.length)[0]
  );
}
