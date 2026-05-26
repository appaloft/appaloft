import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { operationCatalog } from "../src/operation-catalog";

describe("Static artifact publishing ports", () => {
  test("[STATIC-ARTIFACT-EXT-004] exposes provider-neutral application ports and tokens", () => {
    const portsSource = readSource("../src/ports.ts");
    const tokensSource = readSource("../src/tokens.ts");

    expect(portsSource).toContain("export interface StaticArtifactStorePort");
    expect(portsSource).toContain("export interface StaticArtifactRouteProviderPort");
    expect(portsSource).toContain("export interface StaticArtifactPublisherPort");
    expect(portsSource).toContain("export interface StaticArtifactPublicationJournalPort");
    expect(portsSource).toContain("export interface StaticArtifactPublicationReadModelPort");
    expect(portsSource).toContain("export interface StaticArtifactFilePayload");
    expect(portsSource).toContain("export interface StaticArtifactPayloadReaderPort");
    expect(portsSource).toContain("files?: readonly StaticArtifactFilePayload[]");
    expect(portsSource).toContain("StaticArtifactStoredManifest");
    expect(portsSource).toContain("StaticArtifactRouteActivation");
    expect(portsSource).toContain("StaticArtifactPublication");
    expect(portsSource).not.toContain("Cloudflare");
    expect(portsSource).not.toContain("appaloft.app");
    expect(tokensSource).toContain("staticArtifactStorePort");
    expect(tokensSource).toContain("staticArtifactPayloadReaderPort");
    expect(tokensSource).toContain("staticArtifactRouteProviderPort");
    expect(tokensSource).toContain("staticArtifactPublisherPort");
    expect(tokensSource).toContain("staticArtifactPublicationJournalPort");
    expect(tokensSource).toContain("staticArtifactPublicationReadModelPort");
  });

  test("[STATIC-ARTIFACT-EXT-011][STATIC-ARTIFACT-EXT-014][STATIC-ARTIFACT-EXT-015][STATIC-ARTIFACT-EXT-016] catalogs static artifact transports", () => {
    const publishEntry = operationCatalog.find(
      (candidate) => candidate.key === "static-artifacts.publish",
    );
    const publishPayloadEntry = operationCatalog.find(
      (candidate) => candidate.key === "static-artifacts.publish-payload",
    );
    const publishArchiveEntry = operationCatalog.find(
      (candidate) => candidate.key === "static-artifacts.publish-archive",
    );
    const listEntry = operationCatalog.find(
      (candidate) => candidate.key === "static-artifacts.publications.list",
    );

    expect(publishEntry).toMatchObject({
      kind: "command",
      domain: "static-artifacts",
      messageName: "PublishStaticArtifactCommand",
      transports: {
        orpc: { method: "POST", path: "/api/static-artifacts/publish" },
      },
    });
    expect(publishPayloadEntry).toMatchObject({
      kind: "command",
      domain: "static-artifacts",
      messageName: "PublishStaticArtifactPayloadCommand",
      transports: {
        cli: "appaloft static-artifacts publish <dist-directory>",
        orpc: { method: "POST", path: "/api/static-artifacts/publish-payload" },
      },
    });
    expect(publishArchiveEntry).toMatchObject({
      kind: "command",
      domain: "static-artifacts",
      messageName: "PublishStaticArtifactArchiveCommand",
      transports: {
        cli: "appaloft static-artifacts publish <dist.zip>",
        orpc: { method: "POST", path: "/api/static-artifacts/publish-archive" },
      },
    });
    expect(listEntry).toMatchObject({
      kind: "query",
      domain: "static-artifacts",
      messageName: "ListStaticArtifactPublicationsQuery",
      transports: {
        orpc: { method: "GET", path: "/api/static-artifacts/publications" },
      },
    });
  });
});

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
