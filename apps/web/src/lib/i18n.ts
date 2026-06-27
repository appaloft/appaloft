import {
  type AppaloftLocale,
  type AppaloftTranslate,
  appaloftLocaleCookieName,
  appaloftLocaleHeader,
  appaloftLocaleStorageKey,
  createAppaloftTranslator,
  defaultAppaloftLocale,
  i18nKeys,
  normalizeAppaloftLocale,
  type TranslationKey,
  type TranslationValues,
} from "@appaloft/i18n";
import { derived, writable } from "svelte/store";

function readDocumentLocale(): string | null {
  return typeof document !== "undefined" ? document.documentElement.lang : null;
}

function readInitialLocale(): AppaloftLocale {
  if (typeof window === "undefined") {
    return defaultAppaloftLocale;
  }

  return normalizeAppaloftLocale(
    window.localStorage.getItem(appaloftLocaleStorageKey) || readDocumentLocale(),
  );
}

function syncDocumentLocale(nextLocale: AppaloftLocale): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = nextLocale;
  }
}

const initialLocale = readInitialLocale();
syncDocumentLocale(initialLocale);

export const locale = writable<AppaloftLocale>(initialLocale);

export const t = derived<typeof locale, AppaloftTranslate>(locale, ($locale) =>
  createAppaloftTranslator({ locale: $locale }),
);

export function translate(key: TranslationKey, values?: TranslationValues): string {
  return createAppaloftTranslator({ locale: readInitialLocale() })(key, values);
}

export function currentLocale(): AppaloftLocale {
  return typeof window !== "undefined"
    ? normalizeAppaloftLocale(
        window.localStorage.getItem(appaloftLocaleStorageKey) || readDocumentLocale(),
      )
    : defaultAppaloftLocale;
}

export function setLocale(nextLocale: string): void {
  const normalizedLocale = normalizeAppaloftLocale(nextLocale);
  locale.set(normalizedLocale);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(appaloftLocaleStorageKey, normalizedLocale);
  if (typeof document !== "undefined") {
    // Server-rendered static HTML needs the cookie before the Cookie Store API is universal.
    // biome-ignore lint/suspicious/noDocumentCookie: language preference must be sent with the next navigation request
    document.cookie = `${appaloftLocaleCookieName}=${encodeURIComponent(
      normalizedLocale,
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
    syncDocumentLocale(normalizedLocale);
  }
  window.dispatchEvent(new CustomEvent("appaloft:locale-change", { detail: normalizedLocale }));
}

export function localeHeaders(): Record<string, string> {
  return {
    [appaloftLocaleHeader]: currentLocale(),
  };
}

export { i18nKeys };
