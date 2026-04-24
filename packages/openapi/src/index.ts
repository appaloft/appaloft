import { readFileSync } from "node:fs";
import { type AppaloftOrpcRouter } from "@appaloft/orpc";
import { type SystemPluginDefinition, type SystemPluginHttpRoute } from "@appaloft/plugin-sdk";
import {
  type ConditionalSchemaConverter,
  type JSONSchema,
  type OpenAPI,
  OpenAPIGenerator,
  type OpenAPIGeneratorGenerateOptions,
  type SchemaConvertOptions,
} from "@orpc/openapi";
import { z } from "zod";

export const defaultAppaloftOpenApiSpecPath = "/api/openapi.json";
export const defaultAppaloftOpenApiReferencePath = "/api/reference";
export const defaultAppaloftOpenApiServerUrl = "/api";
export const defaultAppaloftOpenApiTitle = "Appaloft HTTP API";

const appaloftOpenApiTagNames = {
  projects: "Projects",
  serversAndCredentials: "Servers And Credentials",
  environmentsAndConfiguration: "Environments And Configuration",
  resources: "Resources",
  deployments: "Deployments",
  accessAndDomains: "Access And Domains",
  certificates: "Certificates",
  observability: "Observability",
  providers: "Providers",
  plugins: "Plugins",
  integrations: "Integrations",
} as const;

type AppaloftOpenApiTagName =
  (typeof appaloftOpenApiTagNames)[keyof typeof appaloftOpenApiTagNames];

export const appaloftOpenApiTags = [
  {
    name: appaloftOpenApiTagNames.projects,
    description: "Project lifecycle and project-scoped operations.",
  },
  {
    name: appaloftOpenApiTagNames.serversAndCredentials,
    description:
      "Deployment servers, SSH credentials, connectivity, proxy readiness, and terminal sessions.",
  },
  {
    name: appaloftOpenApiTagNames.environmentsAndConfiguration,
    description: "Environments, variables, effective configuration, diff, and promotion.",
  },
  {
    name: appaloftOpenApiTagNames.resources,
    description: "Resources and their source, runtime, health, and network profiles.",
  },
  {
    name: appaloftOpenApiTagNames.deployments,
    description: "Deployment admission, detail, and deployment creation streams.",
  },
  {
    name: appaloftOpenApiTagNames.accessAndDomains,
    description: "Generated access routes, proxy configuration, and custom domain bindings.",
  },
  {
    name: appaloftOpenApiTagNames.certificates,
    description: "Certificate import, issuance, renewal, and readiness.",
  },
  {
    name: appaloftOpenApiTagNames.observability,
    description: "Logs, events, health summaries, and support-safe diagnostics.",
  },
  {
    name: appaloftOpenApiTagNames.providers,
    description: "Provider discovery and capabilities.",
  },
  {
    name: appaloftOpenApiTagNames.plugins,
    description: "Plugin discovery and compatibility.",
  },
  {
    name: appaloftOpenApiTagNames.integrations,
    description: "External integration surfaces such as GitHub repositories.",
  },
] as const satisfies readonly OpenAPI.TagObject[];

export interface AppaloftOpenApiSpecOptions {
  readonly info?: OpenAPI.InfoObject;
  readonly servers?: OpenAPI.ServerObject[];
  readonly serverUrl?: string;
  readonly router?: AppaloftOrpcRouter;
  readonly generateOptions?: Omit<OpenAPIGeneratorGenerateOptions, "info" | "servers">;
  readonly appVersion?: string;
  readonly groupOperationsByDomain?: boolean;
  readonly promoteSchemaExamples?: boolean;
}

export interface AppaloftOpenApiReferenceOptions extends AppaloftOpenApiSpecOptions {
  readonly specPath?: string;
  readonly referencePath?: string;
  readonly docsTitle?: string;
  readonly scalarScriptUrl?: string;
  readonly scalarConfig?: Record<string, unknown>;
}

