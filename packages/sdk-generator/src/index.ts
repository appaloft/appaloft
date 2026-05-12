export type SdkOperationKind = "command" | "query";
export type SdkAuthPolicy = "bootstrap-public" | "product-session" | "webhook-signature";

export interface OpenApiReferenceObject {
  readonly $ref: string;
}

export interface OpenApiOperationObject {
  readonly operationId?: string;
}

export interface OpenApiPathItemObject {
  readonly get?: OpenApiOperationObject;
  readonly put?: OpenApiOperationObject;
  readonly post?: OpenApiOperationObject;
  readonly delete?: OpenApiOperationObject;
  readonly options?: OpenApiOperationObject;
  readonly head?: OpenApiOperationObject;
  readonly patch?: OpenApiOperationObject;
  readonly trace?: OpenApiOperationObject;
}

export interface OpenApiDocument {
  readonly paths?: Readonly<
    Record<string, OpenApiPathItemObject | OpenApiReferenceObject | undefined>
  >;
}

export interface SdkOperationRoute {
  readonly method: string;
  readonly path: string;
}

export interface SdkOperationDescriptor {
  readonly operationKey: string;
  readonly operationGroup: string;
  readonly operationMethod: string;
  readonly operationId: string;
  readonly kind: SdkOperationKind;
  readonly domain: string;
  readonly messageName: string;
  readonly route: SdkOperationRoute;
  readonly docsHref?: string;
  readonly authPolicy: SdkAuthPolicy;
  readonly errorFamily: string;
  readonly streaming: boolean;
}

export interface TypescriptSdkFacadeRenderOptions {
  readonly exportName?: string;
  readonly importPath?: string;
}

type OpenApiOperationWithAppaloftExtensions = OpenApiOperationObject & {
  readonly "x-appaloft-operation-key"?: unknown;
  readonly "x-appaloft-operation-kind"?: unknown;
  readonly "x-appaloft-operation-domain"?: unknown;
  readonly "x-appaloft-message-name"?: unknown;
  readonly "x-appaloft-docs-href"?: unknown;
  readonly "x-appaloft-auth-policy"?: unknown;
  readonly "x-appaloft-error-family"?: unknown;
  readonly "x-appaloft-streaming"?: unknown;
};

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

export function operationGroupFromKey(operationKey: string): string {
  return operationKey.split(".")[0] ?? operationKey;
}

export function operationMethodFromKey(operationKey: string): string {
  const [, ...parts] = operationKey.split(".");
  const methodParts = parts.length > 0 ? parts : [operationKey];

  return methodParts
    .map((part, index) => {
      const identifier = operationKeyPartToIdentifier(part);

      return index === 0 ? identifier : capitalize(identifier);
    })
    .join("");
}

export function collectSdkOperationsFromOpenApi(
  document: OpenApiDocument,
): SdkOperationDescriptor[] {
  const operations: SdkOperationDescriptor[] = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || isReferenceObject(pathItem)) {
      continue;
    }

    for (const method of openApiHttpMethods) {
      const operation = pathItem[method] as OpenApiOperationWithAppaloftExtensions | undefined;

      if (!operation) {
        continue;
      }

      const descriptor = descriptorFromOpenApiOperation(method, path, operation);

      if (descriptor) {
        operations.push(descriptor);
      }
    }
  }

  return operations.sort(compareSdkOperations);
}

export function renderTypescriptSdkFacade(
  document: OpenApiDocument,
  options: TypescriptSdkFacadeRenderOptions = {},
): string {
  const exportName = options.exportName ?? "generatedSdkOperations";
  const importPath = options.importPath ?? "@appaloft/sdk";
  const operations = collectSdkOperationsFromOpenApi(document);

  return [
    `import { type SdkOperationDescriptor } from "${importPath}";`,
    "",
    `export const ${exportName} = ${JSON.stringify(operations, null, 2)} as const satisfies readonly SdkOperationDescriptor[];`,
    "",
  ].join("\n");
}

function descriptorFromOpenApiOperation(
  method: string,
  path: string,
  operation: OpenApiOperationWithAppaloftExtensions,
): SdkOperationDescriptor | null {
  const operationKey = readRequiredStringExtension(operation, "x-appaloft-operation-key");

  if (!operationKey) {
    return null;
  }

  const kind = readRequiredKind(operation);
  const domain = readRequiredStringExtension(operation, "x-appaloft-operation-domain");
  const messageName = readRequiredStringExtension(operation, "x-appaloft-message-name");
  const authPolicy = readRequiredAuthPolicy(operation);
  const errorFamily = readRequiredStringExtension(operation, "x-appaloft-error-family");
  const streaming = readRequiredBooleanExtension(operation, "x-appaloft-streaming");
  const docsHref = readOptionalStringExtension(operation, "x-appaloft-docs-href");

  if (!kind || !domain || !messageName || !authPolicy || !errorFamily || streaming === null) {
    throw new Error(
      `OpenAPI operation ${method.toUpperCase()} ${path} is missing Appaloft metadata`,
    );
  }

  return {
    operationKey,
    operationGroup: operationGroupFromKey(operationKey),
    operationMethod: operationMethodFromKey(operationKey),
    operationId: operation.operationId ?? operationKey,
    kind,
    domain,
    messageName,
    route: {
      method: method.toUpperCase(),
      path,
    },
    ...(docsHref ? { docsHref } : {}),
    authPolicy,
    errorFamily,
    streaming,
  };
}

function operationKeyPartToIdentifier(part: string): string {
  const normalized = part
    .split("-")
    .filter((value) => value.length > 0)
    .map((value, index) => (index === 0 ? value : capitalize(value)))
    .join("");

  return normalized.replaceAll(/[^a-zA-Z0-9_$]/g, "");
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function compareSdkOperations(a: SdkOperationDescriptor, b: SdkOperationDescriptor): number {
  const keyComparison = a.operationKey.localeCompare(b.operationKey);

  if (keyComparison !== 0) {
    return keyComparison;
  }

  const pathComparison = a.route.path.localeCompare(b.route.path);

  if (pathComparison !== 0) {
    return pathComparison;
  }

  return a.route.method.localeCompare(b.route.method);
}

function readRequiredStringExtension(
  operation: OpenApiOperationWithAppaloftExtensions,
  key: keyof OpenApiOperationWithAppaloftExtensions,
): string | null {
  const value = operation[key];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function readOptionalStringExtension(
  operation: OpenApiOperationWithAppaloftExtensions,
  key: keyof OpenApiOperationWithAppaloftExtensions,
): string | undefined {
  const value = operation[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readRequiredBooleanExtension(
  operation: OpenApiOperationWithAppaloftExtensions,
  key: keyof OpenApiOperationWithAppaloftExtensions,
): boolean | null {
  const value = operation[key];

  return typeof value === "boolean" ? value : null;
}

function readRequiredKind(
  operation: OpenApiOperationWithAppaloftExtensions,
): SdkOperationKind | null {
  const value = operation["x-appaloft-operation-kind"];

  return value === "command" || value === "query" ? value : null;
}

function readRequiredAuthPolicy(
  operation: OpenApiOperationWithAppaloftExtensions,
): SdkAuthPolicy | null {
  const value = operation["x-appaloft-auth-policy"];

  if (
    value === "bootstrap-public" ||
    value === "product-session" ||
    value === "webhook-signature"
  ) {
    return value;
  }

  return null;
}

function isReferenceObject(value: unknown): value is OpenApiReferenceObject {
  return typeof value === "object" && value !== null && "$ref" in value;
}
