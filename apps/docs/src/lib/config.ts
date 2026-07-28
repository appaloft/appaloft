/**
 * Build-time docs configuration shared between `astro.config.ts` and the
 * Astro app itself. `APPALOFT_DOCS_BASE`/`APPALOFT_DOCS_SITE` are the same
 * environment-variable contract the old Fumadocs/Next `apps/docs` used
 * (ADR-101 Decision item 5) — self-hosted/binary builds embed the docs
 * static bundle under `/docs` by default, while the official
 * `docs.appaloft.com` build sets `APPALOFT_DOCS_BASE=/`.
 */
export const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);
export const docsSite = normalizeDocsSite(process.env.APPALOFT_DOCS_SITE);
export const appaloftVersion = process.env.APPALOFT_APP_VERSION || "0.0.0";
export const localeCookieDomain = process.env.PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN || "";

function normalizeDocsBase(value: string | undefined): string {
  const trimmed = value?.trim() || "/docs";
  if (trimmed === "/") return "/";

  // Trailing slash is required, not cosmetic: Astro sets
  // `import.meta.env.BASE_URL` to this exact string (no normalization —
  // see astro/dist/core/create-vite.js), and Nimbus's own `NimbusHead.astro`
  // builds asset URLs via straight concatenation
  // (`` `${import.meta.env.BASE_URL}favicon.ico` ``), which silently
  // produces a broken `/docsfavicon.ico` without it.
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}/`;
}

function normalizeDocsSite(value: string | undefined): string {
  return (value?.trim() || "https://docs.appaloft.com").replace(/\/+$/, "");
}
