import { type GeneratedAppaloftClient, generatedSdkOperations } from "./generated-operations";

export const apiVersion = "v1";

export { generatedSdkOperations } from "./generated-operations";

export type DomainErrorDetailValue = string | number | boolean | null | readonly string[];

export interface DomainErrorResponse {
  readonly code: string;
  readonly category: "user" | "infra" | "provider" | "retryable" | "timeout";
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, DomainErrorDetailValue>>;
}

export type SdkOperationKind = "command" | "query";
export type SdkAuthPolicy = "bootstrap-public" | "product-session" | "webhook-signature";

export interface SdkOperationRoute {
  readonly method: string;
  readonly path: string;
}

export interface SdkOperationDescriptor {
  readonly operationKey: string;
  readonly operationGroup: string;
  readonly operationMethod: string;
  readonly facadePath?: readonly string[];
  readonly facadeDefault?: boolean;
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

export type AppaloftSdkAuth =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "product-session";
      readonly cookie: string;
    }
  | {
      readonly kind: "deploy-token";
      readonly token: string;
    };

export type AppaloftSdkFetch = (request: Request) => Promise<Response>;

export interface AppaloftJsonApiResponseContext {
  readonly method: string;
  readonly url: string;
}

export type AppaloftJsonApiReadResult =
  | {
      readonly ok: true;
      readonly data: unknown;
    }
  | {
      readonly ok: false;
      readonly error: DomainErrorResponse;
    };

export interface AppaloftSdkClientOptions {
  readonly baseUrl: string;
  readonly auth?: AppaloftSdkAuth | (() => AppaloftSdkAuth | undefined);
  readonly fetch?: AppaloftSdkFetch;
  readonly headers?: HeadersInit | (() => HeadersInit);
  readonly userAgent?: string;
}

export interface AppaloftSdkOperationRequest {
  readonly operation: SdkOperationDescriptor;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

export interface AppaloftSdkFacadeInput {
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly parseEnvelope?: (value: unknown) => unknown;
  readonly [key: string]: unknown;
}

export interface AppaloftSdkStreamRequest<TEnvelope = unknown> extends AppaloftSdkOperationRequest {
  readonly parseEnvelope?: (value: unknown) => TEnvelope;
}

export type AppaloftSdkOperationResult<T> =
  | {
      readonly ok: true;
      readonly status: number;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly status: number;
      readonly error: DomainErrorResponse;
    };

export interface AppaloftSdkClient {
  readonly apiVersion: typeof apiVersion;
  readonly request: <T = unknown>(
    input: AppaloftSdkOperationRequest,
  ) => Promise<AppaloftSdkOperationResult<T>>;
  readonly stream: <TEnvelope = unknown>(
    input: AppaloftSdkStreamRequest<TEnvelope>,
  ) => AsyncIterable<TEnvelope>;
}

export type AppaloftSdkFacadeResult<T> = Promise<AppaloftSdkOperationResult<T>> & AsyncIterable<T>;

export type AppaloftSdkFacadeMethod = <T = unknown>(
  input?: AppaloftSdkFacadeInput,
) => AppaloftSdkFacadeResult<T>;

export type AppaloftSdkFacadeGroup = {
  readonly [key: string]: unknown;
};

export type AppaloftClient = GeneratedAppaloftClient;

type InternalAppaloftClient = AppaloftSdkClient & AppaloftSdkFacadeGroup;
const sdkOperationDescriptors: readonly SdkOperationDescriptor[] = generatedSdkOperations;

export class AppaloftSdkStreamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly error: DomainErrorResponse,
  ) {
    super(message);
    this.name = "AppaloftSdkStreamError";
  }
}

export function createAppaloftClient(options: AppaloftSdkClientOptions): GeneratedAppaloftClient {
  return createAppaloftFacadeClient(
    createAppaloftSdkClient(options),
    sdkOperationDescriptors,
  ) as unknown as GeneratedAppaloftClient;
}

