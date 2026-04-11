import { type PluginRegistry, type PluginSummary } from "@yundu/application";
import {
  isPluginCompatible,
  pluginManifestSchema,
  type SystemPluginDefinition,
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginWebExtension,
  systemPluginWebExtensionSchema,
} from "@yundu/plugin-sdk";

export interface SystemPluginWebExtensionSummary extends SystemPluginWebExtension {
  pluginName: string;
  pluginDisplayName: string;
}

interface RegisteredPlugin {
  definition: SystemPluginDefinition;
  summary: PluginSummary;
}

export class LocalPluginHost implements PluginRegistry {
  private readonly plugins: RegisteredPlugin[];

  constructor(definitions: SystemPluginDefinition[], appVersion: string) {
    this.plugins = definitions.map((definition) => {
      const manifest = pluginManifestSchema.parse(definition.manifest);
      const compatible = isPluginCompatible(manifest, appVersion);

      if (
        manifest.kind !== "system-extension" &&
        (definition.webExtensions || definition.http?.middlewares || definition.http?.routes)
      ) {
        throw new Error(
          `Plugin ${manifest.name} declares runtime HTTP or web extensions but is not marked as a system-extension`,
        );
      }

      return {
        definition: {
          ...definition,
          manifest,
          ...(definition.webExtensions
            ? {
                webExtensions: definition.webExtensions.map((extension) =>
                  systemPluginWebExtensionSchema.parse(extension),
                ),
              }
            : {}),
        },
        summary: {
          name: manifest.name,
          ...(manifest.displayName ? { displayName: manifest.displayName } : {}),
          ...(manifest.description ? { description: manifest.description } : {}),
          version: manifest.version,
          kind: manifest.kind,
          capabilities: manifest.capabilities,
          compatible,
        },
      };
    });
  }

  list(): PluginSummary[] {
    return this.plugins.map((plugin) => ({ ...plugin.summary }));
  }

  listWebExtensions(): SystemPluginWebExtensionSummary[] {
    return this.plugins
      .filter((plugin) => plugin.summary.compatible && plugin.summary.kind === "system-extension")
      .flatMap((plugin) =>
        (plugin.definition.webExtensions ?? []).map((extension) => ({
          ...extension,
          pluginName: plugin.summary.name,
          pluginDisplayName: plugin.summary.displayName ?? plugin.summary.name,
        })),
      );
  }

  listHttpMiddlewares(): SystemPluginHttpMiddleware[] {
    return this.plugins
      .filter((plugin) => plugin.summary.compatible && plugin.summary.kind === "system-extension")
      .flatMap((plugin) => plugin.definition.http?.middlewares ?? []);
  }

  listHttpRoutes(): SystemPluginHttpRoute[] {
    return this.plugins
      .filter((plugin) => plugin.summary.compatible && plugin.summary.kind === "system-extension")
      .flatMap((plugin) => plugin.definition.http?.routes ?? []);
  }
}
