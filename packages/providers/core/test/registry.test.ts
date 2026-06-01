import { describe, expect, test } from "bun:test";
import { acmeCertificateProvider } from "@appaloft/provider-certificate-acme";
import { genericSshProvider } from "@appaloft/provider-generic-ssh";
import { InMemoryProviderRegistry } from "../src/index";

describe("provider registry contract", () => {
  test("[SYSTEM-DIAG-001] returns provider descriptors with safe capability diagnostics", () => {
    const registry = new InMemoryProviderRegistry([genericSshProvider, acmeCertificateProvider]);

    expect(registry.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "generic-ssh",
          category: "deploy-target",
          capabilityDetails: expect.arrayContaining([
            expect.objectContaining({
              key: "remote-command",
              enabled: true,
            }),
          ]),
          configuration: expect.objectContaining({
            status: "configured",
            diagnostics: expect.arrayContaining([
              expect.objectContaining({
                code: "provider.generic_ssh.configured",
              }),
            ]),
          }),
        }),
        expect.objectContaining({
          key: "acme",
          category: "infra-service",
          configuration: expect.objectContaining({
            status: "partial",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(registry.list())).not.toContain("accessToken");
    expect(JSON.stringify(registry.list())).not.toContain("privateKey");
  });

  test("finds a provider descriptor by normalized key without scanning callers", () => {
    const registry = new InMemoryProviderRegistry([genericSshProvider, acmeCertificateProvider]);

    expect(registry.findByKey("generic-ssh")).toMatchObject({
      key: "generic-ssh",
      category: "deploy-target",
    });
    expect(registry.findByKey("missing-provider")).toBeNull();
  });
});