export function requestAppaloftFacadeOperation<T = unknown>(
  client: GeneratedAppaloftClient,
  operationKey: string,
  input?: AppaloftSdkFacadeInput,
): Promise<AppaloftSdkOperationResult<T>> | AsyncIterable<T> {
  const operation = sdkOperationDescriptors.find(
    (entry) => entry.operationKey === operationKey && entry.facadeDefault !== false,
  );

  if (!operation) {
    throw new Error(`SDK facade operation ${operationKey} is not available`);
  }

  const method = facadeMethodForPath(
    client,
    operation.facadePath ?? operationKeyToFacadePath(operationKey),
  );

  return method<T>(input);
}

export function createAppaloftSdkClient(options: AppaloftSdkClientOptions): AppaloftSdkClient {
  const fetchImplementation = options.fetch ?? ((request: Request) => fetch(request));

  return {
    apiVersion,
    request: async <T = unknown>(
      input: AppaloftSdkOperationRequest,
    ): Promise<AppaloftSdkOperationResult<T>> => {
      const url = buildOperationUrl(options.baseUrl, input);
      const request = buildRequest(url, input, {
        auth: resolveAuth(options.auth),
        configuredHeaders: options.headers,
        userAgent: options.userAgent,
      });
      const response = await fetchImplementation(request);
      const data = await readAppaloftJsonApiResponse(response, {
        method: request.method,
        url: request.url,
      });

      if (!data.ok) {
        return {
          ok: false,
          status: response.status,
          error: data.error,
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: parseDomainError(data.data),
        };
      }

      return {
        ok: true,
        status: response.status,
        data: data.data as T,
      };
    },
    stream: <TEnvelope = unknown>(
      input: AppaloftSdkStreamRequest<TEnvelope>,
    ): AsyncIterable<TEnvelope> => {
      if (!input.operation.streaming) {
        throw new Error(`Operation ${input.operation.operationKey} is not marked as streaming`);
      }

      return streamOperation(fetchImplementation, options, input);
    },
  };
}

export function createAppaloftFacadeClient(
  client: AppaloftSdkClient,
  operations: readonly SdkOperationDescriptor[] = sdkOperationDescriptors,
): InternalAppaloftClient {
  const facade = client as InternalAppaloftClient;
  const seenFacadeKeys = new Set<string>();

  for (const operation of operations) {
    if (operation.facadeDefault === false) {
      continue;
    }

    const facadePath = operation.facadePath ?? operationKeyToFacadePath(operation.operationKey);
    const facadeKey = facadePath.join(".");

    if (facadePath.length === 0 || seenFacadeKeys.has(facadeKey)) {
      continue;
    }

    seenFacadeKeys.add(facadeKey);
    attachFacadeOperation(facade, facadePath, operation, client);
  }

  return facade;
}

function attachFacadeOperation(
  root: Record<string, unknown>,
  facadePath: readonly string[],
  operation: SdkOperationDescriptor,
  client: AppaloftSdkClient,
): void {
  let target = root;

  for (const segment of facadePath.slice(0, -1)) {
    const existing = target[segment];

    if (existing === undefined) {
      const group: AppaloftSdkFacadeGroup = {};
      target[segment] = group;
      target = group;
      continue;
    }

    if (!isFacadeContainer(existing)) {
      throw new Error(`SDK facade path conflict at ${facadePath.join(".")}`);
    }

    target = existing as Record<string, unknown>;
  }

  const leaf = lastFacadeSegment(facadePath);
  const method = ((input?: AppaloftSdkFacadeInput) => {
    const request = buildFacadeRequest(operation, input);

    if (operation.streaming) {
      const parseEnvelope = input?.parseEnvelope as ((value: unknown) => unknown) | undefined;
      return client.stream({
        ...request,
        ...(parseEnvelope ? { parseEnvelope } : {}),
      });
    }

    return client.request(request);
  }) as AppaloftSdkFacadeMethod;

  const existing = target[leaf];

  if (isPlainFacadeGroup(existing)) {
    Object.assign(method, existing);
  }

  target[leaf] = method;
}

