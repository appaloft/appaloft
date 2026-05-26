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

export function resolveAppaloftBetterAuthProviderConfig(
  config: AppaloftBetterAuthConfig,
): AppaloftBetterAuthProviderConfig {
  const hasTrustedOrigin = Boolean(config.trustedOrigins?.length);

  return {
    github: Boolean(
      config.githubClientId &&
        config.githubClientSecret &&
        config.githubRedirectUri &&
        hasTrustedOrigin,
    ),
    google: Boolean(
      config.googleClientId &&
        config.googleClientSecret &&
        config.googleRedirectUri &&
        hasTrustedOrigin,
    ),
    oidc: Boolean(
      config.oidcClientId &&
        config.oidcClientSecret &&
        config.oidcDiscoveryUrl &&
        config.oidcRedirectUri &&
        hasTrustedOrigin,
    ),
  };
}

export function createAppaloftBetterAuthOptions(
  config: AppaloftBetterAuthConfig,
): BetterAuthOptions {
  const providers = resolveAppaloftBetterAuthProviderConfig(config);
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (
    providers.github &&
    config.githubClientId &&
    config.githubClientSecret &&
    config.githubRedirectUri
  ) {
    socialProviders.github = {
      clientId: config.githubClientId,
      clientSecret: config.githubClientSecret,
      redirectURI: config.githubRedirectUri,
    };
  }
  if (
    providers.google &&
    config.googleClientId &&
    config.googleClientSecret &&
    config.googleRedirectUri
  ) {
    socialProviders.google = {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectURI: config.googleRedirectUri,
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
      config.oidcRedirectUri
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  clientId: config.oidcClientId,
                  clientSecret: config.oidcClientSecret,
                  discoveryUrl: config.oidcDiscoveryUrl,
                  redirectURI: config.oidcRedirectUri,
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
  if (
    providers.oidc &&
    config.oidcClientId &&
    config.oidcClientSecret &&
    config.oidcDiscoveryUrl &&
    config.oidcRedirectUri
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
              redirectURI: config.oidcRedirectUri,
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
