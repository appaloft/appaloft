import { type SystemPluginWebExtension } from "@appaloft/contracts";

export const blueprintCatalogRenderer = "blueprint-catalog" as const;

export interface BlueprintCatalogExtensionMetadata {
  readonly renderer: typeof blueprintCatalogRenderer;
  readonly listEndpoint: string;
  readonly detailEndpointTemplate?: string;
  readonly installPlanEndpointTemplate?: string;
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
    ...(typeof metadata.installPlanEndpointTemplate === "string"
      ? { installPlanEndpointTemplate: metadata.installPlanEndpointTemplate }
      : {}),
  };
}

export function endpointFromTemplate(template: string, slug: string): string {
  return template.replace(/\{slug\}/g, encodeURIComponent(slug));
}
