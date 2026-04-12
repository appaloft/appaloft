import {
  createYunduTranslator,
  defaultYunduLocale,
  i18nKeys,
  normalizeYunduLocale,
  type TranslationKey,
  type TranslationValues,
  type YunduLocale,
  type YunduTranslate,
  yunduLocaleHeader,
  yunduLocaleStorageKey,
} from "@yundu/i18n";
import { derived, writable } from "svelte/store";

function readInitialLocale(): YunduLocale {
  if (typeof window === "undefined") {
    return defaultYunduLocale;
  }

  return normalizeYunduLocale(
    window.localStorage.getItem(yunduLocaleStorageKey) ?? window.navigator.language,
  );
}

export const locale = writable<YunduLocale>(readInitialLocale());

export const t = derived<typeof locale, YunduTranslate>(locale, ($locale) =>
  createYunduTranslator({ locale: $locale }),
);

export function translate(key: TranslationKey, values?: TranslationValues): string {
  return createYunduTranslator({ locale: readInitialLocale() })(key, values);
}

export function currentLocale(): YunduLocale {
  return typeof window !== "undefined"
    ? normalizeYunduLocale(window.localStorage.getItem(yunduLocaleStorageKey))
    : defaultYunduLocale;
}

export function setLocale(nextLocale: string): void {
  const normalizedLocale = normalizeYunduLocale(nextLocale);
  locale.set(normalizedLocale);

  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(yunduLocaleStorageKey, normalizedLocale);
  document.documentElement.lang = normalizedLocale;
  window.dispatchEvent(new CustomEvent("yundu:locale-change", { detail: normalizedLocale }));
}

export function localeHeaders(): Record<string, string> {
  return {
    [yunduLocaleHeader]: currentLocale(),
  };
}

export { i18nKeys };