function facadeMethodForPath(
  root: unknown,
  facadePath: readonly string[],
): AppaloftSdkFacadeMethod {
  let current = root;

  for (const segment of facadePath) {
    if (!isFacadeContainer(current)) {
      throw new Error(`SDK facade path ${facadePath.join(".")} is not available`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "function") {
    throw new Error(`SDK facade path ${facadePath.join(".")} is not callable`);
  }

  return current as AppaloftSdkFacadeMethod;
}

function isFacadeContainer(
  value: unknown,
): value is Record<string, unknown> | AppaloftSdkFacadeMethod {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isPlainFacadeGroup(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function buildFacadeRequest(
  operation: SdkOperationDescriptor,
  input: AppaloftSdkFacadeInput | undefined,
): AppaloftSdkOperationRequest {
  const normalizedInput = input ?? {};
  const reservedKeys = new Set(["pathParams", "query", "body", "signal", "parseEnvelope"]);
  const pathParamNames = new Set(pathParameterNames(operation.route.path));
  const pathParams = {
    ...extractPathParams(operation.route.path, normalizedInput),
    ...(normalizedInput.pathParams ?? {}),
  };
  const looseInput = Object.fromEntries(
    Object.entries(normalizedInput).filter(
      ([key]) => !reservedKeys.has(key) && !pathParamNames.has(key),
    ),
  );
  const hasExplicitBody = Object.hasOwn(normalizedInput, "body");
  const hasExplicitQuery = normalizedInput.query !== undefined;
  const defaultsToQuery =
    !hasExplicitBody &&
    (operation.route.method === "GET" ||
      operation.route.method === "DELETE" ||
      operation.streaming);

  const request: AppaloftSdkOperationRequest = {
    operation,
    ...(Object.keys(pathParams).length > 0 ? { pathParams } : {}),
    ...(!defaultsToQuery && Object.keys(looseInput).length > 0 ? { body: looseInput } : {}),
    ...(hasExplicitBody ? { body: normalizedInput.body } : {}),
    ...(normalizedInput.signal ? { signal: normalizedInput.signal } : {}),
  };

  if (defaultsToQuery || hasExplicitQuery) {
    const query = {
      ...(defaultsToQuery ? queryFromLooseInput(looseInput) : {}),
      ...(normalizedInput.query ?? {}),
    };

    if (Object.keys(query).length > 0) {
      return { ...request, query };
    }
  }

  return request;
}

function extractPathParams(
  path: string,
  input: AppaloftSdkFacadeInput,
): Readonly<Record<string, string>> {
  const params: Record<string, string> = {};

  for (const key of pathParameterNames(path)) {
    const value = input[key];

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`SDK facade path parameter ${key} must be a string, number, or boolean`);
    }

    params[key] = String(value);
  }

  return params;
}

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function lastFacadeSegment(facadePath: readonly string[]): string {
  const leaf = facadePath.at(-1);

  if (!leaf) {
    throw new Error("SDK facade path must contain at least one segment");
  }

  return leaf;
}

function queryFromLooseInput(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string | number | boolean | null | undefined>> {
  const query: Record<string, string | number | boolean | null | undefined> = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null ||
      value === undefined
    ) {
      query[key] = value;
      continue;
    }

    throw new Error(`SDK facade query parameter ${key} must be a scalar value`);
  }

  return query;
}

function operationKeyToFacadePath(operationKey: string): string[] {
  return operationKey.split(".").filter(Boolean).map(operationKeyPartToIdentifier);
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

async function fetchSdkOperation(
  fetchImplementation: AppaloftSdkFetch,
  options: AppaloftSdkClientOptions,
  input: AppaloftSdkOperationRequest,
): Promise<{ readonly request: Request; readonly response: Response }> {
  const url = buildOperationUrl(options.baseUrl, input);
  const request = buildRequest(url, input, {
    auth: resolveAuth(options.auth),
    configuredHeaders: options.headers,
    userAgent: options.userAgent,
  });
  return {
    request,
    response: await fetchImplementation(request),
  };
}

async function* streamOperation<TEnvelope>(
  fetchImplementation: AppaloftSdkFetch,
  options: AppaloftSdkClientOptions,
  input: AppaloftSdkStreamRequest<TEnvelope>,
): AsyncIterable<TEnvelope> {
  const { request, response } = await fetchSdkOperation(fetchImplementation, options, input);

  if (!response.ok) {
    const data = await readAppaloftJsonApiResponse(response, {
      method: request.method,
      url: request.url,
    });
    const error = data.ok ? parseDomainError(data.data) : data.error;
    throw new AppaloftSdkStreamError(
      `SDK stream request failed with ${error.code}`,
      response.status,
      error,
    );
  }

  const parseEnvelope = input.parseEnvelope ?? ((value: unknown) => value as TEnvelope);

  for await (const envelope of parseStreamResponse(response)) {
    yield parseEnvelope(envelope);
  }
}

function buildRequest(
  url: URL,
  input: AppaloftSdkOperationRequest,
  options: {
    readonly auth: AppaloftSdkAuth | undefined;
    readonly configuredHeaders: HeadersInit | (() => HeadersInit) | undefined;
    readonly userAgent: string | undefined;
  },
): Request {
  const requestInit: RequestInit = {
    method: input.operation.route.method,
    headers: buildHeaders({
      auth: options.auth,
      body: input.body,
      configuredHeaders: options.configuredHeaders,
      userAgent: options.userAgent,
    }),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    ...(input.signal ? { signal: input.signal } : {}),
  };

  return new Request(url, requestInit);
}

function buildOperationUrl(baseUrl: string, input: AppaloftSdkOperationRequest): URL {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const path = interpolatePath(input.operation.route.path, input.pathParams ?? {});
  const url = new URL(path.replace(/^\//, ""), base);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function interpolatePath(path: string, params: Readonly<Record<string, string>>): string {
  return path.replaceAll(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];

    if (value === undefined) {
      throw new Error(`Missing SDK operation path parameter: ${key}`);
    }

    return encodeURIComponent(value);
  });
}

function resolveAuth(auth: AppaloftSdkClientOptions["auth"]): AppaloftSdkAuth | undefined {
  return typeof auth === "function" ? auth() : auth;
}

function buildHeaders(input: {
  auth: AppaloftSdkAuth | undefined;
  body: unknown;
  configuredHeaders: HeadersInit | (() => HeadersInit) | undefined;
  userAgent: string | undefined;
}): Headers {
  const headers = new Headers(
    typeof input.configuredHeaders === "function"
      ? input.configuredHeaders()
      : input.configuredHeaders,
  );

  applyAuthHeaders(headers, input.auth);

  if (input.userAgent && !headers.has("user-agent")) {
    headers.set("user-agent", input.userAgent);
  }

  if (input.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

function applyAuthHeaders(headers: Headers, auth: AppaloftSdkAuth | undefined): void {
  if (!auth || auth.kind === "none") {
    return;
  }

  if (auth.kind === "product-session") {
    headers.set("cookie", auth.cookie);
    return;
  }

  headers.set("authorization", `Bearer ${auth.token}`);
}

export async function readAppaloftJsonApiResponse(
  response: Response,
  context: AppaloftJsonApiResponseContext,
): Promise<AppaloftJsonApiReadResult> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (text.length === 0) {
    return { ok: true, data: null };
  }

  if (isHtmlResponse(contentType, text)) {
    return {
      ok: false,
      error: unexpectedResponseError(
        "control_plane_unexpected_html_response",
        "Control plane returned HTML instead of JSON. Check the control-plane base URL and API route.",
        response,
        context,
        contentType,
        "html",
      ),
    };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      error: unexpectedResponseError(
        hasJsonContentType(contentType)
          ? "control_plane_invalid_json_response"
          : "control_plane_unexpected_non_json_response",
        hasJsonContentType(contentType)
          ? "Control plane returned invalid JSON."
          : "Control plane returned a non-JSON response.",
        response,
        context,
        contentType,
        "non-json",
      ),
    };
  }
}

function hasJsonContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes("application/json") || normalized.includes("+json");
}

function isHtmlResponse(contentType: string, body: string): boolean {
  if (contentType.toLowerCase().includes("text/html")) {
    return true;
  }

  const prefix = body.slice(0, 512).trimStart().toLowerCase();
  return (
    prefix.startsWith("<!doctype html") ||
    prefix.startsWith("<html") ||
    prefix.startsWith("<head") ||
    prefix.startsWith("<body") ||
    /<div\s+id=["']svelte["']/.test(prefix)
  );
}

function unexpectedResponseError(
  code: string,
  message: string,
  response: Response,
  context: AppaloftJsonApiResponseContext,
  contentType: string,
  bodyKind: string,
): DomainErrorResponse {
  return {
    code,
    category: "infra",
    message,
    retryable: false,
    details: {
      method: context.method,
      url: context.url,
      status: response.status,
      contentType,
      bodyKind,
    },
  };
}

async function* parseStreamResponse(response: Response): AsyncIterable<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    yield* parseSseStream(response);
    return;
  }

  if (
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/jsonl") ||
    contentType.includes("application/octet-stream")
  ) {
    yield* parseJsonLineStream(response);
    return;
  }

  const value = await readAppaloftJsonApiResponse(response, {
    method: "GET",
    url: response.url,
  });

  if (!value.ok) {
    throw new AppaloftSdkStreamError(
      `SDK stream request failed with ${value.error.code}`,
      response.status,
      value.error,
    );
  }

  if (Array.isArray(value.data)) {
    for (const item of value.data) {
      yield item;
    }
    return;
  }

  if (isObject(value.data) && Array.isArray(value.data.envelopes)) {
    for (const item of value.data.envelopes) {
      yield item;
    }
    return;
  }

  if (value.data !== null) {
    yield value.data;
  }
}

