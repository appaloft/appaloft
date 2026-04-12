import i18next, { type i18n as I18nextInstance } from "i18next";

import { i18nKeys, type TranslationKey } from "./keys";
import { yunduI18nResources } from "./resources";

export type { TranslationKey } from "./keys";
export { i18nKeys } from "./keys";
export type { YunduTranslationResource } from "./locales/zh-CN";
export { enUS, yunduI18nResources, zhCN } from "./resources";

export const yunduLocales = ["zh-CN", "en-US"] as const;
export type YunduLocale = (typeof yunduLocales)[number];

export const defaultYunduLocale: YunduLocale = "zh-CN";
export const yunduLocaleStorageKey = "yundu.locale";
export const yunduLocaleHeader = "x-yundu-locale";

export type TranslationValues = Record<string, string | number | boolean | null | undefined>;

export type YunduTranslate = (key: TranslationKey, values?: TranslationValues) => string;

export function normalizeYunduLocale(input?: string | null): YunduLocale {
  const value = input?.trim();

  if (!value) {
    return defaultYunduLocale;
  }

  const normalized = value.toLowerCase().replace("_", "-");

  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized.startsWith("en-")) {
    return "en-US";
  }

  return defaultYunduLocale;
}

export function resolveYunduLocaleFromAcceptLanguage(header?: string | null): YunduLocale {
  const candidates = (header ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [tag, ...parameters] = entry.split(";").map((part) => part.trim());
      const quality =
        parameters
          .find((parameter) => parameter.startsWith("q="))
          ?.slice(2)
          .trim() ?? "1";

      return {
        tag,
        quality: Number(quality),
      };
    })
    .filter((candidate): candidate is { tag: string; quality: number } =>
      Boolean(candidate.tag && Number.isFinite(candidate.quality)),
    )
    .sort((left, right) => right.quality - left.quality);

  return normalizeYunduLocale(candidates[0]?.tag);
}

export function resolveYunduLocaleFromHeaders(headers: Headers): YunduLocale {
  const explicitLocale = headers.get(yunduLocaleHeader);

  if (explicitLocale) {
    return normalizeYunduLocale(explicitLocale);
  }

  return resolveYunduLocaleFromAcceptLanguage(headers.get("accept-language"));
}

export function createYunduI18n(input?: {
  locale?: string | null;
  fallbackLocale?: YunduLocale;
}): I18nextInstance {
  const instance = i18next.createInstance();
  void instance.init({
    resources: yunduI18nResources,
    lng: normalizeYunduLocale(input?.locale),
    fallbackLng: input?.fallbackLocale ?? defaultYunduLocale,
    defaultNS: "common",
    ns: ["common", "errors", "backend", "console"],
    interpolation: {
      escapeValue: false,
    },
    showSupportNotice: false,
    initImmediate: false,
  });

  return instance;
}

export function createYunduTranslator(input?: {
  locale?: string | null;
  fallbackLocale?: YunduLocale;
}): YunduTranslate {
  const instance = createYunduI18n(input);

  return (key, values) => {
    if (values) {
      return String(instance.t(key, values as Record<string, unknown>));
    }

    return String(instance.t(key));
  };
}

export interface LocalizableDomainError {
  code: string;
  category: "user" | "infra" | "provider" | "retryable";
  message: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | null>;
}

export function translateDomainError(error: LocalizableDomainError, t: YunduTranslate): string {
  if (error.code === "not_found") {
    return t(i18nKeys.errors.domain.notFound, {
      entity: error.details?.entity ?? "entity",
      id: error.details?.id ?? "",
    });
  }

  switch (error.code) {
    case "conflict":
      return t(i18nKeys.errors.domain.conflict, { message: error.message });
    case "validation_error":
      return t(i18nKeys.errors.domain.validation, { message: error.message });
    case "invariant_violation":
      return t(i18nKeys.errors.domain.invariant, { message: error.message });
    default:
      if (error.category === "provider") {
        return t(i18nKeys.errors.domain.provider, { message: error.message });
      }

      if (error.category === "retryable") {
        return t(i18nKeys.errors.domain.retryable, { message: error.message });
      }

      return t(i18nKeys.errors.domain.infra, { message: error.message });
  }
}
