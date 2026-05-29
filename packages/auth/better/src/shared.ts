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
type BetterAuthEmailAndPasswordOptions = NonNullable<BetterAuthOptions["emailAndPassword"]>;

export const defaultAppaloftAccountRecoveryCooldownSeconds = 60;
export const defaultAppaloftEmailOtpCooldownSeconds = 60;
export const defaultAppaloftEmailOtpLength = 6;

export interface AppaloftBetterAuthEmailOTPConfig {
  readonly enabled?: boolean;
  readonly allowedAttempts?: number;
  readonly changeEmail?: {
    readonly enabled?: boolean;
    readonly verifyCurrentEmail?: boolean;
  };
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

export interface AppaloftBetterAuthAccountRecoveryConfig {
  readonly cooldownSeconds?: number;
  readonly enabled?: boolean;
  readonly rateLimit?: {
    readonly max: number;
    readonly window: number;
  };
  readonly resetPasswordTokenExpiresIn?: number;
  readonly revokeSessionsOnPasswordReset?: boolean;
  readonly sendResetPassword?: BetterAuthEmailAndPasswordOptions["sendResetPassword"];
}

export interface AppaloftBetterAuthConfig {
  baseURL: string;
  secret: string;
  accountRecovery?: AppaloftBetterAuthAccountRecoveryConfig;
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
  changeEmail?: {
    cooldownSeconds?: number;
    enabled: boolean;
    requestPath?: string;
    verifyCurrentEmail?: boolean;
    verifyPath?: string;
  };
  cooldownSeconds?: number;
  enabled: boolean;
  otpLength?: number;
  otpEnabled: boolean;
  required: boolean;
  sendOtpPath?: string;
  verifyOtpPath?: string;
  verifyPagePath?: string;
}

export interface AppaloftBetterAuthAccountRecoveryStatus {
  cooldownSeconds?: number;
  enabled: boolean;
  forgotPasswordPagePath?: string;
  requestPath?: string;
  resetPagePath?: string;
  resetPath?: string;
}

export interface AppaloftBetterAuthAccountSecurityStatus {
  changePasswordPath?: string;
  enabled: boolean;
  pagePath?: string;
  passwordState: "not-set" | "set" | "unknown";
  setPasswordPath?: string;
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
    ...(otpEnabled
      ? {
          changeEmail: {
            enabled: config.emailVerification?.otp?.changeEmail?.enabled === true,
            ...(config.emailVerification?.otp?.changeEmail?.enabled === true
              ? {
                  cooldownSeconds,
                  requestPath: "/api/auth/email-otp/request-email-change",
                  verifyCurrentEmail:
                    config.emailVerification.otp.changeEmail.verifyCurrentEmail === true,
                  verifyPath: "/api/auth/email-otp/change-email",
                }
              : {}),
          },
        }
      : {}),
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

export function resolveAppaloftBetterAuthAccountRecoveryStatus(
  config: AppaloftBetterAuthConfig,
): AppaloftBetterAuthAccountRecoveryStatus {
  const enabled =
    config.accountRecovery?.enabled === true &&
    typeof config.accountRecovery.sendResetPassword === "function";
  const cooldownSeconds = resolveAccountRecoveryCooldownSeconds(config);

  return {
    enabled,
    ...(enabled
      ? {
          cooldownSeconds,
          forgotPasswordPagePath: "/forgot-password",
          requestPath: "/api/auth/request-password-reset",
          resetPagePath: "/reset-password",
          resetPath: "/api/auth/reset-password",
        }
      : {}),
  };
}

export function resolveAppaloftBetterAuthAccountSecurityStatus(input?: {
  readonly passwordState?: AppaloftBetterAuthAccountSecurityStatus["passwordState"];
}): AppaloftBetterAuthAccountSecurityStatus {
  return {
    changePasswordPath: "/api/auth/change-password",
    enabled: true,
    pagePath: "/account/security",
    passwordState: input?.passwordState ?? "unknown",
    setPasswordPath: "/api/auth/set-password",
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
  const accountRecoveryStatus = resolveAppaloftBetterAuthAccountRecoveryStatus(config);
  const emailVerificationStatus = resolveAppaloftBetterAuthEmailVerificationStatus(config);
  const accountRecoveryRateLimit =
    config.accountRecovery?.rateLimit ??
    (accountRecoveryStatus.enabled
      ? {
          max: 1,
          window:
            accountRecoveryStatus.cooldownSeconds ?? defaultAppaloftAccountRecoveryCooldownSeconds,
        }
      : undefined);
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
    ...(config.rateLimit || emailVerificationStatus.otpEnabled || accountRecoveryStatus.enabled
      ? {
          rateLimit: {
            ...(config.rateLimit ?? {}),
            ...(emailVerificationStatus.otpEnabled || accountRecoveryStatus.enabled
              ? { enabled: true }
              : {}),
            ...(otpSendRateLimit || accountRecoveryRateLimit
              ? {
                  customRules: {
                    ...(config.rateLimit?.customRules ?? {}),
                    ...(otpSendRateLimit
                      ? { "/email-otp/send-verification-otp": otpSendRateLimit }
                      : {}),
                    ...(otpSendRateLimit && emailVerificationStatus.changeEmail?.enabled
                      ? { "/email-otp/request-email-change": otpSendRateLimit }
                      : {}),
                    ...(accountRecoveryRateLimit
                      ? { "/request-password-reset": accountRecoveryRateLimit }
                      : {}),
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
      ...(accountRecoveryStatus.enabled && config.accountRecovery?.sendResetPassword
        ? {
            sendResetPassword: config.accountRecovery.sendResetPassword,
            ...(config.accountRecovery.resetPasswordTokenExpiresIn
              ? {
                  resetPasswordTokenExpiresIn: config.accountRecovery.resetPasswordTokenExpiresIn,
                }
              : {}),
            ...(config.accountRecovery.revokeSessionsOnPasswordReset !== undefined
              ? {
                  revokeSessionsOnPasswordReset:
                    config.accountRecovery.revokeSessionsOnPasswordReset,
                }
              : {}),
          }
        : {}),
    },
    ...(emailVerification ? { emailVerification } : {}),
    user: {
      deleteUser: {
        enabled: true,
      },
      ...(config.emailVerification?.otp?.changeEmail?.enabled
        ? {
            changeEmail: {
              enabled: true,
            },
          }
        : {}),
      additionalFields: {
        appaloftPendingVerificationIntent: {
          type: "string",
          input: true,
          required: false,
          returned: false,
        },
      },
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
              ...(config.emailVerification.otp?.changeEmail
                ? {
                    changeEmail: {
                      enabled: config.emailVerification.otp.changeEmail.enabled === true,
                      verifyCurrentEmail:
                        config.emailVerification.otp.changeEmail.verifyCurrentEmail === true,
                    },
                  }
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

function resolveAccountRecoveryCooldownSeconds(config: AppaloftBetterAuthConfig): number {
  return (
    positiveInteger(config.accountRecovery?.cooldownSeconds) ??
    positiveInteger(config.accountRecovery?.rateLimit?.window) ??
    defaultAppaloftAccountRecoveryCooldownSeconds
  );
}

function resolveEmailOtpLength(config: AppaloftBetterAuthConfig): number {
  return positiveInteger(config.emailVerification?.otp?.otpLength) ?? defaultAppaloftEmailOtpLength;
}