export interface AppaloftOpenApiReferencePluginOptions extends AppaloftOpenApiReferenceOptions {
  readonly pluginVersion?: string;
  readonly compatibilityRange?: string;
}

class ZodJsonSchemaConverter implements ConditionalSchemaConverter {
  async condition(schema: unknown): Promise<boolean> {
    return schema instanceof z.ZodType;
  }

  async convert(
    schema: unknown,
    options: SchemaConvertOptions,
  ): Promise<[required: boolean, jsonSchema: JSONSchema]> {
    if (!(schema instanceof z.ZodType)) {
      return [false, {}];
    }

    const jsonSchema = stripJsonSchemaDialect(
      z.toJSONSchema(schema, {
        io: options.strategy,
      }),
    );

    return [!schema.safeParse(undefined).success, jsonSchema];
  }
}

const zodJsonSchemaConverter = new ZodJsonSchemaConverter();

export async function createAppaloftOpenApiSpec(
  options: AppaloftOpenApiSpecOptions = {},
): Promise<OpenAPI.Document> {
  const router = options.router ?? (await loadDefaultAppaloftOrpcRouter());
  const generator = new OpenAPIGenerator({
    schemaConverters: [zodJsonSchemaConverter],
  });

  const document = await generator.generate(router, {
    ...(options.generateOptions ?? {}),
    info: options.info ?? {
      title: defaultAppaloftOpenApiTitle,
      version: options.appVersion ?? resolveDefaultAppaloftVersion(),
    },
    servers: options.servers ?? [
      {
        url: options.serverUrl ?? defaultAppaloftOpenApiServerUrl,
      },
    ],
  });

  if (options.groupOperationsByDomain !== false) {
    applyAppaloftOpenApiDomainTags(document);
  }

  if (options.promoteSchemaExamples !== false) {
    promoteSchemaExamplesToMediaTypes(document);
  }

  return document;
}

