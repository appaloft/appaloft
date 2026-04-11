import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { type YunduOrpcClientContract } from "./client-contract";

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

export type YunduOrpcClient = YunduOrpcClientContract;

export function createYunduOrpcClient(baseUrl: string): YunduOrpcClient {
  const link = new RPCLink({
    url: `${resolveAbsoluteBaseUrl(baseUrl)}/api/rpc`,
  });

  return createORPCClient<YunduOrpcClient>(link);
}

export function createYunduOrpcQueryUtils(baseUrl: string) {
  return createTanstackQueryUtils(createYunduOrpcClient(baseUrl));
}
