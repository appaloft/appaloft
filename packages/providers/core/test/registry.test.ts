import { describe, expect, test } from "bun:test";
import { aliyunProvider } from "@appaloft/provider-aliyun";
import { genericSshProvider } from "@appaloft/provider-generic-ssh";
import { tencentProvider } from "@appaloft/provider-tencent";
import { InMemoryProviderRegistry } from "../src/index";

describe("provider registry contract", () => {
  test("[SYSTEM-DIAG-001] returns provider descriptors with safe capability diagnostics", () => {
    const registry = new InMemoryProviderRegistry([
      genericSshProvider,
      aliyunProvider,
      tencentProvider,
    ]);

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
          key: "aliyun",
          category: "cloud-provider",
          configuration: expect.objectContaining({
            status: "not-configured",
          }),
        }),
        expect.objectContaining({
          key: "tencent-cloud",
          category: "cloud-provider",
        }),
      ]),
    );
    expect(JSON.stringify(registry.list())).not.toContain("accessToken");
    expect(JSON.stringify(registry.list())).not.toContain("privateKey");
  });

  test("finds a provider descriptor by normalized key without scanning callers", () => {
    const registry = new InMemoryProviderRegistry([
      genericSshProvider,
      aliyunProvider,
      tencentProvider,
    ]);

    expect(registry.findByKey("generic-ssh")).toMatchObject({
      key: "generic-ssh",
      category: "deploy-target",
    });
    expect(registry.findByKey("missing-provider")).toBeNull();
  });
});
