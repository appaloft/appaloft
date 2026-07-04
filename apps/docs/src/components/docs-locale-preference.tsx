"use client";

import { useEffect } from "react";
import {
  type DocsLocale,
  docsLocaleFromPath,
  docsPathForLocale,
  parseLocaleCookie,
  preferredDocsLocale,
  serializeLocaleCookie,
} from "@/lib/locale-preference";

const docsBase = process.env.NEXT_PUBLIC_APPALOFT_DOCS_BASE ?? "/docs";
const localeCookieDomain = process.env.NEXT_PUBLIC_APPALOFT_LOCALE_COOKIE_DOMAIN ?? "";

export function DocsLocalePreference() {
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    function persistClickedLocale(event: MouseEvent) {
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

    document.addEventListener("click", persistClickedLocale);

    return () => document.removeEventListener("click", persistClickedLocale);
  }, []);

  return null;
}

function readStoredLocale(): string | undefined {
  try {
    return window.localStorage.getItem("appaloft.locale") ?? undefined;
  } catch {
    return undefined;
  }
}

function persistLocale(locale: DocsLocale): void {
  try {
    window.localStorage.setItem("appaloft.locale", locale);
  } catch {
    // Cookie persistence still lets other Appaloft surfaces see the preference.
  }

  // The static docs shell must share this preference with www and the Web console.
  // biome-ignore lint/suspicious/noDocumentCookie: language preference must be sent with later navigation requests
  document.cookie = serializeLocaleCookie({
    domain: localeCookieDomain,
    locale,
    secure: window.location.protocol === "https:",
  });
}
