import { appaloftLocaleHeader, defaultAppaloftLocale } from "@appaloft/i18n";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { type AppaloftOrpcClientContract } from "./client-contract";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveAbsoluteBaseUrl(baseUrl: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  if (normalizedBaseUrl.startsWith("http://") || normalizedBaseUrl.startsWith("https://")) {
    return normalizedBaseUrl;
  }

  if (typeof window !== "undefined") {
    return normalizeBaseUrl(new URL(normalizedBaseUrl || "/", window.location.origin).toString());
  }

  return normalizeBaseUrl(`http://localhost:3001${normalizedBaseUrl}`);
}

export type AppaloftOrpcClient = AppaloftOrpcClientContract;
export type AppaloftOrpcLocaleResolver = () => string | null | undefined;

export function createAppaloftOrpcClient(
  baseUrl: string,
  localeResolver?: AppaloftOrpcLocaleResolver,
): AppaloftOrpcClient {
  const link = new RPCLink({
    url: `${resolveAbsoluteBaseUrl(baseUrl)}/api/rpc`,
    headers: () => ({
      [appaloftLocaleHeader]: localeResolver?.() ?? defaultAppaloftLocale,
    }),
  });

  return createORPCClient<AppaloftOrpcClient>(link);
}

export function createAppaloftOrpcQueryUtils(
  baseUrl: string,
  localeResolver?: AppaloftOrpcLocaleResolver,
) {
  return createTanstackQueryUtils(createAppaloftOrpcClient(baseUrl, localeResolver));
}
