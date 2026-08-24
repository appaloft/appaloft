export interface DashboardDevServerConfig {
  readonly host?: string;
  readonly port: number;
  readonly proxyTarget: string;
  readonly extensionProxyPrefixes: readonly string[];
}

type DashboardDevEnvironment = Readonly<Record<string, string | undefined>>;

function positivePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function extensionProxyPrefixes(value: string | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((prefix) => prefix.trim())
        .filter((prefix) => prefix.startsWith("/") && prefix !== "/" && prefix !== "/api"),
    ),
  );
}

export function resolveDashboardDevServer(env: DashboardDevEnvironment): DashboardDevServerConfig {
  return {
    ...(env.APPALOFT_DASHBOARD_DEV_HOST?.trim() || env.APPALOFT_WEB_DEV_HOST?.trim()
      ? {
          host: env.APPALOFT_DASHBOARD_DEV_HOST?.trim() || env.APPALOFT_WEB_DEV_HOST?.trim(),
        }
      : {}),
    port: positivePort(env.APPALOFT_DASHBOARD_DEV_PORT || env.APPALOFT_WEB_DEV_PORT, 4183),
    proxyTarget:
      env.APPALOFT_DASHBOARD_DEV_PROXY_TARGET ||
      env.APPALOFT_WEB_DEV_PROXY_TARGET ||
      "http://127.0.0.1:3001",
    extensionProxyPrefixes: extensionProxyPrefixes(
      env.APPALOFT_DASHBOARD_DEV_EXTENSION_PROXY_PREFIXES ||
        env.APPALOFT_WEB_DEV_EXTENSION_PROXY_PREFIXES,
    ),
  };
}

export function createDashboardDevProxy(
  config: DashboardDevServerConfig,
): Record<string, { target: string; changeOrigin: true }> {
  return Object.fromEntries(
    ["/api", ...config.extensionProxyPrefixes].map((prefix) => [
      prefix,
      { target: config.proxyTarget, changeOrigin: true as const },
    ]),
  );
}
