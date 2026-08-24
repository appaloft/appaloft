import { browser } from "$app/environment";
import {
  appaloftLocaleStorageKey,
  createAppaloftTranslator,
  i18nKeys,
  normalizeAppaloftLocale,
  type AppaloftLocale,
  type TranslationKey,
  type TranslationValues,
} from "@appaloft/i18n";

let locale = $state<AppaloftLocale>(
  browser
    ? normalizeAppaloftLocale(localStorage.getItem(appaloftLocaleStorageKey) || navigator.language)
    : "en-US",
);

export const dashboardCopy = i18nKeys.console.dashboard;
export const commonCopy = i18nKeys.common;

export const dashboardI18n = {
  get locale(): AppaloftLocale {
    return locale;
  },
  t(key: TranslationKey, values?: TranslationValues): string {
    return createAppaloftTranslator({ locale })(key, values);
  },
  toggle(): void {
    locale = locale === "en-US" ? "zh-CN" : "en-US";

    if (browser) {
      localStorage.setItem(appaloftLocaleStorageKey, locale);
      document.documentElement.lang = locale;
    }
  },
};
