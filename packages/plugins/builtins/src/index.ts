import { createAppaloftOpenApiReferencePlugin } from "@appaloft/openapi";
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

export interface CreateBuiltinPluginsOptions {
  readonly appVersion?: string;
}

export function createBuiltinPlugins(
  options: CreateBuiltinPluginsOptions = {},
): SystemPluginDefinition[] {
  return [
    builtinFakeRuntimePlugin,
    createAppaloftOpenApiReferencePlugin({
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    }),
  ];
}
