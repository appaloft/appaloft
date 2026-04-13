import { type AccessRoute } from "@yundu/core";

export const yunduEdgeNetworkName = "yundu-edge";

export type EdgeProxyRuntimeKind = "traefik" | "caddy";

export interface ProxyBootstrapPlan {
  kind: EdgeProxyRuntimeKind;
  displayName: string;
  networkName: string;
  networkCommand: string;
  containerName: string;
  containerCommand: string;
}

export function proxyKindForAccessRoutes(
  accessRoutes: AccessRoute[],
): EdgeProxyRuntimeKind | undefined {
  return accessRoutes.find((route) => route.proxyKind !== "none")?.proxyKind as
    | EdgeProxyRuntimeKind
    | undefined;
}

export function dockerNetworkFlagForAccessRoutes(accessRoutes: AccessRoute[]): string {
  return proxyKindForAccessRoutes(accessRoutes) ? `--network ${yunduEdgeNetworkName}` : "";
}

export function createProxyBootstrapPlan(
  accessRoutes: AccessRoute[],
): ProxyBootstrapPlan | undefined {
  const kind = proxyKindForAccessRoutes(accessRoutes);

  if (!kind) {
    return undefined;
  }

  const networkCommand = `docker network inspect ${yunduEdgeNetworkName} >/dev/null 2>&1 || docker network create ${yunduEdgeNetworkName}`;

  switch (kind) {
    case "traefik":
      return {
        kind,
        displayName: "Traefik",
        networkName: yunduEdgeNetworkName,
        networkCommand,
        containerName: "yundu-traefik",
        containerCommand: [
          "docker inspect -f '{{.State.Running}}' yundu-traefik 2>/dev/null | grep true >/dev/null || (docker rm -f yundu-traefik >/dev/null 2>&1 || true; docker run -d",
          "--restart unless-stopped",
          "--name yundu-traefik",
          `--network ${yunduEdgeNetworkName}`,
          "-p 80:80",
          "-p 443:443",
          "-v /var/run/docker.sock:/var/run/docker.sock:ro",
          "traefik:v3.1",
          "--providers.docker=true",
          "--providers.docker.exposedbydefault=false",
          `--providers.docker.network=${yunduEdgeNetworkName}`,
          "--entrypoints.web.address=:80",
          "--entrypoints.websecure.address=:443",
          ")",
        ].join(" "),
      };
    case "caddy":
      return {
        kind,
        displayName: "Caddy",
        networkName: yunduEdgeNetworkName,
        networkCommand,
        containerName: "yundu-caddy",
        containerCommand: [
          "docker inspect -f '{{.State.Running}}' yundu-caddy 2>/dev/null | grep true >/dev/null || (docker rm -f yundu-caddy >/dev/null 2>&1 || true; docker run -d",
          "--restart unless-stopped",
          "--name yundu-caddy",
          `--network ${yunduEdgeNetworkName}`,
          "-p 80:80",
          "-p 443:443",
          "-v /var/run/docker.sock:/var/run/docker.sock",
          "-v yundu-caddy-data:/data",
          "-v yundu-caddy-config:/config",
          `-e CADDY_INGRESS_NETWORKS=${yunduEdgeNetworkName}`,
          "lucaslorentz/caddy-docker-proxy:2.9-alpine",
          ")",
        ].join(" "),
      };
  }
}
