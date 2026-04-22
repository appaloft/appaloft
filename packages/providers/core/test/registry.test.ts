import { describe, expect, test } from "bun:test";
import { aliyunProvider } from "@appaloft/provider-aliyun";
import { genericSshProvider } from "@appaloft/provider-generic-ssh";
import { tencentProvider } from "@appaloft/provider-tencent";
import { InMemoryProviderRegistry } from "../src/index";

describe("provider registry contract", () => {
  test("returns provider descriptors with stable capability flags", () => {
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
        }),
        expect.objectContaining({
          key: "aliyun",
          category: "cloud-provider",
        }),
        expect.objectContaining({
          key: "tencent-cloud",
          category: "cloud-provider",
        }),
      ]),
    );
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
