import i18next, { type i18n as I18nextInstance } from "i18next";

import { i18nKeys, type TranslationKey } from "./keys";
import { appaloftI18nResources } from "./resources";

export type { TranslationKey } from "./keys";
export { i18nKeys } from "./keys";
export type { AppaloftTranslationResource } from "./locales/zh-CN";
export { appaloftI18nResources, enUS, zhCN } from "./resources";

export const appaloftLocales = ["en-US", "zh-CN"] as const;
export type AppaloftLocale = (typeof appaloftLocales)[number];

export const defaultAppaloftLocale: AppaloftLocale = "en-US";
export const appaloftLocaleStorageKey = "appaloft.locale";
export const appaloftLocaleCookieName = "appaloft.locale";
export const appaloftLocaleHeader = "x-appaloft-locale";

export type TranslationValues = Record<
  string,
  string | number | boolean | null | undefined | readonly string[]
>;

export type AppaloftTranslate = (key: TranslationKey, values?: TranslationValues) => string;

export function normalizeAppaloftLocale(input?: string | null): AppaloftLocale {
  return normalizeAppaloftLocaleCandidate(input) ?? defaultAppaloftLocale;
}

function normalizeAppaloftLocaleCandidate(input?: string | null): AppaloftLocale | undefined {
  const value = input?.trim();

  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase().replace("_", "-");

  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }

  if (normalized === "en" || normalized === "en-us" || normalized.startsWith("en-")) {
    return "en-US";
  }

  return undefined;
}

export function resolveAppaloftLocaleFromAcceptLanguage(header?: string | null): AppaloftLocale {
  const ranges = header
    ?.split(",")
    .map((part, index) => {
      const [rawTag, ...parameters] = part.trim().split(";");
      const qParameter = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.toLowerCase().startsWith("q="));
      const parsedQ = qParameter ? Number(qParameter.slice(2)) : 1;
      const q = Number.isFinite(parsedQ) ? parsedQ : 0;

      return { tag: rawTag?.trim(), q, index };
    })
    .filter((range) => range.tag && range.tag !== "*" && range.q > 0)
    .sort((left, right) => right.q - left.q || left.index - right.index);

  for (const range of ranges ?? []) {
    const locale = normalizeAppaloftLocaleCandidate(range.tag);

    if (locale) {
      return locale;
    }
  }

  return defaultAppaloftLocale;
}

export function resolveAppaloftLocaleFromHeaders(headers: Headers): AppaloftLocale {
  const explicitLocale = headers.get(appaloftLocaleHeader);

  if (explicitLocale) {
    return normalizeAppaloftLocale(explicitLocale);
  }

  const cookieLocale = resolveAppaloftLocaleFromCookieHeader(headers.get("cookie"));

  if (cookieLocale) {
    return cookieLocale;
  }

  return resolveAppaloftLocaleFromAcceptLanguage(headers.get("accept-language"));
}

export function resolveAppaloftLocaleFromCookieHeader(
  header?: string | null,
): AppaloftLocale | undefined {
  for (const cookie of header?.split(";") ?? []) {
    const [rawName, ...rawValueParts] = cookie.trim().split("=");

    if (rawName !== appaloftLocaleCookieName) {
      continue;
    }

    const value = rawValueParts.join("=");

    try {
      return normalizeAppaloftLocaleCandidate(decodeURIComponent(value));
    } catch {
      return normalizeAppaloftLocaleCandidate(value);
    }
  }

  return undefined;
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
    initAsync: false,
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
  details?: Record<string, string | number | boolean | null | readonly string[]>;
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
    case "project_slug_conflict":
    case "project_archived":
    case "project_delete_blocked":
    case "environment_archived":
    case "environment_locked":
    case "resource_slug_conflict":
    case "resource_archived":
    case "resource_delete_blocked":
    case "dependency_resource_delete_blocked":
    case "server_delete_blocked":
    case "server_inactive":
    case "credential_in_use":
    case "credential_rotation_requires_usage_acknowledgement":
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
