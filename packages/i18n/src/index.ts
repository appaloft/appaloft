import i18next, { type i18n as I18nextInstance } from "i18next";

import { i18nKeys, type TranslationKey } from "./keys";
import { appaloftI18nResources } from "./resources";

export type { TranslationKey } from "./keys";
export { i18nKeys } from "./keys";
export type { AppaloftTranslationResource } from "./locales/zh-CN";
export { appaloftI18nResources, enUS, zhCN } from "./resources";

export const appaloftLocales = ["zh-CN", "en-US"] as const;
export type AppaloftLocale = (typeof appaloftLocales)[number];

export const defaultAppaloftLocale: AppaloftLocale = "zh-CN";
export const appaloftLocaleStorageKey = "appaloft.locale";
export const appaloftLocaleHeader = "x-appaloft-locale";

export type TranslationValues = Record<string, string | number | boolean | null | undefined>;

export type AppaloftTranslate = (key: TranslationKey, values?: TranslationValues) => string;

export function normalizeAppaloftLocale(input?: string | null): AppaloftLocale {
  const value = input?.trim();

  if (!value) {
    return defaultAppaloftLocale;
  }

  const normalized = value.toLowerCase().replace("_", "-");

  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized.startsWith("en-")) {
    return "en-US";
  }

  return defaultAppaloftLocale;
}

export function resolveAppaloftLocaleFromAcceptLanguage(header?: string | null): AppaloftLocale {
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

  return normalizeAppaloftLocale(candidates[0]?.tag);
}

export function resolveAppaloftLocaleFromHeaders(headers: Headers): AppaloftLocale {
  const explicitLocale = headers.get(appaloftLocaleHeader);

  if (explicitLocale) {
    return normalizeAppaloftLocale(explicitLocale);
  }

  return resolveAppaloftLocaleFromAcceptLanguage(headers.get("accept-language"));
}

export function createAppaloftI18n(input?: {
  locale?: string | null;
  fallbackLocale?: AppaloftLocale;
}): I18nextInstance {
  const instance = i18next.createInstance();
  void instance.init({
    resources: appaloftI18nResources,
    lng: normalizeAppaloftLocale(input?.locale),
    fallbackLng: input?.fallbackLocale ?? defaultAppaloftLocale,
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

export function createAppaloftTranslator(input?: {
  locale?: string | null;
  fallbackLocale?: AppaloftLocale;
}): AppaloftTranslate {
  const instance = createAppaloftI18n(input);

  return (key, values) => {
    if (values) {
      return String(instance.t(key, values as Record<string, unknown>));
    }

    return String(instance.t(key));
  };
}

export interface LocalizableDomainError {
  code: string;
  category: "user" | "infra" | "provider" | "retryable" | "timeout";
  message: string;
  retryable: boolean;
  details?: Record<string, string | number | boolean | null>;
}

export function translateDomainError(error: LocalizableDomainError, t: AppaloftTranslate): string {
  if (error.code === "not_found") {
    return t(i18nKeys.errors.domain.notFound, {
      entity: error.details?.entity ?? "entity",
      id: error.details?.id ?? "",
    });
  }

  switch (error.code) {
    case "conflict":
    case "resource_slug_conflict":
      return t(i18nKeys.errors.domain.conflict, { message: error.message });
    case "deployment_not_redeployable":
      return t(i18nKeys.errors.domain.deploymentNotRedeployable, {
        deploymentId: error.details?.deploymentId ?? "",
        resourceId: error.details?.resourceId ?? "",
        status: error.details?.status ?? "",
      });
    case "domain_binding_proxy_required":
    case "domain_binding_context_mismatch":
    case "resource_context_mismatch":
    case "terminal_session_context_mismatch":
    case "terminal_session_workspace_unavailable":
    case "terminal_session_policy_denied":
    case "terminal_session_not_found":
      return t(i18nKeys.errors.domain.validation, { message: error.message });
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

      if (error.category === "timeout") {
        return t(i18nKeys.errors.domain.retryable, { message: error.message });
      }

      return t(i18nKeys.errors.domain.infra, { message: error.message });
  }
}
