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

export interface ProxyBootstrapOptions {
  httpPort?: number;
  httpsPort?: number;
}

function hostPort(input: number | undefined, fallback: number): number {
  if (input === undefined) {
    return fallback;
  }

  return Number.isInteger(input) && input > 0 && input <= 65535 ? input : fallback;
}

function portFromEnv(env: Record<string, string | undefined>, key: string): number | undefined {
  const value = env[key];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : undefined;
}

export function proxyBootstrapOptionsFromEnv(
  env: Record<string, string | undefined>,
): ProxyBootstrapOptions {
  const httpPort = portFromEnv(env, "YUNDU_EDGE_HTTP_PORT");
  const httpsPort = portFromEnv(env, "YUNDU_EDGE_HTTPS_PORT");

  return {
    ...(httpPort === undefined ? {} : { httpPort }),
    ...(httpsPort === undefined ? {} : { httpsPort }),
  };
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
  options: ProxyBootstrapOptions = {},
): ProxyBootstrapPlan | undefined {
  const kind = proxyKindForAccessRoutes(accessRoutes);

  return kind ? createProxyBootstrapPlanForKind(kind, options) : undefined;
}

export function createProxyBootstrapPlanForKind(
  kind: EdgeProxyRuntimeKind,
  options: ProxyBootstrapOptions = {},
): ProxyBootstrapPlan {
  const networkCommand = `docker network inspect ${yunduEdgeNetworkName} >/dev/null 2>&1 || docker network create ${yunduEdgeNetworkName}`;
  const httpPort = hostPort(options.httpPort, 80);
  const httpsPort = hostPort(options.httpsPort, 443);

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
          `-p ${httpPort}:80`,
          `-p ${httpsPort}:443`,
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
          `-p ${httpPort}:80`,
          `-p ${httpsPort}:443`,
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
