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
  proxyBootstrapOptionsFromEnv,
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
    expect(plan?.containerCommand).toContain("-p 80:80");
    expect(plan?.containerCommand).toContain("-p 443:443");
    expect(dockerNetworkFlagForAccessRoutes([route("traefik")])).toBe("--network yundu-edge");
  });

  test("builds a Caddy docker proxy bootstrap plan for access routes", () => {
    const plan = createProxyBootstrapPlan([route("caddy")]);

    expect(plan?.containerName).toBe("yundu-caddy");
    expect(plan?.containerCommand).toContain("lucaslorentz/caddy-docker-proxy:2.9-alpine");
    expect(plan?.containerCommand).toContain("CADDY_INGRESS_NETWORKS=yundu-edge");
  });

  test("allows host port overrides for opt-in docker e2e tests", () => {
    const plan = createProxyBootstrapPlan([route("traefik")], {
      httpPort: 18080,
      httpsPort: 18443,
    });

    expect(plan?.containerCommand).toContain("-p 18080:80");
    expect(plan?.containerCommand).toContain("-p 18443:443");
  });

  test("derives valid port overrides from environment variables", () => {
    expect(
      proxyBootstrapOptionsFromEnv({
        YUNDU_EDGE_HTTP_PORT: "28080",
        YUNDU_EDGE_HTTPS_PORT: "28443",
      }),
    ).toEqual({
      httpPort: 28080,
      httpsPort: 28443,
    });
    expect(proxyBootstrapOptionsFromEnv({ YUNDU_EDGE_HTTP_PORT: "nope" })).toEqual({});
  });
});
