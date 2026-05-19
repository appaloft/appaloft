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
    const detail = body.trim().slice(0, 240);
    throw new Error(
      detail.length > 0
        ? translate(i18nKeys.errors.web.requestFailedWithDetail, {
            path,
            status: response.status,
            detail,
          })
        : translate(i18nKeys.errors.web.requestFailedWithoutDetail, {
            path,
            status: response.status,
          }),
    );
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
