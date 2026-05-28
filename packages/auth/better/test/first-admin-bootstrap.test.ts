import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { type ExecutionContext } from "@appaloft/application";
import { makeSignature } from "better-auth/crypto";

import { createBetterAuthRuntime } from "../src";
import {
  createAppaloftBetterAuthOptions,
  resolveAppaloftBetterAuthAccountRecoveryStatus,
  resolveAppaloftBetterAuthAccountSecurityStatus,
  resolveAppaloftBetterAuthEmailVerificationStatus,
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
    expect(options.advanced).toMatchObject({
      cookiePrefix: "better-auth",
      crossSubDomainCookies: {
        enabled: true,
        domain: ".appaloft.com",
      },
      trustedProxyHeaders: true,
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
    expect(options.rateLimit?.customRules).not.toHaveProperty("/request-password-reset");
    expect(options.plugins?.map((plugin) => plugin.id)).not.toContain("email-otp");
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
      provider: "better-auth",
      loginRequired: true,
      session: null,
    });
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
      organizationSlug: "self-hosted-appaloft",
    });
    expect(result._unsafeUnwrap().userId.length).toBeGreaterThan(0);
    expect(result._unsafeUnwrap().organizationId.length).toBeGreaterThan(0);
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("local-admin-password");
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

    const context = await runtime["auth"].$context;
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
