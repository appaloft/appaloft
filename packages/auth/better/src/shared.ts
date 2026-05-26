import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

export interface AppaloftBetterAuthConfig {
  baseURL: string;
  secret: string;
  cookieDomain?: string;
  cookiePrefix?: string;
  database?: BetterAuthOptions["database"];
  minPasswordLength?: number;
  githubClientId?: string;
  githubClientSecret?: string;
  githubRedirectUri?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcDiscoveryUrl?: string;
  oidcIssuer?: string;
  oidcRedirectUri?: string;
  trustedProxyHeaders?: boolean;
  trustedOrigins?: readonly string[];
}

export interface AppaloftBetterAuthProviderConfig {
  github: boolean;
  google: boolean;
  oidc: boolean;
}

function joinBaseUrlPath(baseURL: string, path: string): string | undefined {
  try {
    const url = new URL(baseURL);
    url.pathname = `${url.pathname.replace(/\/+$/g, "")}${path}`;
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return undefined;
  }
}

export function resolveAppaloftBetterAuthRedirectUri(
  config: AppaloftBetterAuthConfig,
  provider: "github" | "google" | "oidc",
): string | undefined {
  if (provider === "github") {
    return config.githubRedirectUri ?? joinBaseUrlPath(config.baseURL, "/api/auth/callback/github");
  }
  if (provider === "google") {
    return config.googleRedirectUri ?? joinBaseUrlPath(config.baseURL, "/api/auth/callback/google");
  }

  return (
    config.oidcRedirectUri ?? joinBaseUrlPath(config.baseURL, "/api/auth/oauth2/callback/oidc")
  );
}

export function resolveAppaloftBetterAuthProviderConfig(
  config: AppaloftBetterAuthConfig,
): AppaloftBetterAuthProviderConfig {
  const hasTrustedOrigin = Boolean(config.trustedOrigins?.length);
  const githubRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "github");
  const googleRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "google");
  const oidcRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "oidc");

  return {
    github: Boolean(
      config.githubClientId && config.githubClientSecret && githubRedirectUri && hasTrustedOrigin,
    ),
    google: Boolean(
      config.googleClientId && config.googleClientSecret && googleRedirectUri && hasTrustedOrigin,
    ),
    oidc: Boolean(
      config.oidcClientId &&
        config.oidcClientSecret &&
        config.oidcDiscoveryUrl &&
        oidcRedirectUri &&
        hasTrustedOrigin,
    ),
  };
}

export function createAppaloftBetterAuthOptions(
  config: AppaloftBetterAuthConfig,
): BetterAuthOptions {
  const providers = resolveAppaloftBetterAuthProviderConfig(config);
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  const githubRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "github");
  const googleRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "google");
  const oidcRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "oidc");

  if (providers.github && config.githubClientId && config.githubClientSecret && githubRedirectUri) {
    socialProviders.github = {
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      redirectURI: githubRedirectUri,
    };
  }
  if (providers.google && config.googleClientId && config.googleClientSecret && googleRedirectUri) {
    socialProviders.google = {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectURI: googleRedirectUri,
    };
  }

  return {
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    ...(config.database ? { database: config.database } : {}),
    ...(config.trustedOrigins?.length ? { trustedOrigins: [...config.trustedOrigins] } : {}),
    account: {
      storeAccountCookie: true,
    },
    emailAndPassword: {
      enabled: true,
      ...(config.minPasswordLength ? { minPasswordLength: config.minPasswordLength } : {}),
    },
    advanced: {
      ...(config.cookiePrefix ? { cookiePrefix: config.cookiePrefix } : {}),
      ...(config.trustedProxyHeaders !== undefined
        ? { trustedProxyHeaders: config.trustedProxyHeaders }
        : {}),
      ...(config.cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: config.cookieDomain,
            },
          }
        : {}),
    },
    plugins: [
      bearer(),
      organization(),
      ...(providers.oidc &&
      config.oidcClientId &&
      config.oidcClientSecret &&
      config.oidcDiscoveryUrl &&
      oidcRedirectUri
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  clientId: config.oidcClientId,
                  clientSecret: config.oidcClientSecret,
                  discoveryUrl: config.oidcDiscoveryUrl,
                  redirectURI: oidcRedirectUri,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                  ...(config.oidcIssuer
                    ? {
                        issuer: config.oidcIssuer,
                        requireIssuerValidation: true,
                      }
                    : {}),
                },
              ],
            }),
          ]
        : []),
    ],
    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
  };
}

export function createAppaloftBetterAuth(config: AppaloftBetterAuthConfig) {
  const providers = resolveAppaloftBetterAuthProviderConfig(config);
  const oidcRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "oidc");
  if (
    providers.oidc &&
    config.oidcClientId &&
    config.oidcClientSecret &&
    config.oidcDiscoveryUrl &&
    oidcRedirectUri
  ) {
    return betterAuth({
      ...createAppaloftBetterAuthOptions(config),
      plugins: [
        bearer(),
        organization(),
        genericOAuth({
          config: [
            {
              providerId: "oidc",
              clientId: config.oidcClientId,
              clientSecret: config.oidcClientSecret,
              discoveryUrl: config.oidcDiscoveryUrl,
              redirectURI: oidcRedirectUri,
              scopes: ["openid", "email", "profile"],
              pkce: true,
              ...(config.oidcIssuer
                ? {
                    issuer: config.oidcIssuer,
                    requireIssuerValidation: true,
                  }
                : {}),
            },
          ],
        }),
      ],
    });
  }

  return betterAuth({
    ...createAppaloftBetterAuthOptions(config),
    plugins: [bearer(), organization()],
  });
}

export type AppaloftBetterAuth = ReturnType<typeof createAppaloftBetterAuth>;
