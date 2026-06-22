import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExecutionContext } from "@appaloft/application";
import { makeSignature } from "better-auth/crypto";

import { BetterAuthRuntime, createBetterAuthRuntime } from "../src";
import {
  createAppaloftBetterAuthOptions,
  resolveAppaloftBetterAuthAccountRecoveryStatus,
  resolveAppaloftBetterAuthAccountSecurityStatus,
  resolveAppaloftBetterAuthEmailVerificationStatus,
  resolveAppaloftBetterAuthMagicLinkStatus,
  resolveAppaloftBetterAuthProviderConfig,
} from "../src/shared";

const context = {
  entrypoint: "system",
  locale: "en-US",
  requestId: "req_test",
  t: (key: string) => key,
  tracer: {
    startActiveSpan(_name: string, _options: object, callback: () => unknown) {
      return Promise.resolve(callback());
    },
  },
} as ExecutionContext;

async function signedBetterAuthCookieValue(token: string): Promise<string> {
  return `${token}.${await makeSignature(token, "test-secret-at-least-long-enough")}`;
}

async function signUpWithSessionCookie(
  runtime: ReturnType<typeof createBetterAuthRuntime>,
  input: { email: string; name: string },
): Promise<{ sessionCookie: string }> {
  const signedUp = await runtime.handle(
    new Request("http://localhost:3721/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        callbackURL: "/",
        email: input.email,
        name: input.name,
        password: "local-user-password",
        rememberMe: true,
      }),
    }),
  );
  const setCookie = signedUp.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
  expect(signedUp.status).toBe(200);
  expect(sessionCookie, setCookie).toBeTruthy();
  if (!sessionCookie) {
    throw new Error("Expected Better Auth session cookie after sign-up");
  }

  return { sessionCookie };
}

function requireSessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
  expect(sessionCookie, setCookie).toBeTruthy();
  if (!sessionCookie) {
    throw new Error("Expected Better Auth session cookie");
  }
  return sessionCookie;
}

