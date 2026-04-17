import { type SystemPluginDefinition } from "@appaloft/plugin-sdk";

const builtinFakeRuntimePlugin: SystemPluginDefinition = {
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

export function createBuiltinPlugins(): SystemPluginDefinition[] {
  return [builtinFakeRuntimePlugin];
}
