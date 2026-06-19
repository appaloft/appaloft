import { type AuthPublicConfig } from "@appaloft/contracts";

type PublicRuntimeConfig = {
  auth?: AuthPublicConfig;
  docs?: {
    basePath?: string;
  };
};

declare global {
  interface Window {
    __APPALOFT_PUBLIC_CONFIG__?: PublicRuntimeConfig;
  }
}

const defaultAuthPublicConfig: AuthPublicConfig = {
  schemaVersion: "appaloft.auth.public-config/v1",
  enabled: false,
  provider: "none",
  providers: [],
};

function readBooleanEnv(key: string, fallback: boolean): boolean {
  const value = (import.meta.env[key] as string | undefined)?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function fallbackAuthPublicConfig(): AuthPublicConfig {
  const githubConfigured = readBooleanEnv("VITE_APPALOFT_GITHUB_AUTH_ENABLED", false);
  return {
    ...defaultAuthPublicConfig,
    enabled: githubConfigured,
    provider: githubConfigured ? "better-auth" : "none",
    providers: [
      {
        key: "github",
        title: "GitHub",
        configured: githubConfigured,
        deferred: true,
        ...(githubConfigured
          ? { connectPath: "/api/auth/sign-in/social" }
          : { reason: "not-configured" }),
      },
    ],
  };
}

function isAuthPublicConfig(value: unknown): value is AuthPublicConfig {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as AuthPublicConfig).schemaVersion === "appaloft.auth.public-config/v1" &&
    Array.isArray((value as AuthPublicConfig).providers)
  );
}

export function readAuthPublicConfig(): AuthPublicConfig {
  if (
    typeof window !== "undefined" &&
    isAuthPublicConfig(window.__APPALOFT_PUBLIC_CONFIG__?.auth)
  ) {
    return window.__APPALOFT_PUBLIC_CONFIG__.auth;
  }

  return fallbackAuthPublicConfig();
}

export function isPublicGitHubAuthConfigured(config = readAuthPublicConfig()): boolean {
  return Boolean(config.providers.find((provider) => provider.key === "github")?.configured);
}