describe("Better Auth first-admin bootstrap adapter", () => {
  test("[AUTH-SHARED-COOKIE-002] builds reusable Better Auth options for shared website sessions", () => {
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://www.appaloft.com",
      secret: "test-secret-at-least-long-enough",
      cookieDomain: ".appaloft.com",
      cookiePrefix: "better-auth",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      githubRedirectUri: "https://www.appaloft.com/api/auth/callback/github",
      trustedOrigins: ["https://www.appaloft.com", "https://app.appaloft.com"],
      trustedProxyHeaders: true,
    });

    expect(options.basePath).toBe("/api/auth");
    expect(options.trustedOrigins).toEqual([
      "https://www.appaloft.com",
      "https://app.appaloft.com",
    ]);
    expect(options.advanced).toMatchObject({
      cookiePrefix: "better-auth",
      crossSubDomainCookies: {
        enabled: true,
        domain: ".appaloft.com",
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      trustedProxyHeaders: true,
      useSecureCookies: true,
    });
    expect(options.socialProviders).toMatchObject({
      github: {
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
        redirectURI: "https://www.appaloft.com/api/auth/callback/github",
      },
    });
    expect(
      resolveAppaloftBetterAuthProviderConfig({
        baseURL: "https://www.appaloft.com",
        secret: "test-secret-at-least-long-enough",
        githubClientId: "github-client-id",
        githubClientSecret: "github-client-secret",
        githubRedirectUri: "https://www.appaloft.com/api/auth/callback/github",
        trustedOrigins: ["https://www.appaloft.com"],
      }).github,
    ).toBe(true);
  });

  test("[AUTH-SESSION-COOKIE-003] keeps local development cookies non-forced while preserving CSRF and origin checks", () => {
    const options = createAppaloftBetterAuthOptions({
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      trustedOrigins: ["http://localhost:3721"],
    });

    expect(options.trustedOrigins).toEqual(["http://localhost:3721"]);
    expect(options.advanced).toMatchObject({
      disableCSRFCheck: false,
      disableOriginCheck: false,
    });
    expect(options.advanced).not.toHaveProperty("useSecureCookies");
  });

  test("[AUTH-GITHUB-OAUTH-001] derives GitHub callback URL from the Better Auth base URL", () => {
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://app.appaloft.com",
      secret: "test-secret-at-least-long-enough",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      trustedOrigins: ["https://app.appaloft.com"],
    });

    expect(options.socialProviders).toMatchObject({
      github: {
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
        redirectURI: "https://app.appaloft.com/api/auth/callback/github",
      },
    });
    expect(
      resolveAppaloftBetterAuthProviderConfig({
        baseURL: "https://app.appaloft.com",
        secret: "test-secret-at-least-long-enough",
        githubClientId: "github-client-id",
        githubClientSecret: "github-client-secret",
        trustedOrigins: ["https://app.appaloft.com"],
      }).github,
    ).toBe(true);
  });

  test("[CLOUD-AUTH-EMAIL-001] leaves email verification disabled by default", () => {
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
    });

    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
    });
    expect(options.emailAndPassword).not.toHaveProperty("requireEmailVerification");
    expect(options.emailVerification).toBeUndefined();
    expect(options.emailAndPassword).not.toHaveProperty("sendResetPassword");
    expect(options.user).toMatchObject({
      deleteUser: {
        enabled: true,
      },
    });
    expect(options.rateLimit?.customRules).not.toHaveProperty("/request-password-reset");
    expect(options.plugins?.map((plugin) => plugin.id)).not.toContain("email-otp");
    expect(options.plugins?.map((plugin) => plugin.id)).not.toContain("magic-link");
    expect(
      resolveAppaloftBetterAuthEmailVerificationStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
      }),
    ).toEqual({
      enabled: false,
      otpEnabled: false,
      required: false,
    });
    expect(
      resolveAppaloftBetterAuthAccountRecoveryStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
      }),
    ).toEqual({
      enabled: false,
    });
    expect(
      resolveAppaloftBetterAuthMagicLinkStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
      }),
    ).toEqual({
      enabled: false,
    });
    expect(resolveAppaloftBetterAuthAccountSecurityStatus()).toEqual({
      changePasswordPath: "/api/auth/change-password",
      enabled: true,
      pagePath: "/account/security",
      passwordState: "unknown",
      setPasswordPath: "/api/auth/set-password",
    });
  });

  test("[CLOUD-AUTH-ACCOUNT-001][CLOUD-AUTH-ACCOUNT-002] registers neutral account recovery only when injected", () => {
    const sendResetPassword = async () => undefined;
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
      accountRecovery: {
        enabled: true,
        cooldownSeconds: 45,
        resetPasswordTokenExpiresIn: 600,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword,
      },
    });

    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      resetPasswordTokenExpiresIn: 600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword,
    });
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      customRules: {
        "/request-password-reset": {
          max: 1,
          window: 45,
        },
      },
    });
    expect(
      resolveAppaloftBetterAuthAccountRecoveryStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
        accountRecovery: {
          enabled: true,
          sendResetPassword,
        },
      }),
    ).toEqual({
      cooldownSeconds: 60,
      enabled: true,
      forgotPasswordPagePath: "/forgot-password",
      requestPath: "/api/auth/request-password-reset",
      resetPagePath: "/reset-password",
      resetPath: "/api/auth/reset-password",
    });
  });

  test("[ORG-TEAM-INVITE-002] registers neutral organization invitation delivery when injected", () => {
    const sendInvitationEmail = async () => undefined;
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
      organization: {
        sendInvitationEmail,
      },
    });

    const organizationPlugin = options.plugins?.find((plugin) => plugin.id === "organization") as
      | { options?: { sendInvitationEmail?: unknown } }
      | undefined;
    expect(organizationPlugin?.options?.sendInvitationEmail).toBe(sendInvitationEmail);
  });

  test("[CLOUD-AUTH-EMAIL-010] registers neutral magic-link policy only when a sender is injected", () => {
    const optionsWithoutSender = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
      magicLink: {
        enabled: true,
      },
    });
    expect(optionsWithoutSender.plugins?.map((plugin) => plugin.id)).not.toContain("magic-link");
    expect(
      resolveAppaloftBetterAuthMagicLinkStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
        magicLink: {
          enabled: true,
        },
      }),
    ).toEqual({
      enabled: false,
    });

    const sendMagicLink = async () => undefined;
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
      magicLink: {
        enabled: true,
        cooldownSeconds: 45,
        expiresIn: 600,
        sendMagicLink,
        storeToken: "hashed",
      },
    });

    expect(options.plugins?.map((plugin) => plugin.id)).toContain("magic-link");
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      customRules: {
        "/sign-in/magic-link": {
          max: 1,
          window: 45,
        },
      },
    });
    expect(
      resolveAppaloftBetterAuthMagicLinkStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
        magicLink: {
          enabled: true,
          sendMagicLink,
        },
      }),
    ).toEqual({
      cooldownSeconds: 60,
      enabled: true,
      requestPath: "/api/auth/sign-in/magic-link",
      verifyPath: "/api/auth/magic-link/verify",
    });
  });

  test("[CLOUD-AUTH-EMAIL-002][CLOUD-AUTH-ACCOUNT-010] registers neutral email verification and change-email OTP policy when injected", () => {
    const options = createAppaloftBetterAuthOptions({
      baseURL: "https://appaloft.example.com",
      secret: "test-secret-at-least-long-enough",
      emailVerification: {
        enabled: true,
        requireEmailVerification: true,
        sendVerificationOTP: async () => undefined,
        otp: {
          enabled: true,
          cooldownSeconds: 45,
          expiresIn: 600,
          otpLength: 6,
          storeOTP: "hashed",
          changeEmail: {
            enabled: true,
            verifyCurrentEmail: false,
          },
        },
      },
    });
    expect(options.rateLimit).toMatchObject({ enabled: true });
    expect(options.rateLimit?.customRules).toMatchObject({
      "/email-otp/send-verification-otp": {
        max: 1,
        window: 45,
      },
      "/email-otp/request-email-change": {
        max: 1,
        window: 45,
      },
    });
    const emailOtpPlugin = options.plugins?.find((plugin) => plugin.id === "email-otp");
    const resendRateLimit = emailOtpPlugin?.rateLimit?.find((rule) =>
      rule.pathMatcher("/email-otp/send-verification-otp"),
    );
    expect(resendRateLimit).toMatchObject({
      max: 3,
      window: 60,
    });

    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
    });
    expect(options.user).toMatchObject({
      changeEmail: {
        enabled: true,
      },
    });
    expect(options.emailVerification).toMatchObject({
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
      sendOnSignUp: true,
    });
    expect(options.plugins?.map((plugin) => plugin.id)).toContain("email-otp");
    expect(
      resolveAppaloftBetterAuthEmailVerificationStatus({
        baseURL: "https://appaloft.example.com",
        secret: "test-secret-at-least-long-enough",
        emailVerification: {
          enabled: true,
          requireEmailVerification: true,
          sendVerificationOTP: async () => undefined,
          otp: {
            enabled: true,
            changeEmail: {
              enabled: true,
            },
          },
        },
      }),
    ).toEqual({
      changeEmail: {
        cooldownSeconds: 60,
        enabled: true,
        requestPath: "/api/auth/email-otp/request-email-change",
        verifyCurrentEmail: false,
        verifyPath: "/api/auth/email-otp/change-email",
      },
      cooldownSeconds: 60,
      enabled: true,
      otpLength: 6,
      otpEnabled: true,
      required: true,
      sendOtpPath: "/api/auth/email-otp/send-verification-otp",
      verifyOtpPath: "/api/auth/email-otp/verify-email",
      verifyPagePath: "/verify-email",
    });
  });

  test("[AUTH-SESSION-001] requires a login when better-auth is enabled and no session exists", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const status = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session"),
    );

    expect(status).toMatchObject({
      accountSecurity: {
        enabled: true,
        passwordState: "unknown",
      },
      accountRecovery: {
        enabled: false,
      },
      enabled: true,
      emailVerification: {
        enabled: false,
        otpEnabled: false,
        required: false,
      },
      magicLink: {
        enabled: false,
      },
      provider: "better-auth",
      loginRequired: true,
      session: null,
    });
  });

  test("[AUTH-SESSION-005] keeps configured providers visible when session read fails", async () => {
    const runtime = new BetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      githubRedirectUri: "http://localhost:3721/api/auth/callback/github",
      trustedOrigins: ["http://localhost:3721"],
    });
    (runtime as unknown as { auth: unknown }).auth = {
      api: {
        async getSession() {
          throw new Error("session-read-failed");
        },
      },
    };

    const status = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: "better-auth.session_token=stale-session",
        },
      }),
    );

    expect(status).toMatchObject({
      accountSecurity: {
        enabled: true,
        passwordState: "unknown",
      },
      enabled: true,
      loginRequired: true,
      provider: "better-auth",
      session: null,
    });
    expect(status.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "github",
          configured: true,
          connected: false,
        }),
      ]),
    );
  });

  test("[AUTH-SESSION-006] keeps provider status usable when connected account read fails", async () => {
    const runtime = new BetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      githubRedirectUri: "http://localhost:3721/api/auth/callback/github",
      trustedOrigins: ["http://localhost:3721"],
    });
    (runtime as unknown as { auth: unknown }).auth = {
      api: {
        async getSession() {
          return {
            session: {
              activeOrganizationId: "org_test",
              userId: "usr_test",
            },
            user: {
              email: "owner@appaloft.test",
              id: "usr_test",
              name: "Owner",
            },
          };
        },
        async listUserAccounts() {
          throw new Error("account-read-failed");
        },
        async listOrganizations() {
          throw new Error("organization-read-failed");
        },
      },
    };

    const status = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: "better-auth.session_token=current-session",
        },
      }),
    );

    expect(status).toMatchObject({
      accountSecurity: {
        enabled: true,
        passwordState: "not-set",
      },
      enabled: true,
      loginRequired: false,
      provider: "better-auth",
    });
    expect(status.currentUserOrganizationCount).toBeUndefined();
    expect(status.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "github",
          configured: true,
          connected: false,
        }),
      ]),
    );
  });

  test("[AUTH-SESSION-004] reuses session and active role reads inside one execution context", async () => {
    const runtime = new BetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });
    let getSessionCalls = 0;
    let getActiveMemberRoleCalls = 0;
    let listOrganizationsCalls = 0;
    (runtime as unknown as { auth: unknown }).auth = {
      api: {
        async getSession() {
          getSessionCalls += 1;
          return {
            session: {
              activeOrganizationId: "org_test",
              userId: "usr_test",
            },
            user: {
              email: "owner@appaloft.test",
              id: "usr_test",
              name: "Owner",
            },
          };
        },
        async getActiveMemberRole() {
          getActiveMemberRoleCalls += 1;
          return { role: "owner" };
        },
        async listOrganizations() {
          listOrganizationsCalls += 1;
          return [
            {
              id: "org_test",
              name: "Test Organization",
              role: "owner",
              slug: "test-organization",
            },
          ];
        },
      },
    };
    const requestContext = {
      ...context,
      auth: {
        cookieHeader: "better-auth.session_token=test",
      },
    } satisfies ExecutionContext;

    const authorized = await runtime.authorizeProductSession(requestContext, {
      cookieHeader: "better-auth.session_token=test",
      method: "GET",
      path: "/api/rpc/deployments/list",
      requiredRole: "member",
    });
    const currentContext = await runtime.getCurrentContext(requestContext);

    expect(authorized.isOk()).toBe(true);
    expect(currentContext.isOk()).toBe(true);
    expect(getSessionCalls).toBe(1);
    expect(getActiveMemberRoleCalls).toBe(1);
    expect(listOrganizationsCalls).toBe(1);
  });

  test("[FIRST-ADMIN-BOOTSTRAP-004] creates local user and organization through Appaloft port", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const result = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
      password: "local-admin-password",
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      email: "admin@example.com",
      organizationId: "org_self_hosted",
      organizationSlug: "self-hosted-appaloft",
    });
    expect(result._unsafeUnwrap().userId.length).toBeGreaterThan(0);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("local-admin-password");
  });

  test("[FIRST-ADMIN-BOOTSTRAP-004] attaches the first admin to an existing self-hosted organization", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });
    const authContext = await runtime.auth.$context;
    await authContext.adapter.create({
      model: "organization",
      data: {
        id: "org_self_hosted",
        name: "Self-hosted Appaloft",
        slug: "self-hosted-appaloft",
        logo: null,
        metadata: null,
        createdAt: new Date(),
      },
      forceAllowId: true,
    });

    const result = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
      password: "local-admin-password",
    });
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      email: "admin@example.com",
      organizationId: "org_self_hosted",
      organizationSlug: "self-hosted-appaloft",
    });

    const signedIn = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 Appaloft Settings Test AppleWebKit/537.36 Chrome/148.0.7778.97 Safari/537.36",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "admin@example.com",
          password: "local-admin-password",
        }),
      }),
    );
    const sessionCookie = (signedIn.headers.get("set-cookie") ?? "").match(
      /better-auth\.session_token=[^;,]+/,
    )?.[0];
    expect(signedIn.status).toBe(200);
    expect(sessionCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after first-admin sign-in");
    }

    const authorizationResult = await runtime.authorizeProductSession(context, {
      method: "POST",
      path: "/api/domain-bindings",
      requiredRole: "member",
      cookieHeader: sessionCookie,
    });
    expect(authorizationResult.isOk()).toBe(true);
    expect(authorizationResult._unsafeUnwrap()).toMatchObject({
      organizationId: "org_self_hosted",
      role: "owner",
      userId: result._unsafeUnwrap().userId,
    });
  });

  test("[FIRST-ADMIN-BOOTSTRAP-008] honors configured local password length for test runtimes", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      minPasswordLength: 1,
    });

    const result = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
      password: "admin",
    });

    expect(result.isOk()).toBe(true);

    const signedIn = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 Appaloft Settings Test AppleWebKit/537.36 Chrome/148.0.7778.97 Safari/537.36",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "admin@example.com",
          password: "admin",
        }),
      }),
    );
    expect(signedIn.status).toBe(200);
  });

  test("[FIRST-ADMIN-BOOTSTRAP-009] first admin sign-in bypasses required email verification because bootstrap proves ownership", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      emailVerification: {
        enabled: true,
        requireEmailVerification: true,
        sendOnSignIn: true,
        sendOnSignUp: true,
        sendVerificationEmail: async () => undefined,
      },
    });

    const result = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
      password: "local-admin-password",
    });

    expect(result.isOk()).toBe(true);

    const signedIn = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "admin@example.com",
          password: "local-admin-password",
        }),
      }),
    );
    const setCookie = signedIn.headers.get("set-cookie") ?? "";
    expect(signedIn.status).toBe(200);
    expect(setCookie).toContain("better-auth.session_token=");
  });

  test("[CLOUD-AUTH-ACCOUNT-011] unverified local-password sign-in returns a stable error code", async () => {
    const verificationEmails: unknown[] = [];
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      emailVerification: {
        enabled: true,
        requireEmailVerification: true,
        sendOnSignIn: true,
        sendOnSignUp: true,
        sendVerificationEmail: async (input) => {
          verificationEmails.push(input);
        },
      },
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "unverified@example.com",
          name: "Unverified User",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    expect(signedUp.status).toBe(200);
    expect(signedUp.headers.get("set-cookie") ?? "").not.toContain("better-auth.session_token=");
    expect(verificationEmails).toHaveLength(1);

    const signedIn = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "unverified@example.com",
          password: "local-user-password",
        }),
      }),
    );
    expect(signedIn.status).toBe(403);
    const errorBody = (await signedIn.json()) as { code?: unknown; message?: unknown };
    expect(errorBody).toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(typeof errorBody.message).toBe("string");
  });

  test("[PRODUCT-AUTH-SIGNUP-001] ordinary signup creates a session and organization", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "user@example.com",
          name: "User Example",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const setCookie = signedUp.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie, setCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after ordinary sign-up");
    }

    const createdOrganization = await runtime.handle(
      new Request("http://localhost:3721/api/auth/organization/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
          origin: "http://localhost:3721",
        },
        body: JSON.stringify({
          name: "Acme",
          slug: "acme",
        }),
      }),
    );
    expect(createdOrganization.status).toBe(200);
    const organization = (await createdOrganization.json()) as { id?: unknown; slug?: unknown };
    expect(organization.slug).toBe("acme");
    expect(typeof organization.id).toBe("string");

    const authorizationResult = await runtime.authorizeProductSession(context, {
      method: "POST",
      path: "/api/rpc/projects/list",
      requiredRole: "member",
      cookieHeader: sessionCookie,
    });

    expect(authorizationResult.isOk()).toBe(true);
    expect(authorizationResult._unsafeUnwrap()).toMatchObject({
      organizationId: organization.id,
      role: "owner",
    });
  });

  test("[CLOUD-AUTH-ACCOUNT-009] reports signed-in password state and supports password lifecycle endpoints", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "password-user@example.com",
          name: "Password User",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const sessionCookie = (signedUp.headers.get("set-cookie") ?? "").match(
      /better-auth\.session_token=[^;,]+/,
    )?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const sessionStatus = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: sessionCookie,
        },
      }),
    );
    expect(sessionStatus.accountSecurity).toEqual({
      changePasswordPath: "/api/auth/change-password",
      enabled: true,
      pagePath: "/account/security",
      passwordState: "set",
      setPasswordPath: "/api/auth/set-password",
    });

    const changedPassword = await runtime.handle(
      new Request("http://localhost:3721/api/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
          origin: "http://localhost:3721",
        },
        body: JSON.stringify({
          currentPassword: "local-user-password",
          newPassword: "local-user-password-updated",
          revokeOtherSessions: false,
        }),
      }),
    );
    expect(changedPassword.status).toBe(200);

    const signedInWithUpdatedPassword = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "password-user@example.com",
          password: "local-user-password-updated",
        }),
      }),
    );
    expect(signedInWithUpdatedPassword.status).toBe(200);

    const context = await runtime.auth.$context;
    const oauthOnlyUser = await context.internalAdapter.createUser({
      email: "oauth-only@example.com",
      emailVerified: true,
      name: "OAuth Only",
    });
    await context.internalAdapter.createAccount({
      accountId: oauthOnlyUser.id,
      providerId: "github",
      userId: oauthOnlyUser.id,
    });
    const oauthOnlySession = await context.internalAdapter.createSession(oauthOnlyUser.id);
    const oauthOnlyCookie = `better-auth.session_token=${await signedBetterAuthCookieValue(
      oauthOnlySession.token,
    )}`;
    const oauthOnlyStatus = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: oauthOnlyCookie,
        },
      }),
    );
    expect(oauthOnlyStatus.accountSecurity.passwordState).toBe("not-set");

    const setPassword = await runtime.handle(
      new Request("http://localhost:3721/api/auth/set-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: oauthOnlyCookie,
          origin: "http://localhost:3721",
        },
        body: JSON.stringify({
          newPassword: "oauth-user-local-password",
        }),
      }),
    );
    expect(setPassword.status).toBe(200);

    const oauthPasswordStatus = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: oauthOnlyCookie,
        },
      }),
    );
    expect(oauthPasswordStatus.accountSecurity.passwordState).toBe("set");
  });

  test("[ACCOUNT-SETTINGS-PROFILE-001] [ACCOUNT-SETTINGS-SESSION-001] exposes safe account settings through Appaloft port", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 Appaloft Settings Test AppleWebKit/537.36 Chrome/148.0.7778.97 Safari/537.36",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "settings-user@example.com",
          name: "Settings User",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const sessionCookie = (signedUp.headers.get("set-cookie") ?? "").match(
      /better-auth\.session_token=[^;,]+/,
    )?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const portContext = {
      ...context,
      auth: { cookieHeader: sessionCookie },
      requestId: "req_account_settings",
    };
    const cliSessionCookie = await runtime.issueCliProductSessionCookie(
      new Request("http://localhost:3721/cli-auth/authorize", {
        headers: {
          cookie: sessionCookie,
          "x-forwarded-for": "203.0.113.9",
        },
      }),
    );
    expect(cliSessionCookie).toContain("better-auth.session_token=");
    expect(cliSessionCookie).not.toBe(sessionCookie);
    if (!cliSessionCookie) {
      throw new Error("Expected CLI product session cookie after browser authorization");
    }
    const cliAuthorizationResult = await runtime.authorizeProductSession(context, {
      method: "GET",
      path: "/api/organizations/current-context",
      requiredRole: "member",
      cookieHeader: cliSessionCookie,
    });
    expect(cliAuthorizationResult.isOk()).toBe(true);

    const cliSessionBearer = await runtime.issueCliProductSessionBearer(
      new Request("http://localhost:3721/cli-auth/authorize", {
        headers: {
          cookie: sessionCookie,
          "x-forwarded-for": "203.0.113.9",
        },
      }),
    );
    expect(cliSessionBearer).toContain(".");
    expect(cliSessionBearer).not.toContain("better-auth.session_token=");
    if (!cliSessionBearer) {
      throw new Error("Expected CLI product session bearer after browser authorization");
    }
    const cliBearerAuthorizationResult = await runtime.authorizeProductSession(context, {
      method: "POST",
      path: "/mcp",
      requiredRole: "member",
      authorizationHeader: `Bearer ${cliSessionBearer}`,
    });
    expect(cliBearerAuthorizationResult.isOk()).toBe(true);

    const shown = await runtime.showAccountProfile(portContext);
    const updated = await runtime.changeAccountProfile(portContext, {
      displayName: "Renamed Settings User",
      avatarUrl: "https://example.com/avatar.png",
    });
    const sessions = await runtime.listAccountSessions(portContext);
    const sessionId = sessions.isOk() ? sessions.value.items[0]?.sessionId : undefined;

    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap()).toMatchObject({
      email: "settings-user@example.com",
      displayName: "Settings User",
      emailVerified: false,
    });
    expect(updated.isOk()).toBe(true);
    expect(updated._unsafeUnwrap()).toMatchObject({
      displayName: "Renamed Settings User",
      avatarUrl: "https://example.com/avatar.png",
    });
    expect(sessions.isOk()).toBe(true);
    expect(sessions._unsafeUnwrap().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientKind: "web",
          current: true,
          displayName: "Chrome",
          userId: shown._unsafeUnwrap().userId,
        }),
        expect.objectContaining({
          clientKind: "cli",
          displayName: "Appaloft CLI",
          userId: shown._unsafeUnwrap().userId,
        }),
      ]),
    );
    expect(JSON.stringify(sessions._unsafeUnwrap())).not.toContain("local-user-password");
    expect(JSON.stringify(sessions._unsafeUnwrap())).not.toContain("token");

    if (!sessionId) {
      throw new Error("Expected a session id before revocation");
    }
    const revoked = await runtime.revokeAccountSession(portContext, { sessionId });
    expect(revoked.isOk()).toBe(true);
    expect(revoked._unsafeUnwrap()).toMatchObject({ sessionId });
  });

  test("[ACCOUNT-SETTINGS-DANGER-001] deletes the signed-in account through Appaloft port", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "delete-user@example.com",
          name: "Delete User",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const sessionCookie = (signedUp.headers.get("set-cookie") ?? "").match(
      /better-auth\.session_token=[^;,]+/,
    )?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const portContext = {
      ...context,
      auth: { cookieHeader: sessionCookie },
      requestId: "req_account_delete",
    };
    const profile = await runtime.showAccountProfile(portContext);
    expect(profile.isOk()).toBe(true);
    const deleted = await runtime.deleteAccount(portContext, {
      confirmation: {
        userId: profile._unsafeUnwrap().userId,
      },
    });

    expect(deleted.isOk()).toBe(true);
    expect(deleted._unsafeUnwrap()).toMatchObject({
      userId: profile._unsafeUnwrap().userId,
    });
    const afterDelete = await runtime.showAccountProfile(portContext);
    expect(afterDelete.isErr()).toBe(true);
  });

  test("[ORG-SETTINGS-PROFILE-001] [ORG-SETTINGS-DANGER-001] updates and deletes organization settings through Appaloft-owned methods", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "org-settings@example.com",
          name: "Org Settings",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const sessionCookie = (signedUp.headers.get("set-cookie") ?? "").match(
      /better-auth\.session_token=[^;,]+/,
    )?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const portContext = {
      ...context,
      auth: { cookieHeader: sessionCookie },
      requestId: "req_organization_settings",
    };
    const current = await runtime.getCurrentContext(portContext);
    expect(current.isOk()).toBe(true);
    const organizationId = current._unsafeUnwrap().currentOrganization.organizationId;
    const shown = await runtime.showOrganizationProfile(portContext, { organizationId });
    const updated = await runtime.changeOrganizationProfile(portContext, {
      organizationId,
      name: "Renamed Org Settings",
      slug: "renamed-org-settings",
      logoUrl: "https://example.com/logo.png",
    });
    const deleted = await runtime.deleteOrganization(portContext, {
      organizationId,
      confirmation: { organizationId },
    });

    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap()).toMatchObject({
      organizationId,
      role: "owner",
    });
    expect(updated.isOk()).toBe(true);
    expect(updated._unsafeUnwrap()).toMatchObject({
      organizationId,
      name: "Renamed Org Settings",
      slug: "renamed-org-settings",
      logoUrl: "https://example.com/logo.png",
    });
    expect(deleted.isOk()).toBe(true);
    expect(deleted._unsafeUnwrap()).toMatchObject({ organizationId });
    const afterDelete = await runtime.showOrganizationProfile(portContext, { organizationId });
    expect(afterDelete.isErr()).toBe(true);
  });

  test("[PRODUCT-AUTH-SIGNUP-002] signed-in users without an organization receive a default personal organization", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "github-user@example.com",
          name: "GitHub User",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const setCookie = signedUp.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie, setCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const listedOrganizations = await runtime.handle(
      new Request("http://localhost:3721/api/auth/organization/list", {
        method: "GET",
        headers: {
          cookie: sessionCookie,
        },
      }),
    );
    expect(listedOrganizations.status).toBe(200);
    const organizations = (await listedOrganizations.json()) as Array<{
      id?: unknown;
      slug?: unknown;
    }>;
    expect(organizations).toHaveLength(1);
    expect(typeof organizations[0]?.id).toBe("string");

    const authorizationResult = await runtime.authorizeProductSession(context, {
      method: "GET",
      path: "/api/projects",
      requiredRole: "member",
      cookieHeader: sessionCookie,
    });

    expect(authorizationResult.isOk()).toBe(true);
    const authorized = authorizationResult._unsafeUnwrap();
    expect(authorized).toMatchObject({
      role: "owner",
      organizationRole: "owner",
      email: "github-user@example.com",
      organizationId: organizations[0]?.id,
    });

    const currentContext = await runtime.getCurrentContext({
      ...context,
      auth: { cookieHeader: sessionCookie },
    });
    expect(currentContext.isOk()).toBe(true);
    expect(currentContext._unsafeUnwrap()).toMatchObject({
      currentOrganization: {
        organizationId: authorized.organizationId,
        role: "owner",
      },
      user: {
        email: "github-user@example.com",
      },
    });
  });

  test("[AUTH-BETTER-ORG-ADMISSION-001] exposes neutral current organization counts for admission hooks and session status", async () => {
    const organizationAdmissionRequests: unknown[] = [];
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      organizationAdmission: {
        async admitOrganizationCreate(request) {
          organizationAdmissionRequests.push(request);
          return { allowed: true, reason: "test-admission-allowed" };
        },
      },
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "neutral-org-count@example.com",
          name: "Neutral Org Count",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    expect(signedUp.status).toBe(200);
    const sessionCookie = requireSessionCookie(signedUp);

    expect(organizationAdmissionRequests).toEqual([
      expect.objectContaining({
        currentUserOrganizationCount: 0,
        email: "neutral-org-count@example.com",
        reason: "default-organization",
      }),
    ]);

    const sessionStatus = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: sessionCookie,
        },
      }),
    );
    expect(sessionStatus.currentUserOrganizationCount).toBe(1);

    const createdOrganization = await runtime.handle(
      new Request("http://localhost:3721/api/auth/organization/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: sessionCookie,
          origin: "http://localhost:3721",
        },
        body: JSON.stringify({
          name: "Second Neutral Org",
          slug: "second-neutral-org",
        }),
      }),
    );
    expect(createdOrganization.status).toBe(200);

    const updatedSessionStatus = await runtime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session", {
        headers: {
          cookie: sessionCookie,
        },
      }),
    );
    expect(updatedSessionStatus.currentUserOrganizationCount).toBe(2);
  });

  test("[ORG-TEAM-MEMBERS-002] organization owners can list members through the product adapter", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const signedUp = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "owner-list@example.com",
          name: "Owner List",
          password: "local-user-password",
          rememberMe: true,
        }),
      }),
    );
    const setCookie = signedUp.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
    expect(signedUp.status).toBe(200);
    expect(sessionCookie, setCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after sign-up");
    }

    const contextResult = await runtime.getCurrentContext({
      ...context,
      auth: { cookieHeader: sessionCookie },
      requestId: "req_owner_list_members_context",
    });
    expect(contextResult.isOk()).toBe(true);
    const organizationId = contextResult._unsafeUnwrap().currentOrganization.organizationId;

    const membersResult = await runtime.listMembers(
      {
        ...context,
        auth: { cookieHeader: sessionCookie },
        requestId: "req_owner_list_members",
      },
      {
        organizationId,
        limit: 100,
      },
    );

    expect(membersResult.isOk()).toBe(true);
    expect(membersResult._unsafeUnwrap().items).toEqual([
      expect.objectContaining({
        email: "owner-list@example.com",
        role: "owner",
        userId: expect.any(String),
      }),
    ]);
  });

  test("[CLOUD-IDENTITY-MEMBER-DEACTIVATE-002] remove member deactivates the row instead of deleting it", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-auth-member-lifecycle-"));
    const { createDatabase, createMigrator } = await import("../../../persistence/pg/src/index");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(workspaceDir, ".appaloft", "data", "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const runtime = createBetterAuthRuntime({
        enabled: true,
        baseURL: "http://localhost:3721",
        secret: "test-secret-at-least-long-enough",
        database: {
          db: database.db,
          type: "postgres",
        },
      });
      const owner = await signUpWithSessionCookie(runtime, {
        email: "soft-remove-owner@example.com",
        name: "Soft Remove Owner",
      });
      const ownerContext = await runtime.getCurrentContext({
        ...context,
        auth: { cookieHeader: owner.sessionCookie },
        requestId: "req_soft_remove_owner_context",
      });
      expect(ownerContext.isOk()).toBe(true);
      const organizationId = ownerContext._unsafeUnwrap().currentOrganization.organizationId;

      await database.db
        .insertInto("user")
        .values({
          id: "usr_soft_removed",
          name: "Soft Removed Member",
          email: "soft-removed-member@example.com",
          emailVerified: true,
          image: null,
        })
        .execute();
      await database.db
        .insertInto("member")
        .values({
          id: "mem_soft_removed",
          organizationId,
          userId: "usr_soft_removed",
          role: "developer",
          status: "active",
          createdAt: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const removed = await runtime.removeMember(
        {
          ...context,
          auth: { cookieHeader: owner.sessionCookie },
          requestId: "req_soft_remove_member",
        },
        {
          organizationId,
          memberId: "mem_soft_removed",
        },
      );
      const members = await runtime.listMembers(
        {
          ...context,
          auth: { cookieHeader: owner.sessionCookie },
          requestId: "req_soft_remove_member_list",
        },
        {
          organizationId,
          limit: 100,
        },
      );
      const retainedRow = await database.db
        .selectFrom("member")
        .select(["id", "status"])
        .where("id", "=", "mem_soft_removed")
        .executeTakeFirst();
      const restored = await runtime.reactivateMember(
        {
          ...context,
          auth: { cookieHeader: owner.sessionCookie },
          requestId: "req_soft_restore_member",
        },
        {
          organizationId,
          memberId: "mem_soft_removed",
        },
      );
      const restoredMembers = await runtime.listMembers(
        {
          ...context,
          auth: { cookieHeader: owner.sessionCookie },
          requestId: "req_soft_restore_member_list",
        },
        {
          organizationId,
          limit: 100,
        },
      );
      const restoredRow = await database.db
        .selectFrom("member")
        .select(["id", "status"])
        .where("id", "=", "mem_soft_removed")
        .executeTakeFirst();

      expect(removed.isOk()).toBe(true);
      expect(retainedRow).toEqual({ id: "mem_soft_removed", status: "deactivated" });
      expect(members.isOk()).toBe(true);
      expect(members._unsafeUnwrap().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            memberId: "mem_soft_removed",
            status: "deactivated",
          }),
        ]),
      );
      expect(restored.isOk()).toBe(true);
      expect(restored._unsafeUnwrap()).toEqual(
        expect.objectContaining({
          memberId: "mem_soft_removed",
          status: "active",
        }),
      );
      expect(restoredRow).toEqual({ id: "mem_soft_removed", status: "active" });
      expect(restoredMembers.isOk()).toBe(true);
      expect(restoredMembers._unsafeUnwrap().items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            memberId: "mem_soft_removed",
            status: "active",
          }),
        ]),
      );
    } finally {
      await database.close();
    }
  });

  test("[ORG-TEAM-SWITCH-003] organization switching fails closed for non-member organizations", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const ownerA = await signUpWithSessionCookie(runtime, {
      email: "switch-owner-a@example.com",
      name: "Switch Owner A",
    });
    const ownerB = await signUpWithSessionCookie(runtime, {
      email: "switch-owner-b@example.com",
      name: "Switch Owner B",
    });
    const ownerBContext = await runtime.getCurrentContext({
      ...context,
      auth: { cookieHeader: ownerB.sessionCookie },
      requestId: "req_switch_owner_b_context",
    });
    expect(ownerBContext.isOk()).toBe(true);
    const ownerBOrganizationId = ownerBContext._unsafeUnwrap().currentOrganization.organizationId;

    const switchResult = await runtime.switchCurrentOrganization(
      {
        ...context,
        auth: { cookieHeader: ownerA.sessionCookie },
        requestId: "req_switch_owner_a_to_b",
      },
      {
        organizationId: ownerBOrganizationId,
      },
    );

    expect(switchResult.isErr()).toBe(true);
    expect(switchResult._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_forbidden",
      details: {
        organizationId: ownerBOrganizationId,
        phase: "product-authorization",
      },
    });
  });

  test("[ORG-TEAM-INVITE-003] invitations require membership and preserve pending-invitation lifecycle", async () => {
    const invitationDeliveries: unknown[] = [];
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      organization: {
        sendInvitationEmail: async (invitation) => {
          invitationDeliveries.push(invitation);
        },
      },
    });

    const owner = await signUpWithSessionCookie(runtime, {
      email: "invite-owner@example.com",
      name: "Invite Owner",
    });
    const outsider = await signUpWithSessionCookie(runtime, {
      email: "invite-outsider@example.com",
      name: "Invite Outsider",
    });
    const ownerContext = await runtime.getCurrentContext({
      ...context,
      auth: { cookieHeader: owner.sessionCookie },
      requestId: "req_invite_owner_context",
    });
    expect(ownerContext.isOk()).toBe(true);
    const organizationId = ownerContext._unsafeUnwrap().currentOrganization.organizationId;

    const createdInvitation = await runtime.inviteMember(
      {
        ...context,
        auth: { cookieHeader: owner.sessionCookie },
        requestId: "req_invite_owner_create",
      },
      {
        organizationId,
        email: "pending-member@example.com",
        role: "developer",
      },
    );
    expect(createdInvitation.isOk()).toBe(true);
    expect(createdInvitation._unsafeUnwrap()).toMatchObject({
      email: "pending-member@example.com",
      organizationId,
      role: "developer",
      status: "pending",
    });
    expect(invitationDeliveries).toEqual([
      expect.objectContaining({
        email: "pending-member@example.com",
        role: "member",
      }),
    ]);

    const duplicateInvitation = await runtime.inviteMember(
      {
        ...context,
        auth: { cookieHeader: owner.sessionCookie },
        requestId: "req_invite_owner_duplicate",
      },
      {
        organizationId,
        email: "pending-member@example.com",
        role: "developer",
      },
    );
    expect(duplicateInvitation.isErr()).toBe(true);
    expect(duplicateInvitation._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_forbidden",
      details: {
        organizationId,
        reasonCode: "invite-member-failed",
      },
    });

    const outsiderInvitation = await runtime.inviteMember(
      {
        ...context,
        auth: { cookieHeader: outsider.sessionCookie },
        requestId: "req_invite_outsider_create",
      },
      {
        organizationId,
        email: "outsider-invite@example.com",
        role: "developer",
      },
    );
    expect(outsiderInvitation.isErr()).toBe(true);
    expect(outsiderInvitation._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_forbidden",
      details: {
        organizationId,
        reasonCode: "invite-member-failed",
      },
    });

    const invitations = await runtime.listInvitations(
      {
        ...context,
        auth: { cookieHeader: owner.sessionCookie },
        requestId: "req_invite_owner_list",
      },
      {
        organizationId,
        status: "pending",
      },
    );
    expect(invitations.isOk()).toBe(true);
    expect(invitations._unsafeUnwrap().items).toEqual([
      expect.objectContaining({
        email: "pending-member@example.com",
        organizationId,
        status: "pending",
      }),
    ]);
  });

  test("[PRODUCT-AUTH-READ-001] authorizes the first admin through a visible organization when active organization is unset", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const bootstrapResult = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
      password: "local-admin-password",
    });
    expect(bootstrapResult.isOk()).toBe(true);

    const signedIn = await runtime.handle(
      new Request("http://localhost:3721/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          callbackURL: "/",
          email: "admin@example.com",
          password: "local-admin-password",
        }),
      }),
    );
    const setCookie = signedIn.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
    expect(signedIn.status).toBe(200);
    expect(sessionCookie, setCookie).toBeTruthy();
    if (!sessionCookie) {
      throw new Error("Expected Better Auth session cookie after first-admin sign-in");
    }

    const authorizationResult = await runtime.authorizeProductSession(context, {
      method: "POST",
      path: "/api/rpc/resources/list",
      requiredRole: "member",
      cookieHeader: sessionCookie,
    });

    expect(authorizationResult.isOk()).toBe(true);
    expect(authorizationResult._unsafeUnwrap()).toMatchObject({
      organizationId: bootstrapResult._unsafeUnwrap().organizationId,
      role: "owner",
      userId: bootstrapResult._unsafeUnwrap().userId,
    });
  });

  test("fails closed when the auth runtime is disabled", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: false,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const result = await runtime.bootstrapFirstAdmin(context, {
      email: "admin@example.com",
      displayName: "Admin User",
      organizationName: "Self-hosted Appaloft",
      password: "local-admin-password",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "first_admin_bootstrap_failed",
      details: { phase: "first-admin-bootstrap" },
    });
  });

  test("[FIRST-ADMIN-BOOTSTRAP-005] reports optional OAuth providers only when fully configured", async () => {
    const unconfiguredRuntime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
    });

    const configuredRuntime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      githubRedirectUri: "http://localhost:3721/api/auth/callback/github",
      googleClientId: "google-client-id",
      googleClientSecret: "google-client-secret",
      googleRedirectUri: "http://localhost:3721/api/auth/callback/google",
      oidcClientId: "oidc-client-id",
      oidcClientSecret: "oidc-client-secret",
      oidcDiscoveryUrl: "https://identity.example.com/.well-known/openid-configuration",
      oidcRedirectUri: "http://localhost:3721/api/auth/oauth2/callback/oidc",
      trustedOrigins: ["http://localhost:3721"],
    });

    const unconfiguredStatus = await unconfiguredRuntime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session"),
    );
    const configuredStatus = await configuredRuntime.getSessionStatus(
      new Request("http://localhost:3721/api/auth/session"),
    );

    expect(unconfiguredStatus.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "github", configured: false }),
        expect.objectContaining({ key: "google", configured: false }),
        expect.objectContaining({ key: "oidc", configured: false }),
      ]),
    );
    expect(configuredStatus.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "github", configured: true }),
        expect.objectContaining({ key: "google", configured: true }),
        expect.objectContaining({ key: "oidc", configured: true }),
      ]),
    );
  });

  test("[ORG-TEAM-ADAPTER-001] organization/team port fails closed without a product session", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const contextResult = await runtime.getCurrentContext(context);
    const membersResult = await runtime.listMembers(context, {
      organizationId: "org_self_hosted",
    });
    const switchResult = await runtime.switchCurrentOrganization(context, {
      organizationId: "org_self_hosted",
    });
    const inviteResult = await runtime.inviteMember(context, {
      organizationId: "org_self_hosted",
      email: "operator@example.com",
      role: "developer",
    });

    expect(contextResult.isErr()).toBe(true);
    expect(membersResult.isErr()).toBe(true);
    expect(switchResult.isErr()).toBe(true);
    expect(inviteResult.isErr()).toBe(true);
    expect(contextResult._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_missing",
    });
    expect(switchResult._unsafeUnwrapErr()).toMatchObject({
      code: "product_auth_missing",
      details: { phase: "product-authentication" },
    });
    expect(JSON.stringify(contextResult._unsafeUnwrapErr())).not.toContain("better-auth");
    expect(JSON.stringify(switchResult._unsafeUnwrapErr())).not.toContain("better-auth");
  });
});
