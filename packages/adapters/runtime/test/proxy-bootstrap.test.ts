import { describe, expect, test } from "bun:test";
import {
  AccessRoute,
  EdgeProxyKindValue,
  PublicDomainName,
  RoutePathPrefix,
  TlsModeValue,
} from "@yundu/core";
import {
  createProxyBootstrapPlan,
  dockerNetworkFlagForAccessRoutes,
} from "../src/proxy-bootstrap";

function route(proxyKind: "traefik" | "caddy") {
  return AccessRoute.rehydrate({
    proxyKind: EdgeProxyKindValue.rehydrate(proxyKind),
    domains: [PublicDomainName.rehydrate("api.example.com")],
    pathPrefix: RoutePathPrefix.rehydrate("/"),
    tlsMode: TlsModeValue.rehydrate("auto"),
  });
}

describe("createProxyBootstrapPlan", () => {
  test("builds a Traefik bootstrap plan for access routes", () => {
    const plan = createProxyBootstrapPlan([route("traefik")]);

    expect(plan?.containerName).toBe("yundu-traefik");
    expect(plan?.networkCommand).toContain("docker network create yundu-edge");
    expect(plan?.containerCommand).toContain("traefik:v3.1");
    expect(dockerNetworkFlagForAccessRoutes([route("traefik")])).toBe("--network yundu-edge");
  });

  test("builds a Caddy docker proxy bootstrap plan for access routes", () => {
    const plan = createProxyBootstrapPlan([route("caddy")]);

    expect(plan?.containerName).toBe("yundu-caddy");
    expect(plan?.containerCommand).toContain("lucaslorentz/caddy-docker-proxy:2.9-alpine");
    expect(plan?.containerCommand).toContain("CADDY_INGRESS_NETWORKS=yundu-edge");
  });
});