async function* parseSseStream(response: Response): AsyncIterable<unknown> {
  let eventBuffer = "";

  for await (const line of responseLines(response)) {
    if (line.length === 0) {
      if (eventBuffer.length > 0) {
        yield JSON.parse(eventBuffer) as unknown;
        eventBuffer = "";
      }
      continue;
    }

    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice("data:".length).trimStart();
    eventBuffer = eventBuffer.length > 0 ? `${eventBuffer}\n${data}` : data;
  }

  if (eventBuffer.length > 0) {
    yield JSON.parse(eventBuffer) as unknown;
  }
}

async function* parseJsonLineStream(response: Response): AsyncIterable<unknown> {
  for await (const line of responseLines(response)) {
    if (line.trim().length > 0) {
      yield JSON.parse(line) as unknown;
    }
  }
}

async function* responseLines(response: Response): AsyncIterable<string> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });

      while (true) {
        const newlineIndex = buffer.indexOf("\n");

        if (newlineIndex < 0) {
          break;
        }

        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
        yield line;
      }
    }

    buffer += decoder.decode();

    if (buffer.length > 0) {
      yield buffer.replace(/\r$/, "");
    }
  } finally {
    reader.releaseLock();
  }
}

export function isAppaloftSdkErrorCode<TCode extends string>(
  error: DomainErrorResponse,
  code: TCode,
): error is DomainErrorResponse & { readonly code: TCode } {
  return error.code === code;
}

