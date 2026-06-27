import { createBlueprintDeployHandoffUrl as createPublicBlueprintDeployHandoffUrl } from "@appaloft/blueprints/deploy-handoff";
import { type BlueprintMarketplaceDeployHandoffInput } from "./types";

export const defaultBlueprintMarketplaceListEndpoint = "/api/blueprints";

export function createBlueprintMarketplaceEndpoint(baseUrl: string, endpoint: string): string {
  const trimmedEndpoint = endpoint.trim();
  if (/^https?:\/\//.test(trimmedEndpoint)) {
    return trimmedEndpoint;
  }

  const normalizedPath = trimmedEndpoint.startsWith("/") ? trimmedEndpoint : `/${trimmedEndpoint}`;
  const trimmedBase = baseUrl.trim().replace(/\/+$/g, "");

  if (!trimmedBase) {
    return normalizedPath;
  }

  return `${trimmedBase}${normalizedPath}`;
}

export function createBlueprintMarketplaceLocalizedEndpoint(
  baseUrl: string,
  endpoint: string,
  locale: string,
): string {
  const marketplaceEndpoint = createBlueprintMarketplaceEndpoint(baseUrl, endpoint);
  const normalizedLocale = locale.trim();

  if (!normalizedLocale) {
    return marketplaceEndpoint;
  }

  const placeholderOrigin = "https://appaloft.local";
  const isAbsoluteEndpoint = /^https?:\/\//.test(marketplaceEndpoint);
  const parsedEndpoint = new URL(marketplaceEndpoint, placeholderOrigin);
  parsedEndpoint.searchParams.set("locale", normalizedLocale);

  if (isAbsoluteEndpoint) {
    return parsedEndpoint.toString();
  }

  return `${parsedEndpoint.pathname}${parsedEndpoint.search}${parsedEndpoint.hash}`;
}

export function createBlueprintDeployHandoffUrl(
  input: BlueprintMarketplaceDeployHandoffInput,
): string {
  return createPublicBlueprintDeployHandoffUrl({
    deployBaseUrl: input.deployBaseUrl,
    source: {
      kind: "catalog",
      slug: input.slug,
      title: input.title,
      ...(input.sourceExtension ? { sourceExtension: input.sourceExtension } : {}),
    },
    ...(input.projectName ? { projectName: input.projectName } : {}),
  });
}

export function createBlueprintDetailHref(basePath: string, slug: string): string {
  const normalizedBasePath = basePath.trim().replace(/\/+$/g, "") || "/marketplace";
  return `${normalizedBasePath}/${encodeURIComponent(slug)}`;
}
