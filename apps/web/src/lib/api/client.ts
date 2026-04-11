function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = (import.meta.env.VITE_YUNDU_API_BASE_URL as string | undefined)?.trim();

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim().slice(0, 240);
    throw new Error(
      detail.length > 0
        ? `API request failed for ${path}: ${response.status} ${detail}`
        : `API request failed for ${path}: ${response.status}`,
    );
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown request failure";
}
