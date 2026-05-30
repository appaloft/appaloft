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

export function createAppaloftSdkClient(options: AppaloftSdkClientOptions): AppaloftSdkClient {
  const fetchImplementation = options.fetch ?? ((request: Request) => fetch(request));

  return {
    apiVersion,
    request: async <T = unknown>(
      input: AppaloftSdkOperationRequest,
    ): Promise<AppaloftSdkOperationResult<T>> => {
      const url = buildOperationUrl(options.baseUrl, input);
      const response = await fetchImplementation(
        buildRequest(url, input, {
          auth: resolveAuth(options.auth),
          configuredHeaders: options.headers,
          userAgent: options.userAgent,
        }),
      );

      const data = await readJson(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: parseDomainError(data),
        };
      }

      return {
        ok: true,
        status: response.status,
        data: data as T,
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

async function* streamOperation<TEnvelope>(
  fetchImplementation: AppaloftSdkFetch,
  options: AppaloftSdkClientOptions,
  input: AppaloftSdkStreamRequest<TEnvelope>,
): AsyncIterable<TEnvelope> {
  const url = buildOperationUrl(options.baseUrl, input);
  const response = await fetchImplementation(
    buildRequest(url, input, {
      auth: resolveAuth(options.auth),
      configuredHeaders: options.headers,
      userAgent: options.userAgent,
    }),
  );

  if (!response.ok) {
    const data = await readJson(response);
    const error = parseDomainError(data);
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
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

  const value = await readJson(response);

  if (Array.isArray(value)) {
    for (const item of value) {
      yield item;
    }
    return;
  }

  if (isObject(value) && Array.isArray(value.envelopes)) {
    for (const item of value.envelopes) {
      yield item;
    }
    return;
  }

  if (value !== null) {
    yield value;
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
