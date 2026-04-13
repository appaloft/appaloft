import { describe, expect, test } from "bun:test";

import {
  AccessRoute,
  EdgeProxyKindValue,
  PortNumber,
  PublicDomainName,
  RoutePathPrefix,
  TlsModeValue,
} from "../src";

describe("AccessRoute", () => {
  test("requires domains when proxy routing is enabled", () => {
    const route = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
    });

    expect(route.isErr()).toBe(true);
  });

  test("normalizes public domain names", () => {
    const domain = PublicDomainName.create("API.Example.COM")._unsafeUnwrap();

    expect(domain.value).toBe("api.example.com");
  });
});
