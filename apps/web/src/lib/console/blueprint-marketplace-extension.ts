import { type SystemPluginWebExtension } from "@appaloft/contracts";

export const blueprintCatalogRenderer = "blueprint-catalog" as const;

export interface BlueprintCatalogExtensionMetadata {
  readonly renderer: typeof blueprintCatalogRenderer;
  readonly listEndpoint: string;
  readonly detailEndpointTemplate?: string;
  readonly remoteDetailEndpoint?: string;
  readonly remoteInstallEndpoint?: string;
  readonly installPlanEndpointTemplate?: string;
  readonly installEndpointTemplate?: string;
  readonly upgradePlanEndpointTemplate?: string;
  readonly installedApplicationEndpointTemplate?: string;
}

export function findBlueprintCatalogExtension(
  extensions: readonly SystemPluginWebExtension[],
  placement: SystemPluginWebExtension["placement"] = "navigation",
): SystemPluginWebExtension | null {
  return (
    extensions.find(
      (extension) =>
        extension.placement === placement &&
        readBlueprintCatalogExtensionMetadata(extension) !== null,
    ) ?? null
  );
}

export function findBlueprintCatalogExtensionByKey(
  extensions: readonly SystemPluginWebExtension[],
  key: string | null | undefined,
): SystemPluginWebExtension | null {
  if (!key) {
    return null;
  }

  return (
    extensions.find(
      (extension) =>
        extension.key === key && readBlueprintCatalogExtensionMetadata(extension) !== null,
    ) ?? null
  );
}

export function readBlueprintCatalogExtensionMetadata(
  extension: SystemPluginWebExtension | null | undefined,
): BlueprintCatalogExtensionMetadata | null {
  const metadata = extension?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  if (metadata.renderer !== blueprintCatalogRenderer || typeof metadata.listEndpoint !== "string") {
    return null;
  }

  return {
    renderer: blueprintCatalogRenderer,
    listEndpoint: metadata.listEndpoint,
    ...(typeof metadata.detailEndpointTemplate === "string"
      ? { detailEndpointTemplate: metadata.detailEndpointTemplate }
      : {}),
    ...(typeof metadata.remoteDetailEndpoint === "string"
      ? { remoteDetailEndpoint: metadata.remoteDetailEndpoint }
      : {}),
    ...(typeof metadata.remoteInstallEndpoint === "string"
      ? { remoteInstallEndpoint: metadata.remoteInstallEndpoint }
      : {}),
    ...(typeof metadata.installPlanEndpointTemplate === "string"
      ? { installPlanEndpointTemplate: metadata.installPlanEndpointTemplate }
      : {}),
    ...(typeof metadata.installEndpointTemplate === "string"
      ? { installEndpointTemplate: metadata.installEndpointTemplate }
      : {}),
    ...(typeof metadata.upgradePlanEndpointTemplate === "string"
      ? { upgradePlanEndpointTemplate: metadata.upgradePlanEndpointTemplate }
      : {}),
    ...(typeof metadata.installedApplicationEndpointTemplate === "string"
      ? { installedApplicationEndpointTemplate: metadata.installedApplicationEndpointTemplate }
      : {}),
  };
}

export function endpointFromTemplate(template: string, slug: string): string {
  return template.replace(/\{slug\}/g, encodeURIComponent(slug));
}
