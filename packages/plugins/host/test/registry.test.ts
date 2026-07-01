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
  test("[SYSTEM-DIAG-002] returns plugin summaries with safe capability diagnostics", () => {
    const host = new LocalPluginHost([builtinRuntimePlugin], "0.1.2");

    expect(host.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "builtin-fake-runtime",
          displayName: "Builtin Fake Runtime",
          kind: "user-extension",
          compatible: true,
          capabilityDetails: expect.arrayContaining([
            expect.objectContaining({
              key: "deployment-hook",
              enabled: true,
            }),
          ]),
          configuration: expect.objectContaining({
            status: "configured",
            diagnostics: expect.arrayContaining([
              expect.objectContaining({
                code: "plugin.compatible",
              }),
            ]),
          }),
        }),
      ]),
    );
  });

  test("[SYSTEM-DIAG-002] keeps incompatible plugin capabilities visible but inactive", () => {
    const host = new LocalPluginHost([builtinRuntimePlugin], "0.2.0");

    expect(host.list()).toEqual([
      expect.objectContaining({
        name: "builtin-fake-runtime",
        compatible: false,
        capabilityDetails: expect.arrayContaining([
          expect.objectContaining({
            key: "deployment-hook",
            enabled: false,
          }),
        ]),
        configuration: expect.objectContaining({
          status: "not-configured",
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              code: "plugin.incompatible",
            }),
          ]),
        }),
      }),
    ]);
  });

  test("finds a plugin summary by plugin name", () => {
    const host = new LocalPluginHost([builtinRuntimePlugin], "0.1.2");

    expect(host.findByName("builtin-fake-runtime")).toMatchObject({
      name: "builtin-fake-runtime",
      displayName: "Builtin Fake Runtime",
    });
    expect(host.findByName("missing-plugin")).toBeNull();
  });

  test("[WEB-HEAD-CONTRIB-001] lists web head contributions for compatible system plugins only", () => {
    const configuredHeadPlugin: SystemPluginDefinition = {
      manifest: {
        name: "configured-web-head",
        displayName: "Configured Web Head",
        description: "Runtime configured Web Console head contributions.",
        version: "0.1.0",
        kind: "system-extension",
        compatibilityRange: "^0.1.0",
        capabilities: ["web-head"],
        entrypoint: "appaloft-server://configured-web-head",
      },
      webHeadContributions: [
        {
          key: "configured-runtime-script",
          html: '<script type="application/json" id="configured-runtime">{}</script>',
        },
      ],
    };
    const incompatibleHeadPlugin: SystemPluginDefinition = {
      ...configuredHeadPlugin,
      manifest: {
        ...configuredHeadPlugin.manifest,
        name: "configured-web-head-incompatible",
        compatibilityRange: "^0.2.0",
      },
      webHeadContributions: [
        {
          key: "incompatible-runtime-script",
          html: '<script type="application/json" id="incompatible-runtime">{}</script>',
        },
      ],
    };

    const host = new LocalPluginHost([configuredHeadPlugin, incompatibleHeadPlugin], "0.1.2");

    expect(host.listWebHeadContributions()).toEqual([
      expect.objectContaining({
        key: "configured-runtime-script",
        pluginName: "configured-web-head",
        pluginDisplayName: "Configured Web Head",
      }),
    ]);
  });
});
