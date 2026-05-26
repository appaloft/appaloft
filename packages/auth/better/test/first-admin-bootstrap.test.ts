import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { type ExecutionContext } from "@appaloft/application";

import { createBetterAuthRuntime } from "../src";
import {
  createAppaloftBetterAuthOptions,
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
      enabled: true,
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
