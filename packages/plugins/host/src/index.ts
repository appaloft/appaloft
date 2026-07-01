import { type PluginRegistry, type PluginSummary } from "@appaloft/application";
import {
  isPluginCompatible,
  pluginManifestSchema,
  type SystemPluginDefinition,
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginWebExtension,
  type SystemPluginWebHeadContribution,
  systemPluginWebExtensionSchema,
  systemPluginWebHeadContributionSchema,
} from "@appaloft/plugin-sdk";

export interface SystemPluginWebHeadContributionSummary extends SystemPluginWebHeadContribution {
  pluginName: string;
  pluginDisplayName: string;
}

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
  private readonly byName: Map<string, PluginSummary>;

  constructor(definitions: SystemPluginDefinition[], appVersion: string) {
    this.plugins = definitions.map((definition) => {
      const manifest = pluginManifestSchema.parse(definition.manifest);
      const compatible = isPluginCompatible(manifest, appVersion);

      if (
        manifest.kind !== "system-extension" &&
        (definition.webHeadContributions ||
          definition.webExtensions ||
          definition.http?.middlewares ||
          definition.http?.routes)
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
          ...(definition.webHeadContributions
            ? {
                webHeadContributions: definition.webHeadContributions.map((contribution) =>
                  systemPluginWebHeadContributionSchema.parse(contribution),
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
          capabilityDetails: manifest.capabilities.map((capability) => ({
            key: capability,
            title: capability,
            enabled: compatible,
            description: compatible
              ? "Capability is active for the current Appaloft version."
              : "Capability is disabled because the plugin compatibility range does not match.",
          })),
          compatible,
          configuration: {
            status: compatible ? "configured" : "not-configured",
            diagnostics: compatible
              ? [
                  {
                    code: "plugin.compatible",
                    severity: "info",
                    message: "Plugin compatibility range matches the current Appaloft version.",
                  },
                ]
              : [
                  {
                    code: "plugin.incompatible",
                    severity: "warning",
                    message:
                      "Plugin is visible but inactive because its compatibility range does not match the current Appaloft version.",
                  },
                ],
          },
        },
      };
    });
    this.byName = new Map(
      this.plugins.map((plugin) => [plugin.summary.name, { ...plugin.summary }]),
    );
  }

  list(): PluginSummary[] {
    return this.plugins.map((plugin) => ({ ...plugin.summary }));
  }

  findByName(name: string): PluginSummary | null {
    const plugin = this.byName.get(name);
    return plugin ? { ...plugin } : null;
  }

  listWebHeadContributions(): SystemPluginWebHeadContributionSummary[] {
    return this.plugins
      .filter((plugin) => plugin.summary.compatible && plugin.summary.kind === "system-extension")
      .flatMap((plugin) =>
        (plugin.definition.webHeadContributions ?? []).map((contribution) => ({
          ...contribution,
          pluginName: plugin.summary.name,
          pluginDisplayName: plugin.summary.displayName ?? plugin.summary.name,
        })),
      );
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
