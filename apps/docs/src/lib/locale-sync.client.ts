/**
 * Client-side port of the old Fumadocs/Next `DocsLocalePreference` React
 * component. Runs once per page load: redirects to the reader's preferred
 * locale (query param > shared `appaloft.locale` cookie > localStorage >
 * `navigator.languages`) when it differs from the current path, then keeps
 * the shared cookie in sync with whatever locale the reader is actually
 * browsing — including clicks on plain `<a href>` locale links.
 *
 * The shared `appaloft.locale` cookie (ADR-101 Localization section) is
 * also read/written by `apps/www` and the Cloud console; this module must
 * keep using that exact name/shape rather than inventing a docs-only one.
 */
import {
  appaloftLocaleStorageKey,
  type DocsLocale,
  docsLocaleFromPath,
  docsPathForLocale,
  parseLocaleCookie,
  preferredDocsLocale,
  serializeLocaleCookie,
} from "./locale-preference";

// `import.meta.env.BASE_URL` mirrors `astro.config.ts`'s `base` (itself
// driven by `APPALOFT_DOCS_BASE`) — the same "where within this origin is
// the docs app mounted" value the old Next.js build read from
// `NEXT_PUBLIC_APPALOFT_DOCS_BASE`.
const docsBase = import.meta.env.BASE_URL || "/";
const localeCookieDomain = import.meta.env.PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN || "";

let installed = false;

export function syncAppaloftLocale(): void {
  redirectToPreferredLocale();

  if (installed) return;
  installed = true;
  document.addEventListener("click", persistClickedLocale);
}

function redirectToPreferredLocale(): void {
  const preferredLocale = preferredDocsLocale({
    cookieLocale: parseLocaleCookie(document.cookie) ?? null,
    localStorageLocale: readStoredLocale() ?? null,
    navigatorLanguages: navigator.languages,
    searchParams: new URLSearchParams(window.location.search),
  });
  const currentLocale = docsLocaleFromPath(window.location.pathname, docsBase);
  const nextLocale = preferredLocale ?? currentLocale;
  const nextPath = docsPathForLocale({
    docsBase,
    locale: nextLocale,
    pathname: window.location.pathname,
  });

  persistLocale(nextLocale);
  document.documentElement.lang = nextLocale;

  if (nextPath !== window.location.pathname) {
    window.location.replace(`${nextPath}${window.location.search}${window.location.hash}`);
  }
}

function persistClickedLocale(event: MouseEvent): void {
  const anchor = (event.target as Element | null)?.closest("a[href]");

  if (!(anchor instanceof HTMLAnchorElement)) {
    return;
  }

  const url = new URL(anchor.href, window.location.href);

  if (url.origin !== window.location.origin) {
    return;
  }

  persistLocale(docsLocaleFromPath(url.pathname, docsBase));
}

function readStoredLocale(): string | undefined {
  try {
    return window.localStorage.getItem(appaloftLocaleStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function persistLocale(locale: DocsLocale): void {
  try {
    window.localStorage.setItem(appaloftLocaleStorageKey, locale);
  } catch {
    // Cookie persistence still lets other Appaloft surfaces see the preference.
  }

  // biome-ignore lint/suspicious/noDocumentCookie: language preference must be sent with later navigation requests
  document.cookie = serializeLocaleCookie({
    domain: localeCookieDomain,
    locale,
    secure: window.location.protocol === "https:",
  });
}
