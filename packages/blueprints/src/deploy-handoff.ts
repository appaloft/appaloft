export const defaultAppaloftDeployPath = "/" as const;
export const defaultDeployButtonBadgePath = "/badge/deploy.svg" as const;

export type BlueprintDeployHandoffSource =
  | {
      readonly kind: "catalog";
      readonly slug: string;
      readonly title?: string;
      readonly sourceExtension?: string;
    }
  | {
      readonly kind: "url";
      readonly url: string;
      readonly title?: string;
    };

export interface BlueprintDeployHandoffInput {
  readonly deployBaseUrl: string;
  readonly source: BlueprintDeployHandoffSource;
  readonly profile?: string;
  readonly variant?: string;
  readonly projectName?: string;
  readonly step?: "source" | "project" | "server" | "environment" | "variables" | "review";
}

export interface DeployButtonBadgeInput {
  readonly badgeBaseUrl: string;
}

export interface DeployButtonMarkdownInput extends BlueprintDeployHandoffInput {
  readonly badgeBaseUrl: string;
  readonly badgeLabel?: string;
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/g, "");
}

function absoluteOrLocalUrl(
  baseUrl: string,
  pathname: string,
): {
  readonly url: URL;
  readonly isAbsolute: boolean;
} {
  const normalizedBaseUrl = stripTrailingSlashes(trimmed(baseUrl));
  const isAbsolute = /^https?:\/\//.test(normalizedBaseUrl);
  const base = isAbsolute ? normalizedBaseUrl : "https://appaloft.local";
  const url = new URL(pathname, base);

  return { url, isAbsolute };
}

function appendRelativeOrAbsolute(url: URL, isAbsolute: boolean): string {
  return isAbsolute ? url.href : `${url.pathname}${url.search}${url.hash}`;
}

function safeBadgeLabel(label: string | undefined): string {
  return trimmed(label) || "Deploy on Appaloft";
}

export function createBlueprintDeployHandoffUrl(input: BlueprintDeployHandoffInput): string {
  const { url, isAbsolute } = absoluteOrLocalUrl(input.deployBaseUrl, defaultAppaloftDeployPath);
  const profile = trimmed(input.profile);
  const variant = trimmed(input.variant);
  const projectName = trimmed(input.projectName);
  const step = input.step ?? "project";

  url.searchParams.set("modal", "quick-deploy");
  url.searchParams.set("source", "blueprint");

  if (input.source.kind === "catalog") {
    const slug = trimmed(input.source.slug);
    const title = trimmed(input.source.title);
    const sourceExtension = trimmed(input.source.sourceExtension);

    if (sourceExtension) {
      url.searchParams.set("sourceExtension", sourceExtension);
    }
    url.searchParams.set("blueprintSlug", slug);
    if (title) {
      url.searchParams.set("blueprintTitle", title);
    }
    if (variant) {
      url.searchParams.set("blueprintVariant", variant);
    }
    if (profile) {
      url.searchParams.set("blueprintProfile", profile);
    }
    url.searchParams.set("step", step);
    url.searchParams.set("projectMode", "new");
    url.searchParams.set("projectName", projectName || title || slug);
  } else {
    const blueprintUrl = trimmed(input.source.url);
    const title = trimmed(input.source.title);

    url.searchParams.set("blueprintUrl", blueprintUrl);
    if (title) {
      url.searchParams.set("blueprintTitle", title);
    }
    if (variant) {
      url.searchParams.set("blueprintVariant", variant);
    }
    if (profile) {
      url.searchParams.set("blueprintProfile", profile);
    }
    url.searchParams.set("step", step);
    url.searchParams.set("projectMode", "new");
    if (projectName || title) {
      url.searchParams.set("projectName", projectName || title);
    }
  }

  return appendRelativeOrAbsolute(url, isAbsolute);
}

export function createDeployButtonBadgeUrl(input: DeployButtonBadgeInput): string {
  const { url, isAbsolute } = absoluteOrLocalUrl(input.badgeBaseUrl, defaultDeployButtonBadgePath);

  return appendRelativeOrAbsolute(url, isAbsolute);
}

export function createDeployButtonMarkdown(input: DeployButtonMarkdownInput): string {
  const badgeUrl = createDeployButtonBadgeUrl({
    badgeBaseUrl: input.badgeBaseUrl,
  });
  const handoffUrl = createBlueprintDeployHandoffUrl(input);

  return `[![${safeBadgeLabel(input.badgeLabel)}](${badgeUrl})](${handoffUrl})`;
}
