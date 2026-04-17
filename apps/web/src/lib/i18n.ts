import {
  type AppaloftLocale,
  type AppaloftTranslate,
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

function readInitialLocale(): AppaloftLocale {
  if (typeof window === "undefined") {
    return defaultAppaloftLocale;
  }

  return normalizeAppaloftLocale(
    window.localStorage.getItem(appaloftLocaleStorageKey) ?? window.navigator.language,
  );
}

export const locale = writable<AppaloftLocale>(readInitialLocale());

export const t = derived<typeof locale, AppaloftTranslate>(locale, ($locale) =>
  createAppaloftTranslator({ locale: $locale }),
);

export function translate(key: TranslationKey, values?: TranslationValues): string {
  return createAppaloftTranslator({ locale: readInitialLocale() })(key, values);
}

export function currentLocale(): AppaloftLocale {
  return typeof window !== "undefined"
    ? normalizeAppaloftLocale(window.localStorage.getItem(appaloftLocaleStorageKey))
    : defaultAppaloftLocale;
}

export function setLocale(nextLocale: string): void {
  const normalizedLocale = normalizeAppaloftLocale(nextLocale);
  locale.set(normalizedLocale);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(appaloftLocaleStorageKey, normalizedLocale);
  document.documentElement.lang = normalizedLocale;
  window.dispatchEvent(new CustomEvent("appaloft:locale-change", { detail: normalizedLocale }));
}

export function localeHeaders(): Record<string, string> {
  return {
    [appaloftLocaleHeader]: currentLocale(),
  };
}

export { i18nKeys };
