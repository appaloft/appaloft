import { describe, expect, test } from "bun:test";
import { type SystemPluginDefinition } from "@appaloft/plugin-sdk";
import { LocalPluginHost } from "../src/index";

const builtinRuntimePlugin: SystemPluginDefinition = {
  manifest: {
    name: "builtin-fake-runtime",
    displayName: "Builtin Fake Runtime",
    description: "Built-in deployment runtime example plugin.",
    version: "0.1.0",
    kind: "user-extension",
    compatibilityRange: "^0.1.0",
    capabilities: ["deployment-hook", "source-detector"],
    entrypoint: "internal://builtin-fake-runtime",
  },
};

describe("plugin registry contract", () => {
  test("returns plugin summaries from registered definitions", () => {
    const host = new LocalPluginHost([builtinRuntimePlugin], "0.1.2");

    expect(host.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "builtin-fake-runtime",
          displayName: "Builtin Fake Runtime",
          kind: "user-extension",
          compatible: true,
        }),
      ]),
    );
  });

  test("finds a plugin summary by plugin name", () => {
    const host = new LocalPluginHost([builtinRuntimePlugin], "0.1.2");

    expect(host.findByName("builtin-fake-runtime")).toMatchObject({
      name: "builtin-fake-runtime",
      displayName: "Builtin Fake Runtime",
    });
    expect(host.findByName("missing-plugin")).toBeNull();
  });
});
