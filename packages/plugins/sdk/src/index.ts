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

export const systemPluginWebExtensionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  path: z.string().min(1),
  placement: z.enum(["auth", "navigation", "settings"]),
  target: z.enum(["server-page", "external-page"]),
  requiresAuth: z.boolean(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;
export type PluginKind = z.infer<typeof pluginKindSchema>;
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

export type SystemPluginHttpRouteResult = Response | string | Record<string, unknown> | null;

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
  return semverSatisfies(appVersion, manifest.compatibilityRange, {
    includePrerelease: true,
  });
}
