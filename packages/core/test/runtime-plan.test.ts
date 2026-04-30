import { describe, expect, test } from "bun:test";

import {
  AccessRoute,
  EdgeProxyKindValue,
  FilePathText,
  ImageReference,
  PortNumber,
  PublicDomainName,
  RoutePathPrefix,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
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

  test("[DMBH-RUNTIME-001] composes proxy kind predicates for route domain admission", () => {
    const disabledWithDomain = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("none"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("disabled"),
    });
    const enabledWithDomain = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
    });
    const redirectToSelf = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
      redirectTo: PublicDomainName.rehydrate("api.example.com"),
    });

    expect(EdgeProxyKindValue.rehydrate("none").isDisabled()).toBe(true);
    expect(EdgeProxyKindValue.rehydrate("traefik").isProviderBacked()).toBe(true);
    expect(disabledWithDomain.isErr()).toBe(true);
    expect(enabledWithDomain.isOk()).toBe(true);
    expect(redirectToSelf.isErr()).toBe(true);
  });

  test("[DMBH-RUNTIME-001] artifact kind and intent answer prerequisite requirements", () => {
    const prebuiltWithoutImage = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
    });
    const prebuiltWithImage = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
      image: ImageReference.rehydrate("ghcr.io/appaloft/demo:latest"),
    });
    const composeWithoutFile = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
    });
    const composeWithFile = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
      composeFile: FilePathText.rehydrate("compose.yaml"),
    });

    expect(RuntimeArtifactIntentValue.rehydrate("prebuilt-image").isPrebuiltImage()).toBe(true);
    expect(RuntimeArtifactKindValue.rehydrate("compose-project").isComposeProject()).toBe(true);
    expect(prebuiltWithoutImage.isErr()).toBe(true);
    expect(prebuiltWithImage.isOk()).toBe(true);
    expect(composeWithoutFile.isErr()).toBe(true);
    expect(composeWithFile.isOk()).toBe(true);
  });

  test("normalizes public domain names", () => {
    const domain = PublicDomainName.create("API.Example.COM")._unsafeUnwrap();

    expect(domain.value).toBe("api.example.com");
  });
});
