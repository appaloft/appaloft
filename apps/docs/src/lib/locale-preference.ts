export type DocsLocale = "en-US" | "zh-CN";

export const appaloftLocaleCookieMaxAge = 60 * 60 * 24 * 365;
export const appaloftLocaleCookieName = "appaloft.locale";
export const appaloftLocaleStorageKey = "appaloft.locale";
export const defaultDocsLocale: DocsLocale = "zh-CN";

export function normalizeDocsLocale(input?: string | null): DocsLocale | undefined {
  const normalized = input?.trim().toLowerCase().replace("_", "-");

  if (!normalized) {
    return undefined;
  }

  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized.startsWith("en-")) {
    return "en-US";
  }

  return undefined;
}

export function docsLocaleFromPath(pathname: string, docsBase = "/docs"): DocsLocale {
  const localPath = stripDocsBase(pathname, docsBase);

  return localPath === "/en" || localPath.startsWith("/en/") ? "en-US" : "zh-CN";
}

export function preferredDocsLocale(input: {
  readonly cookieLocale?: string | null;
  readonly localStorageLocale?: string | null;
  readonly navigatorLanguages?: readonly string[];
  readonly searchParams?: URLSearchParams;
}): DocsLocale | undefined {
  const fromQuery = normalizeDocsLocale(
    input.searchParams?.get("locale") ?? input.searchParams?.get("lang"),
  );

  if (fromQuery) {
    return fromQuery;
  }

  const fromCookie = normalizeDocsLocale(input.cookieLocale);

  if (fromCookie) {
    return fromCookie;
  }

  const fromLocalStorage = normalizeDocsLocale(input.localStorageLocale);

  if (fromLocalStorage) {
    return fromLocalStorage;
  }

  for (const candidate of input.navigatorLanguages ?? []) {
    const locale = normalizeDocsLocale(candidate);

    if (locale) {
      return locale;
    }
  }

  return undefined;
}

export function docsPathForLocale(input: {
  readonly docsBase?: string;
  readonly locale: DocsLocale;
  readonly pathname: string;
}): string {
  const localPath = stripDocsBase(input.pathname, input.docsBase);
  const zhPath =
    localPath === "/en"
      ? "/"
      : localPath.startsWith("/en/")
        ? localPath.slice("/en".length)
        : localPath;
  const nextLocalPath = input.locale === "en-US" ? withEnPrefix(zhPath) : zhPath;

  return withDocsBase(nextLocalPath, input.docsBase);
}

export function parseLocaleCookie(header?: string | null): string | undefined {
  for (const cookie of header?.split(";") ?? []) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName !== appaloftLocaleCookieName) {
      continue;
    }

    const value = rawValueParts.join("=");

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

export function serializeLocaleCookie(input: {
  readonly domain?: string;
  readonly locale: DocsLocale;
  readonly secure?: boolean;
}): string {
  return [
    `${appaloftLocaleCookieName}=${encodeURIComponent(input.locale)}`,
    "Path=/",
    `Max-Age=${appaloftLocaleCookieMaxAge}`,
    "SameSite=Lax",
    input.secure ? "Secure" : "",
    input.domain?.trim() ? `Domain=${input.domain.trim()}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function stripDocsBase(pathname: string, docsBase = "/docs"): string {
  const base = normalizeDocsBase(docsBase);

  if (base === "/") {
    return normalizeLocalPath(pathname);
  }

  if (pathname === base) {
    return "/";
  }

  if (pathname.startsWith(`${base}/`)) {
    return normalizeLocalPath(pathname.slice(base.length));
  }

  return normalizeLocalPath(pathname);
}

function withDocsBase(pathname: string, docsBase = "/docs"): string {
  const base = normalizeDocsBase(docsBase);
  const localPath = normalizeLocalPath(pathname);

  if (base === "/") {
    return localPath;
  }

  if (localPath === "/") {
    return `${base}/`;
  }

  return `${base}${localPath}`;
}

function normalizeDocsBase(docsBase = "/docs"): string {
  const trimmed = docsBase.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeLocalPath(pathname: string): string {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return `/${pathname.replace(/^\/+/, "")}`;
}

function withEnPrefix(zhPath: string): string {
  return zhPath === "/" ? "/en/" : `/en${zhPath}`;
}
