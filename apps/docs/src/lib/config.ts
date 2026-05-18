export const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);
export const docsSite = normalizeDocsSite(process.env.APPALOFT_DOCS_SITE);
export const appaloftVersion = process.env.APPALOFT_APP_VERSION || "0.0.0";

export function withDocsBase(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (docsBase === "/") {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return docsBase;
  }

  return `${docsBase}${normalizedPath}`;
}

function normalizeDocsBase(value: string | undefined): string {
  const trimmed = value?.trim() || "/docs";
  if (trimmed === "/") return "/";

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeDocsSite(value: string | undefined): string {
  return (value?.trim() || "https://appaloft.dev").replace(/\/+$/, "");
}
