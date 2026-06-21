import { satisfies as semverSatisfies } from "semver";
import { z } from "zod";

export const pluginKindSchema = z.enum(["user-extension", "system-extension"]);

export const pluginCapabilitySchema = z.enum([
  "deployment-hook",
  "source-detector",
  "build-strategy",
  "provider-extension",
  "integration-extension",
  "ai-tool",
  "http-route",
  "http-middleware",
  "web-page",
  "tenant-isolation",
]);

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  version: z.string().min(1),
  kind: pluginKindSchema,
  compatibilityRange: z.string().min(1),
  capabilities: z.array(pluginCapabilitySchema),
  entrypoint: z.string().min(1),
});

export const systemPluginWebExtensionIconNameSchema = z.enum([
  "activity",
  "archive",
  "building",
  "clipboard-list",
  "database",
  "file-text",
  "git-pull-request",
  "globe",
  "key",
  "package",
  "plug",
  "puzzle",
  "server",
  "shield",
  "terminal",
  "wallet",
]);

export const systemPluginWebExtensionCustomIconSchema = z.object({
  src: z.string().min(1),
  label: z.string().min(1).optional(),
});

export const systemPluginWebExtensionIconSchema = z.union([
  systemPluginWebExtensionIconNameSchema,
  systemPluginWebExtensionCustomIconSchema,
]);

export const systemPluginWebExtensionLocalizationSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export const systemPluginWebExtensionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  localizations: z
    .partialRecord(z.enum(["zh-CN", "en-US"]), systemPluginWebExtensionLocalizationSchema)
    .optional(),
  description: z.string().min(1).optional(),
  icon: systemPluginWebExtensionIconSchema.optional(),
  path: z.string().min(1),
  placement: z.enum([
    "auth",
    "navigation",
    "settings",
    "quick-deploy-source",
    "project-environment-panel",
    "resource-detail-panel",
  ]),
  target: z.enum(["server-page", "external-page", "console-route"]),
  requiresAuth: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;
export type PluginKind = z.infer<typeof pluginKindSchema>;
export type SystemPluginWebExtensionIcon = z.infer<typeof systemPluginWebExtensionIconSchema>;
export type SystemPluginWebExtensionLocalization = z.infer<
  typeof systemPluginWebExtensionLocalizationSchema
>;
export type SystemPluginWebExtension = z.infer<typeof systemPluginWebExtensionSchema>;

export type SystemPluginRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SystemPluginHttpContext {
  request: Request;
  path: string;
  method: string;
}

export interface SystemPluginHttpRouteContext extends SystemPluginHttpContext {
  params: Record<string, string>;
  query: URLSearchParams;
  readJson(): Promise<unknown>;
}

export interface SystemPluginHttpMiddlewareResult {
  response?: Response;
  headers?: Record<string, string>;
}

export interface SystemPluginHttpMiddleware {
  name: string;
  handle(
    context: SystemPluginHttpContext,
  ):
    | SystemPluginHttpMiddlewareResult
    | undefined
    | Promise<SystemPluginHttpMiddlewareResult | undefined>;
}

export interface SystemPluginHtmlRouteResult {
  kind: "html";
  body: string;
  status?: number;
  headers?: Record<string, string>;
}

export interface SystemPluginHtmlRouteResultOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function systemPluginHtml(
  body: string,
  options: SystemPluginHtmlRouteResultOptions = {},
): SystemPluginHtmlRouteResult {
  return {
    body,
    ...(options.headers ? { headers: options.headers } : {}),
    kind: "html",
    ...(options.status !== undefined ? { status: options.status } : {}),
  };
}

export function isSystemPluginHtmlRouteResult(
  value: unknown,
): value is SystemPluginHtmlRouteResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.kind === "html" && typeof record.body === "string";
}

export type SystemPluginHttpRouteResult =
  | Response
  | string
  | SystemPluginHtmlRouteResult
  | Record<string, unknown>
  | null;

export interface SystemPluginHttpRoute {
  method: SystemPluginRouteMethod;
  path: string;
  handle(
    context: SystemPluginHttpRouteContext,
  ): SystemPluginHttpRouteResult | Promise<SystemPluginHttpRouteResult>;
}

export interface SystemPluginDefinition {
  manifest: PluginManifest;
  webExtensions?: SystemPluginWebExtension[];
  http?: {
    middlewares?: SystemPluginHttpMiddleware[];
    routes?: SystemPluginHttpRoute[];
  };
}

export function isPluginCompatible(manifest: PluginManifest, appVersion: string): boolean {
  if (manifest.compatibilityRange.trim() === "*") {
    return true;
  }

  return semverSatisfies(appVersion, manifest.compatibilityRange, {
    includePrerelease: true,
  });
}