export async function createAppaloftOpenApiSpecResponse(
  options: AppaloftOpenApiSpecOptions = {},
): Promise<Response> {
  const spec = await createAppaloftOpenApiSpec(options);

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function createAppaloftScalarReferenceHtml(
  options: AppaloftOpenApiReferenceOptions = {},
): string {
  const title = options.docsTitle ?? "Appaloft API Reference";
  const specPath = options.specPath ?? defaultAppaloftOpenApiSpecPath;
  const scriptUrl = options.scalarScriptUrl ?? "https://cdn.jsdelivr.net/npm/@scalar/api-reference";
  const scalarConfig = {
    url: specPath,
    ...(options.scalarConfig ?? {}),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script src="${escapeHtmlAttribute(scriptUrl)}"></script>
    <script>
      Scalar.createApiReference("#app", ${jsonForScript(scalarConfig)})
    </script>
  </body>
</html>`;
}

export function createAppaloftScalarReferenceResponse(
  options: AppaloftOpenApiReferenceOptions = {},
): Response {
  return new Response(createAppaloftScalarReferenceHtml(options), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function maybeHandleAppaloftOpenApiReferenceRequest(
  request: Request,
  options: AppaloftOpenApiReferenceOptions = {},
): Promise<Response | null> {
  if (request.method !== "GET") {
    return null;
  }

  const pathname = new URL(request.url).pathname;
  const specPath = options.specPath ?? defaultAppaloftOpenApiSpecPath;
  const referencePath = options.referencePath ?? defaultAppaloftOpenApiReferencePath;

  if (pathname === specPath) {
    return createAppaloftOpenApiSpecResponse(options);
  }

  if (pathname === referencePath || pathname === `${referencePath}/`) {
    return createAppaloftScalarReferenceResponse(options);
  }

  return null;
}

export function createAppaloftOpenApiReferenceRoutes(
  options: AppaloftOpenApiReferenceOptions = {},
): SystemPluginHttpRoute[] {
  const specPath = options.specPath ?? defaultAppaloftOpenApiSpecPath;
  const referencePath = options.referencePath ?? defaultAppaloftOpenApiReferencePath;

  return [
    {
      method: "GET",
      path: specPath,
      handle: () => createAppaloftOpenApiSpecResponse(options),
    },
    {
      method: "GET",
      path: referencePath,
      handle: () => createAppaloftScalarReferenceResponse(options),
    },
  ];
}

export function createAppaloftOpenApiReferencePlugin(
  options: AppaloftOpenApiReferencePluginOptions = {},
): SystemPluginDefinition {
  const referencePath = options.referencePath ?? defaultAppaloftOpenApiReferencePath;

  return {
    manifest: {
      name: "builtin-openapi-reference",
      displayName: "OpenAPI Reference",
      description: "Scalar API reference and OpenAPI document for the Appaloft HTTP API.",
      version: options.pluginVersion ?? "0.1.0",
      kind: "system-extension",
      compatibilityRange: options.compatibilityRange ?? ">=0.0.0",
      capabilities: ["http-route", "web-page"],
      entrypoint: "internal://appaloft-openapi-reference",
    },
    webExtensions: [
      {
        key: "openapi-reference",
        title: "API reference",
        description: "Interactive OpenAPI documentation for Appaloft HTTP endpoints.",
        path: referencePath,
        placement: "navigation",
        target: "external-page",
        requiresAuth: false,
      },
    ],
    http: {
      routes: createAppaloftOpenApiReferenceRoutes(options),
    },
  };
}

async function loadDefaultAppaloftOrpcRouter(): Promise<AppaloftOrpcRouter> {
  await import("reflect-metadata");
  const module = await import("@appaloft/orpc");
  return module.appaloftOrpcRouter;
}

function resolveDefaultAppaloftVersion(): string {
  if (process.env.APPALOFT_APP_VERSION) {
    return process.env.APPALOFT_APP_VERSION;
  }

  try {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };

    return typeof packageJson.version === "string" && packageJson.version.length > 0
      ? packageJson.version
      : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

const openApiHttpMethods = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
] as const;

function applyAppaloftOpenApiDomainTags(document: OpenAPI.Document): OpenAPI.Document {
  document.tags = mergeOpenApiTags(document.tags, appaloftOpenApiTags);

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || isReferenceObject(pathItem)) {
      continue;
    }

    const tag = resolveAppaloftOpenApiDomainTag(path);

    if (!tag) {
      continue;
    }

    for (const method of openApiHttpMethods) {
      const operation = pathItem[method];

      if (operation && (!operation.tags || operation.tags.length === 0)) {
        operation.tags = [tag];
      }
    }
  }

  return document;
}

function mergeOpenApiTags(
  existing: OpenAPI.TagObject[] | undefined,
  additions: readonly OpenAPI.TagObject[],
): OpenAPI.TagObject[] {
  const tags = [...(existing ?? [])];
  const existingNames = new Set(tags.map((tag) => tag.name));

  for (const tag of additions) {
    if (!existingNames.has(tag.name)) {
      tags.push(tag);
      existingNames.add(tag.name);
    }
  }

  return tags;
}

function resolveAppaloftOpenApiDomainTag(path: string): AppaloftOpenApiTagName | undefined {
  if (path.startsWith("/projects")) {
    return appaloftOpenApiTagNames.projects;
  }

  if (
    path.startsWith("/servers") ||
    path.startsWith("/credentials/ssh") ||
    path.startsWith("/terminal-sessions")
  ) {
    return appaloftOpenApiTagNames.serversAndCredentials;
  }

  if (path.startsWith("/environments") || isResourceConfigurationPath(path)) {
    return appaloftOpenApiTagNames.environmentsAndConfiguration;
  }

  if (
    path.startsWith("/default-access-domain-policies") ||
    path.startsWith("/domain-bindings") ||
    path.endsWith("/proxy-configuration")
  ) {
    return appaloftOpenApiTagNames.accessAndDomains;
  }

  if (path.startsWith("/certificates")) {
    return appaloftOpenApiTagNames.certificates;
  }

  if (isDeploymentObservabilityPath(path) || isResourceObservabilityPath(path)) {
    return appaloftOpenApiTagNames.observability;
  }

  if (path.startsWith("/resources")) {
    return appaloftOpenApiTagNames.resources;
  }

  if (path.startsWith("/deployments")) {
    return appaloftOpenApiTagNames.deployments;
  }

  if (path.startsWith("/providers")) {
    return appaloftOpenApiTagNames.providers;
  }

  if (path.startsWith("/plugins")) {
    return appaloftOpenApiTagNames.plugins;
  }

  if (path.startsWith("/integrations")) {
    return appaloftOpenApiTagNames.integrations;
  }

  return undefined;
}

function isResourceConfigurationPath(path: string): boolean {
  return path.includes("/variables") || path.endsWith("/effective-config");
}

function isDeploymentObservabilityPath(path: string): boolean {
  return path.endsWith("/logs") || path.endsWith("/events") || path.endsWith("/events/stream");
}

function isResourceObservabilityPath(path: string): boolean {
  return (
    path.endsWith("/runtime-logs") ||
    path.endsWith("/runtime-logs/stream") ||
    path.endsWith("/diagnostic-summary") ||
    path.endsWith("/health")
  );
}

function promoteSchemaExamplesToMediaTypes(document: OpenAPI.Document): OpenAPI.Document {
  for (const pathItem of Object.values(document.paths ?? {})) {
    if (!pathItem || isReferenceObject(pathItem)) {
      continue;
    }

    for (const method of openApiHttpMethods) {
      const operation = pathItem[method];

      if (operation) {
        promoteOperationSchemaExamples(operation);
      }
    }
  }

  return document;
}

function promoteOperationSchemaExamples(operation: OpenAPI.OperationObject): void {
  const requestBody = operation.requestBody;

  if (requestBody && !isReferenceObject(requestBody)) {
    promoteContentSchemaExamples(requestBody.content);
  }

  for (const response of Object.values(operation.responses ?? {})) {
    if (!response || isReferenceObject(response)) {
      continue;
    }

    promoteContentSchemaExamples(response.content);
  }
}

function promoteContentSchemaExamples(
  content: Record<string, OpenAPI.MediaTypeObject> | undefined,
): void {
  if (!content) {
    return;
  }

  for (const mediaType of Object.values(content)) {
    if (mediaType.example !== undefined || mediaType.examples) {
      continue;
    }

    const examples = extractSchemaExamples(mediaType.schema);

    if (examples.length === 0) {
      continue;
    }

    mediaType.examples = Object.fromEntries(
      examples.map((value, index) => [
        index === 0 ? "default" : `example${index + 1}`,
        { value } satisfies OpenAPI.ExampleObject,
      ]),
    );
  }
}

function extractSchemaExamples(
  schema: OpenAPI.SchemaObject | OpenAPI.ReferenceObject | undefined,
): unknown[] {
  if (!schema || isReferenceObject(schema) || !Array.isArray(schema.examples)) {
    return [];
  }

  return schema.examples;
}

function isReferenceObject(value: unknown): value is OpenAPI.ReferenceObject {
  return typeof value === "object" && value !== null && "$ref" in value;
}

function stripJsonSchemaDialect(schema: unknown): JSONSchema {
  if (Array.isArray(schema)) {
    return schema.map((item) => stripJsonSchemaDialect(item)) as unknown as JSONSchema;
  }

  if (!schema || typeof schema !== "object") {
    return schema as JSONSchema;
  }

  const entries = Object.entries(schema)
    .filter(([key]) => key !== "$schema")
    .map(([key, value]) => [key, stripJsonSchemaDialect(value)] as const);

  return Object.fromEntries(entries) as JSONSchema;
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
