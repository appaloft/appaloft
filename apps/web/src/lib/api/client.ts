import { type DomainErrorResponse } from "@appaloft/contracts";
import { i18nKeys, localeHeaders, translate } from "$lib/i18n";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = (
    import.meta.env.VITE_APPALOFT_API_BASE_URL as string | undefined
  )?.trim();

  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(window.location.origin);
  }

  return "http://localhost:3001";
}

export const API_BASE = resolveApiBaseUrl();

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export type ApiTraceMetadata = {
  traceLink?: string;
  traceparent?: string;
};

export type ApiResponseMetadata = {
  trace: ApiTraceMetadata;
};

export type ApiDomainErrorEventDetail = {
  path: string;
  status: number;
  message: string;
  body: string;
  error: DomainErrorResponse;
  metadata: ApiResponseMetadata;
};

export const apiDomainErrorEventType = "appaloft:api-domain-error";

export class ApiRequestError extends Error {
  readonly path: string;
  readonly status: number;
  readonly body: string;
  readonly metadata: ApiResponseMetadata;
  readonly domainError?: DomainErrorResponse;

  constructor(input: {
    path: string;
    status: number;
    body: string;
    message: string;
    metadata: ApiResponseMetadata;
    domainError?: DomainErrorResponse;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.path = input.path;
    this.status = input.status;
    this.body = input.body;
    this.metadata = input.metadata;
    this.domainError = input.domainError;
  }
}

export function readTraceLinkHeader(linkHeader: string | null): string | undefined {
  if (!linkHeader) {
    return undefined;
  }

  for (const match of linkHeader.matchAll(/<([^>]+)>\s*(?:;\s*[^,]*)*;\s*rel="?trace"?/gi)) {
    const url = match[1]?.trim();
    if (url) {
      return url;
    }
  }

  return undefined;
}

export function readApiResponseMetadata(response: Response): ApiResponseMetadata {
  const traceLink = readTraceLinkHeader(response.headers.get("link"));
  const traceparent = response.headers.get("traceparent") ?? undefined;

  return {
    trace: {
      ...(traceLink ? { traceLink } : {}),
      ...(traceparent ? { traceparent } : {}),
    },
  };
}

export async function requestWithMetadata<T>(
  path: string,
  init?: RequestInit,
  options: {
    onMetadata?: (metadata: ApiResponseMetadata) => void;
    suppressDomainErrorEvent?: boolean;
  } = {},
): Promise<{ data: T; metadata: ApiResponseMetadata }> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(localeHeaders())) {
    headers.set(key, value);
  }

  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers,
  });
  const metadata = readApiResponseMetadata(response);
  options.onMetadata?.(metadata);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const domainError = readDomainErrorResponse(body);
    const detail = body.trim().slice(0, 240);
    const message =
      detail.length > 0
        ? translate(i18nKeys.errors.web.requestFailedWithDetail, {
            path,
            status: response.status,
            detail,
          })
        : translate(i18nKeys.errors.web.requestFailedWithoutDetail, {
            path,
            status: response.status,
          });
    const error = new ApiRequestError({
      path,
      status: response.status,
      body,
      message,
      metadata,
      ...(domainError ? { domainError } : {}),
    });

    if (domainError && !options.suppressDomainErrorEvent) {
      dispatchApiDomainError({
        path,
        status: response.status,
        message,
        body,
        error: domainError,
        metadata,
      });
    }

    throw error;
  }

  if (response.status === 204) {
    return { data: null as T, metadata };
  }

  return { data: (await response.json()) as T, metadata };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await requestWithMetadata<T>(path, init);

  return data;
}

export function readErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : translate(i18nKeys.errors.web.unknownRequestFailure);
}

function dispatchApiDomainError(detail: ApiDomainErrorEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ApiDomainErrorEventDetail>(apiDomainErrorEventType, {
      detail,
    }),
  );
}

function readDomainErrorResponse(body: string): DomainErrorResponse | undefined {
  const parsed = parseJsonObject(body);
  if (!parsed) {
    return undefined;
  }

  return (
    normalizeDomainError(parsed) ??
    normalizeDomainError(readRecordValue(parsed, "error")) ??
    normalizeDomainError(readRecordValue(readRecordValue(parsed, "data"), "error"))
  );
}

function parseJsonObject(body: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDomainError(value: unknown): DomainErrorResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = readStringValue(value, "code") ?? readStringValue(value, "reason");
  const message = readStringValue(value, "message") ?? code;
  if (!code || !message) {
    return undefined;
  }

  return {
    code,
    message,
    category: normalizeDomainErrorCategory(readStringValue(value, "category")),
    retryable:
      readBooleanValue(value, "retryable") ?? readBooleanValue(value, "retriable") ?? false,
    ...(isRecord(value.details) ? { details: normalizeDomainErrorDetails(value.details) } : {}),
  };
}

function normalizeDomainErrorCategory(value: string | undefined): DomainErrorResponse["category"] {
  return value === "user" ||
    value === "infra" ||
    value === "provider" ||
    value === "retryable" ||
    value === "timeout"
    ? value
    : "user";
}

function normalizeDomainErrorDetails(
  value: Record<string, unknown>,
): NonNullable<DomainErrorResponse["details"]> {
  const details: NonNullable<DomainErrorResponse["details"]> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null
    ) {
      details[key] = entry;
    } else if (Array.isArray(entry) && entry.every((item) => typeof item === "string")) {
      details[key] = entry;
    }
  }
  return details;
}

function readRecordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readStringValue(value: Record<string, unknown>, key: string): string | undefined {
  const entry = value[key];
  return typeof entry === "string" && entry.length > 0 ? entry : undefined;
}

function readBooleanValue(value: Record<string, unknown>, key: string): boolean | undefined {
  const entry = value[key];
  return typeof entry === "boolean" ? entry : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