function parseDomainError(value: unknown): DomainErrorResponse {
  if (isDomainErrorResponse(value)) {
    return value;
  }
  if (isObject(value)) {
    const nestedError = value.error;

    if (isDomainErrorResponse(nestedError)) {
      return nestedError;
    }
  }

  return {
    code: "sdk_unstructured_error",
    category: "infra",
    message: "The server returned an error that did not match the Appaloft error contract.",
    retryable: false,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDomainErrorResponse(value: unknown): value is DomainErrorResponse {
  if (!isObject(value)) {
    return false;
  }

  if (
    typeof value.code !== "string" ||
    !isDomainErrorCategory(value.category) ||
    typeof value.message !== "string" ||
    typeof value.retryable !== "boolean"
  ) {
    return false;
  }

  return value.details === undefined || isDomainErrorDetails(value.details);
}

function isDomainErrorCategory(value: unknown): value is DomainErrorResponse["category"] {
  return (
    value === "user" ||
    value === "infra" ||
    value === "provider" ||
    value === "retryable" ||
    value === "timeout"
  );
}

function isDomainErrorDetails(
  value: unknown,
): value is Readonly<Record<string, DomainErrorDetailValue>> {
  if (!isObject(value)) {
    return false;
  }

  return Object.values(value).every(isDomainErrorDetailValue);
}

function isDomainErrorDetailValue(value: unknown): value is DomainErrorDetailValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
