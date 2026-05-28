import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, emailOTP, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

export type AppaloftBetterAuthEmailOTPType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

export interface AppaloftBetterAuthEmailOTPInput {
  readonly email: string;
  readonly otp: string;
  readonly type: AppaloftBetterAuthEmailOTPType;
}

type BetterAuthEmailVerificationOptions = NonNullable<BetterAuthOptions["emailVerification"]>;

export const defaultAppaloftEmailOtpCooldownSeconds = 60;
export const defaultAppaloftEmailOtpLength = 6;

export interface AppaloftBetterAuthEmailOTPConfig {
  readonly enabled?: boolean;
  readonly allowedAttempts?: number;
  readonly cooldownSeconds?: number;
  readonly expiresIn?: number;
  readonly otpLength?: number;
  readonly rateLimit?: {
    readonly max: number;
    readonly window: number;
  };
  readonly resendStrategy?: "rotate" | "reuse";
  readonly storeOTP?: "plain" | "hashed" | "encrypted";
}

export interface AppaloftBetterAuthEmailVerificationConfig {
  readonly enabled?: boolean;
  readonly autoSignInAfterVerification?: boolean;
  readonly expiresIn?: number;
  readonly otp?: AppaloftBetterAuthEmailOTPConfig;
  readonly requireEmailVerification?: boolean;
  readonly sendOnSignIn?: boolean;
  readonly sendOnSignUp?: boolean;
  readonly sendVerificationEmail?: BetterAuthEmailVerificationOptions["sendVerificationEmail"];
  readonly sendVerificationOTP?: (
    input: AppaloftBetterAuthEmailOTPInput,
    request?: Request,
  ) => Promise<void>;
}

export interface AppaloftBetterAuthConfig {
  baseURL: string;
  secret: string;
  cookieDomain?: string;
  cookiePrefix?: string;
  database?: BetterAuthOptions["database"];
  emailVerification?: AppaloftBetterAuthEmailVerificationConfig;
  rateLimit?: BetterAuthOptions["rateLimit"];
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

export interface AppaloftBetterAuthEmailVerificationStatus {
  cooldownSeconds?: number;
  enabled: boolean;
  otpLength?: number;
  otpEnabled: boolean;
  required: boolean;
  sendOtpPath?: string;
  verifyOtpPath?: string;
  verifyPagePath?: string;
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

export function resolveAppaloftBetterAuthEmailVerificationStatus(
  config: AppaloftBetterAuthConfig,
): AppaloftBetterAuthEmailVerificationStatus {
  const enabled = config.emailVerification?.enabled === true;
  const otpEnabled = enabled && config.emailVerification?.otp?.enabled === true;
  const cooldownSeconds = resolveEmailOtpCooldownSeconds(config);
  const otpLength = resolveEmailOtpLength(config);

  return {
    enabled,
    otpEnabled,
    required: enabled && config.emailVerification?.requireEmailVerification === true,
    ...(otpEnabled
      ? {
          cooldownSeconds,
          otpLength,
          sendOtpPath: "/api/auth/email-otp/send-verification-otp",
          verifyOtpPath: "/api/auth/email-otp/verify-email",
          verifyPagePath: "/verify-email",
        }
      : {}),
  };
}

function createEmailVerificationOptions(
  config: AppaloftBetterAuthConfig,
): BetterAuthOptions["emailVerification"] | undefined {
  const policy = config.emailVerification;
  if (!policy?.enabled) {
    return undefined;
  }

  return {
    ...(policy.sendVerificationEmail
      ? { sendVerificationEmail: policy.sendVerificationEmail }
      : {}),
    sendOnSignUp: policy.sendOnSignUp ?? policy.requireEmailVerification ?? false,
    sendOnSignIn: policy.sendOnSignIn ?? policy.requireEmailVerification ?? false,
    autoSignInAfterVerification: policy.autoSignInAfterVerification ?? true,
    ...(policy.expiresIn ? { expiresIn: policy.expiresIn } : {}),
  };
}

export function createAppaloftBetterAuthOptions(config: AppaloftBetterAuthConfig) {
  const providers = resolveAppaloftBetterAuthProviderConfig(config);
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  const githubRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "github");
  const googleRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "google");
  const oidcRedirectUri = resolveAppaloftBetterAuthRedirectUri(config, "oidc");
  const emailVerification = createEmailVerificationOptions(config);
  const emailVerificationStatus = resolveAppaloftBetterAuthEmailVerificationStatus(config);
  const otpSendRateLimit =
    config.emailVerification?.otp?.rateLimit ??
    (emailVerificationStatus.otpEnabled
      ? {
          max: 1,
          window: emailVerificationStatus.cooldownSeconds ?? defaultAppaloftEmailOtpCooldownSeconds,
        }
      : undefined);

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
    ...(config.rateLimit || emailVerificationStatus.otpEnabled
      ? {
          rateLimit: {
            ...(config.rateLimit ?? {}),
            ...(emailVerificationStatus.otpEnabled ? { enabled: true } : {}),
            ...(otpSendRateLimit
              ? {
                  customRules: {
                    ...(config.rateLimit?.customRules ?? {}),
                    "/email-otp/send-verification-otp": otpSendRateLimit,
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(config.trustedOrigins?.length ? { trustedOrigins: [...config.trustedOrigins] } : {}),
    account: {
      storeAccountCookie: true,
    },
    emailAndPassword: {
      enabled: true,
      ...(emailVerificationStatus.required ? { requireEmailVerification: true } : {}),
      ...(config.minPasswordLength ? { minPasswordLength: config.minPasswordLength } : {}),
    },
    ...(emailVerification ? { emailVerification } : {}),
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
      ...(emailVerificationStatus.otpEnabled && config.emailVerification?.sendVerificationOTP
        ? [
            emailOTP({
              ...(config.emailVerification.otp?.allowedAttempts
                ? { allowedAttempts: config.emailVerification.otp.allowedAttempts }
                : {}),
              ...((config.emailVerification.otp?.expiresIn ?? config.emailVerification.expiresIn)
                ? {
                    expiresIn:
                      config.emailVerification.otp?.expiresIn ?? config.emailVerification.expiresIn,
                  }
                : {}),
              ...(config.emailVerification.otp?.otpLength
                ? { otpLength: config.emailVerification.otp.otpLength }
                : {}),
              overrideDefaultEmailVerification: true,
              ...(config.emailVerification.otp?.resendStrategy
                ? { resendStrategy: config.emailVerification.otp.resendStrategy }
                : {}),
              sendVerificationOTP: async (input) =>
                config.emailVerification?.sendVerificationOTP?.(input),
              ...(config.emailVerification.otp?.storeOTP
                ? { storeOTP: config.emailVerification.otp.storeOTP }
                : {}),
            }),
          ]
        : []),
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
  } satisfies BetterAuthOptions;
}

export function createAppaloftBetterAuth(config: AppaloftBetterAuthConfig) {
  return betterAuth(createAppaloftBetterAuthOptions(config));
}

export type AppaloftBetterAuth = ReturnType<typeof createAppaloftBetterAuth>;

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function resolveEmailOtpCooldownSeconds(config: AppaloftBetterAuthConfig): number {
  return (
    positiveInteger(config.emailVerification?.otp?.cooldownSeconds) ??
    positiveInteger(config.emailVerification?.otp?.rateLimit?.window) ??
    defaultAppaloftEmailOtpCooldownSeconds
  );
}

function resolveEmailOtpLength(config: AppaloftBetterAuthConfig): number {
  return positiveInteger(config.emailVerification?.otp?.otpLength) ?? defaultAppaloftEmailOtpLength;
}
