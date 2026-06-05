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

export function createBlueprintDeployHandoffUrl(
  input: BlueprintMarketplaceDeployHandoffInput,
): string {
  const deployBaseUrl = input.deployBaseUrl.trim();
  const isAbsolute = /^https?:\/\//.test(deployBaseUrl);
  const baseUrl = isAbsolute ? deployBaseUrl.replace(/\/+$/g, "") : "https://appaloft.local";
  const url = new URL("/deploy", baseUrl);

  url.searchParams.set("source", "blueprint");
  if (input.sourceExtension) {
    url.searchParams.set("sourceExtension", input.sourceExtension);
  }
  url.searchParams.set("blueprintSlug", input.slug);
  url.searchParams.set("blueprintTitle", input.title);
  url.searchParams.set("step", "project");
  url.searchParams.set("projectMode", "new");
  url.searchParams.set("projectName", input.projectName ?? input.title);

  return isAbsolute ? url.href : `${url.pathname}${url.search}`;
}

export function createBlueprintDetailHref(basePath: string, slug: string): string {
  const normalizedBasePath = basePath.trim().replace(/\/+$/g, "") || "/marketplace";
  return `${normalizedBasePath}/${encodeURIComponent(slug)}`;
}
