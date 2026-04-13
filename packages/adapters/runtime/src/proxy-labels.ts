import { type AccessRoute } from "@yundu/core";
import { yunduEdgeNetworkName } from "./proxy-bootstrap";

function routeName(input: { deploymentId: string; suffix?: string }): string {
  return [input.deploymentId, input.suffix].filter(Boolean).join("-").replace(/[^a-zA-Z0-9-]/g, "-");
}

function traefikRule(route: AccessRoute): string {
  const hostRule = route.domains.map((domain) => `Host(\`${domain}\`)`).join(" || ");
  return route.pathPrefix === "/"
    ? hostRule
    : `(${hostRule}) && PathPrefix(\`${route.pathPrefix}\`)`;
}

function labelsForTraefik(input: {
  deploymentId: string;
  route: AccessRoute;
  port: number;
  index: number;
}): string[] {
  const router = routeName({
    deploymentId: input.deploymentId,
    ...(input.index === 0 ? {} : { suffix: String(input.index) }),
  });
  const service = `${router}-svc`;
  const entrypoint = input.route.tlsMode === "auto" ? "websecure" : "web";

  return [
    "traefik.enable=true",
    `traefik.docker.network=${yunduEdgeNetworkName}`,
    `traefik.http.routers.${router}.rule=${traefikRule(input.route)}`,
    `traefik.http.routers.${router}.entrypoints=${entrypoint}`,
    ...(input.route.tlsMode === "auto" ? [`traefik.http.routers.${router}.tls=true`] : []),
    `traefik.http.routers.${router}.service=${service}`,
    `traefik.http.services.${service}.loadbalancer.server.port=${input.route.targetPort ?? input.port}`,
  ];
}

function labelsForCaddy(input: { route: AccessRoute; port: number; index: number }): string[] {
  const suffix = input.index === 0 ? "" : `_${input.index}`;
  const scheme = input.route.tlsMode === "auto" ? "https" : "http";
  const site = input.route.domains.map((domain) => `${scheme}://${domain}`).join(", ");
  const path = input.route.pathPrefix === "/" ? "" : `${input.route.pathPrefix}*`;
  const reverseProxy = `{{upstreams ${input.route.targetPort ?? input.port}}}`;

  return path
    ? [
        `caddy${suffix}=${site}`,
        `caddy${suffix}.handle_path=${path}`,
        `caddy${suffix}.handle_path.reverse_proxy=${reverseProxy}`,
      ]
    : [`caddy${suffix}=${site}`, `caddy${suffix}.reverse_proxy=${reverseProxy}`];
}

export function dockerLabelFlagsForAccessRoutes(input: {
  deploymentId: string;
  port: number;
  accessRoutes: AccessRoute[];
  quote: (value: string) => string;
}): string {
  const labels = input.accessRoutes.flatMap((route, index) => {
    switch (route.proxyKind) {
      case "traefik":
        return labelsForTraefik({
          deploymentId: input.deploymentId,
          route,
          port: input.port,
          index,
        });
      case "caddy":
        return labelsForCaddy({ route, port: input.port, index });
      case "none":
        return [];
    }
  });

  return labels.map((label) => `--label ${input.quote(label)}`).join(" ");
}
