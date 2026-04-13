import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  EdgeProxyKindValue,
  PortNumber,
  PublicDomainName,
  RoutePathPrefix,
  TlsModeValue,
} from "@yundu/core";
import { dockerLabelFlagsForAccessRoutes } from "../src/proxy-labels";

function route(input: {
  proxyKind: "traefik" | "caddy";
  domain: string;
  pathPrefix?: string;
}) {
  return AccessRoute.rehydrate({
    proxyKind: EdgeProxyKindValue.rehydrate(input.proxyKind),
    domains: [PublicDomainName.rehydrate(input.domain)],
    pathPrefix: RoutePathPrefix.rehydrate(input.pathPrefix ?? "/"),
    tlsMode: TlsModeValue.rehydrate("auto"),
    targetPort: PortNumber.rehydrate(3000),
  });
}

describe("dockerLabelFlagsForAccessRoutes", () => {
  test("emits Traefik router and service labels", () => {
    const flags = dockerLabelFlagsForAccessRoutes({
      deploymentId: "dep_1",
      port: 3000,
      accessRoutes: [route({ proxyKind: "traefik", domain: "api.example.com" })],
      quote: JSON.stringify,
    });

    expect(flags).toContain("--label \"traefik.enable=true\"");
    expect(flags).toContain("--label \"traefik.docker.network=yundu-edge\"");
    expect(flags).toContain("traefik.http.routers.dep-1.rule=Host(`api.example.com`)");
    expect(flags).toContain(
      "traefik.http.services.dep-1-svc.loadbalancer.server.port=3000",
    );
  });

  test("emits Caddy root path labels", () => {
    const flags = dockerLabelFlagsForAccessRoutes({
      deploymentId: "dep_2",
      port: 3000,
      accessRoutes: [route({ proxyKind: "caddy", domain: "api.example.com" })],
      quote: JSON.stringify,
    });

    expect(flags).toContain("--label \"caddy=https://api.example.com\"");
    expect(flags).toContain("--label \"caddy.reverse_proxy={{upstreams 3000}}\"");
  });
});
