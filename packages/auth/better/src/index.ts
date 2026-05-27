import "reflect-metadata";

import {
  type ActionDeployTokenAuthorizationInput,
  type ActionDeployTokenAuthorizationPort,
  type ActionDeployTokenAuthorizationResult,
  type ActionDeployTokenRequestedScope,
  type ActionDeployTokenResolvedScope,
  type ChangeOrganizationMemberRoleInput,
  type Clock,
  type CurrentOrganizationContext,
  type DeployTokenMaterial,
  type DeployTokenMaterialIssuer,
  type DeployTokenRepository,
  type ExecutionContext,
  type FirstAdminBootstrapper,
  type FirstAdminBootstrapRecord,
  type FirstAdminBootstrapRequest,
  type InviteOrganizationMemberInput,
  type OrganizationInvitationListInput,
  type OrganizationInvitationStatus,
  type OrganizationInvitationSummary,
  type OrganizationMemberListInput,
  type OrganizationMemberSummary,
  type OrganizationTeamManagementPort,
  type OrganizationTeamRole,
  type ProductOrganizationRole,
  type ProductSessionAuthorizationInput,
  type ProductSessionAuthorizationPort,
  type ProductSessionAuthorizationResult,
  type RemoveOrganizationMemberInput,
  type SwitchCurrentOrganizationInput,
  toRepositoryContext,
} from "@appaloft/application";
import {
  ActiveDeployTokenByVerifierDigestSpec,
  CreatedAt,
  DeploymentTargetId,
  type DeployTokenAuthorizationScopeDenyReason,
  type DeployTokenAuthorizationScopeDimension,
  DeployTokenSecretSuffix,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  type DomainError,
  EnvironmentId,
  err,
  LastUsedAt,
  MarkDeployTokenUsedSpec,
  ok,
  ProjectId,
  ResourceId,
  type Result,
  SourceRepositoryFullName,
} from "@appaloft/core";
import {
  type AppaloftBetterAuth,
  type AppaloftBetterAuthConfig,
  createAppaloftBetterAuth,
  resolveAppaloftBetterAuthProviderConfig,
} from "./shared";

type AuthProviderKey = "github" | "google" | "oidc";

export interface AuthProviderStatus {
  key: AuthProviderKey;
  title: string;
  configured: boolean;
  connected: boolean;
  requiresSignIn: boolean;
  deferred: boolean;
  connectPath?: string;
  reason?: string;
}

export interface AuthSessionStatus {
  enabled: boolean;
  provider: "none" | "better-auth";
  loginRequired: boolean;
  deferredAuth: boolean;
  session: unknown | null;
  providers: AuthProviderStatus[];
}

export interface BetterAuthRuntimeConfig extends AppaloftBetterAuthConfig {
  enabled: boolean;
}

export interface AuthRuntime
  extends FirstAdminBootstrapper,
    OrganizationTeamManagementPort,
    ProductSessionAuthorizationPort {
  getSessionStatus(request: Request): Promise<AuthSessionStatus>;
  getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null>;
  handle(request: Request): Promise<Response>;
}

interface ProvisionedDefaultOrganization {
  organizationId: string;
  name: string;
  role: "owner";
  slug: string;
}

function buildProviderStatus(
  key: AuthProviderKey,
  input: {
    configured: boolean;
    connected: boolean;
  },
): AuthProviderStatus {
  return {
    key,
    title: providerTitle(key),
    configured: input.configured,
    connected: input.connected,
    requiresSignIn: true,
    deferred: true,
    ...(input.configured
      ? {
          connectPath: key === "oidc" ? "/api/auth/sign-in/oauth2" : "/api/auth/sign-in/social",
        }
      : {
          reason: providerNotConfiguredReason(key),
        }),
  };
}

export class BetterAuthRuntime implements AuthRuntime {
  private readonly auth: AppaloftBetterAuth;
  private readonly githubConfigured: boolean;
  private readonly googleConfigured: boolean;
  private readonly oidcConfigured: boolean;

  constructor(private readonly config: BetterAuthRuntimeConfig) {
    const providers = resolveAppaloftBetterAuthProviderConfig(config);
    this.githubConfigured = providers.github;
    this.googleConfigured = providers.google;
    this.oidcConfigured = providers.oidc;
    this.auth = createAppaloftBetterAuth(config);
  }

  async getSessionStatus(request: Request): Promise<AuthSessionStatus> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        provider: "none",
        loginRequired: false,
        deferredAuth: false,
        session: null,
        providers: providerStatuses({
          github: false,
          google: false,
          oidc: false,
        }),
      };
    }

    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    const accounts =
      session && this.hasConfiguredOAuthProvider()
        ? await this.auth.api.listUserAccounts({
            headers: request.headers,
          })
        : [];
    const connectedProviders = new Set(
      accounts
        .filter((account) => account && typeof account === "object")
        .map((account) => (account as { providerId?: unknown }).providerId)
        .filter(
          (providerId): providerId is AuthProviderKey =>
            providerId === "github" || providerId === "google" || providerId === "oidc",
        ),
    );

    return {
      enabled: true,
      provider: "better-auth",
      loginRequired: !session,
      deferredAuth: true,
      session,
      providers: providerStatuses(
        {
          github: this.githubConfigured,
          google: this.googleConfigured,
          oidc: this.oidcConfigured,
        },
        connectedProviders,
      ),
    };
  }

  async getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null> {
    if (!this.config.enabled || providerKey !== "github" || !this.githubConfigured) {
      return null;
    }

    try {
      const result = await this.auth.api.getAccessToken({
        headers: request.headers,
        body: {
          providerId: providerKey,
        },
      });

      return result?.accessToken ?? null;
    } catch {
      return null;
    }
  }

  async handle(request: Request): Promise<Response> {
    if (!this.config.enabled) {
      return new Response(
        JSON.stringify({
          error: {
            code: "auth_disabled",
            message: "Built-in auth runtime is disabled.",
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        },
      );
    }

    const response = await this.auth.handler(request);
    await this.ensureDefaultOrganizationAfterAuthRoute(request, response);
    return response;
  }

  private hasConfiguredOAuthProvider(): boolean {
    return this.githubConfigured || this.googleConfigured || this.oidcConfigured;
  }

  private async firstVisibleOrganizationId(headers: Headers): Promise<string | undefined> {
    const organizations = await this.auth.api.listOrganizations({ headers });
    return toArray(organizations)
      .map(
        (organization) =>
          readString(organization, "id") ?? readString(organization, "organizationId"),
      )
      .find((organizationId) => Boolean(organizationId));
  }

  private async rememberActiveOrganization(
    headers: Headers,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.auth.api.setActiveOrganization({
        headers,
        body: { organizationId },
      });
    } catch {
      // Downstream authorization remains fail-closed if Better Auth rejects the organization.
    }
  }

  private async firstAuthorizedOrganizationRole(
    headers: Headers,
  ): Promise<{ organizationId: string; role: ProductOrganizationRole } | null> {
    const organizationId = await this.firstVisibleOrganizationId(headers);
    if (!organizationId) {
      return null;
    }

    const activeRole = await this.auth.api.getActiveMemberRole({
      headers,
      query: { organizationId },
    });
    const role = normalizeProductOrganizationRole(readString(activeRole, "role"));
    return role ? { organizationId, role } : null;
  }

  private async ensureDefaultOrganizationAfterAuthRoute(
    request: Request,
    response: Response,
  ): Promise<void> {
    if (response.status >= 400 || !shouldEnsureDefaultOrganizationAfterAuthRoute(request)) {
      return;
    }

    const headers = authResponseSessionHeaders(request.headers, response.headers);
    if (!headers) {
      return;
    }

    try {
      await this.ensureDefaultOrganizationForHeaders(headers);
    } catch {
      // Auth succeeds independently; product authorization keeps a fail-closed self-heal path.
    }
  }

  private async ensureDefaultOrganizationForHeaders(
    headers: Headers,
  ): Promise<ProvisionedDefaultOrganization | null> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) {
      return null;
    }

    const sessionObject = readObject(session, "session");
    const userObject = readObject(session, "user");
    const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
    if (!userId || (await this.firstVisibleOrganizationId(headers))) {
      return null;
    }

    const email = readString(userObject, "email");
    const displayName = readString(userObject, "name");
    return this.provisionDefaultOrganizationForSession({
      ...(displayName ? { displayName } : {}),
      ...(email ? { email } : {}),
      headers,
      userId,
    });
  }

  private async provisionDefaultOrganizationForSession(input: {
    displayName?: string;
    email?: string;
    headers: Headers;
    userId: string;
  }): Promise<ProvisionedDefaultOrganization | null> {
    const name = defaultPersonalOrganizationName(input);
    const slugPrefix = defaultOrganizationSlug(
      `${input.displayName ?? input.email?.split("@")[0] ?? "appaloft"}-${stableSlugSuffix(input.userId)}`,
    );

    for (const slug of [slugPrefix, `${slugPrefix}-${randomHex(2)}`]) {
      try {
        const organization = await this.auth.api.createOrganization({
          headers: input.headers,
          body: {
            name,
            slug,
            userId: input.userId,
            keepCurrentActiveOrganization: true,
          },
        });
        const organizationId = readString(organization, "id");
        if (organizationId) {
          return {
            organizationId,
            name: readString(organization, "name") ?? name,
            role: "owner",
            slug: readString(organization, "slug") ?? slug,
          };
        }
      } catch {
        const visibleOrganizationId = await this.firstVisibleOrganizationId(input.headers);
        if (visibleOrganizationId) {
          await this.rememberActiveOrganization(input.headers, visibleOrganizationId);
          return {
            organizationId: visibleOrganizationId,
            name: visibleOrganizationId,
            role: "owner",
            slug: visibleOrganizationId,
          };
        }
        // Retry with the fallback slug; if that also fails, authorization remains fail-closed.
      }
    }

    return null;
  }

  async authorizeProductSession(
    _context: ExecutionContext,
    input: ProductSessionAuthorizationInput,
  ): Promise<Result<ProductSessionAuthorizationResult>> {
    if (!this.config.enabled) {
      return err(productAuthMissing(input, "auth-runtime-disabled"));
    }

    const headers = productAuthHeaders(input);

    try {
      const session = await this.auth.api.getSession({
        headers,
      });
      if (!session) {
        return err(productAuthMissing(input, "session-missing"));
      }

      const sessionObject = readObject(session, "session");
      const userObject = readObject(session, "user");
      const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
      if (!userId) {
        return err(productAuthInvalid(input, "session-user-missing"));
      }
      const email = readString(userObject, "email");

      const activeOrganizationId =
        input.organizationId ?? readString(sessionObject, "activeOrganizationId");
      const visibleOrganizationId = activeOrganizationId
        ? undefined
        : await this.firstVisibleOrganizationId(headers);
      let organizationId = activeOrganizationId ?? visibleOrganizationId;
      if (!organizationId) {
        const provisioned = input.organizationId
          ? null
          : await this.ensureDefaultOrganizationForHeaders(headers);
        if (!provisioned) {
          return err(productAuthForbidden(input, "active-organization-missing"));
        }
        organizationId = provisioned.organizationId;
      }
      if (!activeOrganizationId && visibleOrganizationId) {
        await this.rememberActiveOrganization(headers, visibleOrganizationId);
      }

      const activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: {
          organizationId,
        },
      });
      let resolvedOrganizationId = organizationId;
      const activeRoleValue = readString(activeRole, "role");
      let organizationRole = normalizeOrganizationTeamRole(activeRoleValue);
      let role = normalizeProductOrganizationRole(activeRoleValue);
      if (!role && !input.organizationId) {
        const fallback = await this.firstAuthorizedOrganizationRole(headers);
        if (fallback) {
          resolvedOrganizationId = fallback.organizationId;
          role = fallback.role;
          organizationRole = productRoleToOrganizationRole(fallback.role);
        } else {
          const provisioned = await this.ensureDefaultOrganizationForHeaders(headers);
          if (provisioned) {
            resolvedOrganizationId = provisioned.organizationId;
            role = "owner";
            organizationRole = "owner";
          }
        }
      }
      if (!role) {
        return err(productAuthForbidden(input, "organization-member-missing"));
      }
      if (!productRoleAllows(role, input.requiredRole)) {
        return err(productAuthForbidden(input, "role-insufficient", role));
      }

      return ok({
        actor: {
          kind: "user",
          id: userId,
          ...(email ? { label: email } : {}),
        },
        ...(email ? { email } : {}),
        organizationId: resolvedOrganizationId,
        ...(organizationRole ? { organizationRole } : {}),
        role,
        userId,
      });
    } catch {
      return err(productAuthInvalid(input, "session-verification-failed"));
    }
  }

  async bootstrapFirstAdmin(
    _context: ExecutionContext,
    request: FirstAdminBootstrapRequest,
  ): Promise<Result<FirstAdminBootstrapRecord>> {
    if (!this.config.enabled) {
      return err(firstAdminBootstrapFailed("Built-in auth runtime is disabled"));
    }

    try {
      const signup = await this.auth.api.signUpEmail({
        body: {
          email: request.email,
          name: request.displayName,
          password: request.password,
        },
      });
      const userId = signup.user.id;
      const organization = await this.auth.api.createOrganization({
        body: {
          name: request.organizationName,
          slug: request.organizationSlug ?? defaultOrganizationSlug(request.organizationName),
          userId,
          keepCurrentActiveOrganization: true,
        },
      });

      return ok({
        email: signup.user.email,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        userId,
      });
    } catch (error) {
      return err(
        firstAdminBootstrapFailed(
          error instanceof Error ? error.message : "First admin bootstrap failed",
        ),
      );
    }
  }

  async getCurrentContext(context: ExecutionContext): Promise<Result<CurrentOrganizationContext>> {
    const authInput = organizationTeamAuthInput("GET", "/api/organizations/current-context");
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(productAuthMissing(authInput, "session-missing"));
    }

    try {
      const session = await this.auth.api.getSession({ headers });
      if (!session) {
        return err(productAuthMissing(authInput, "session-missing"));
      }

      const sessionObject = readObject(session, "session");
      const userObject = readObject(session, "user");
      const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
      const email = readString(userObject, "email");
      if (!userId || !email) {
        return err(productAuthInvalid(authInput, "session-user-missing"));
      }

      const organizations = await this.auth.api.listOrganizations({ headers });
      const organizationSummaries = toArray(organizations).map(mapContextOrganization);
      const displayName = readString(userObject, "name");
      const avatarUrl = readString(userObject, "image");
      let activeOrganizationId =
        readString(sessionObject, "activeOrganizationId") ??
        organizationSummaries[0]?.organizationId;
      if (!readString(sessionObject, "activeOrganizationId") && activeOrganizationId) {
        await this.rememberActiveOrganization(headers, activeOrganizationId);
      }
      if (!activeOrganizationId) {
        const provisioned = await this.ensureDefaultOrganizationForHeaders(headers);
        if (!provisioned) {
          return err(productAuthForbidden(authInput, "active-organization-missing"));
        }

        return ok({
          user: {
            userId,
            email,
            ...(displayName ? { displayName } : {}),
            ...(avatarUrl ? { avatarUrl } : {}),
          },
          currentOrganization: {
            organizationId: provisioned.organizationId,
            name: provisioned.name,
            role: "owner",
            slug: provisioned.slug,
          },
          organizations: [
            {
              organizationId: provisioned.organizationId,
              name: provisioned.name,
              role: "owner",
              slug: provisioned.slug,
            },
          ],
          loginMethods: loginMethodsForRuntime({
            github: this.githubConfigured,
            google: this.googleConfigured,
            oidc: this.oidcConfigured,
          }),
          permissions: permissionsForRole("owner"),
        });
      }

      const activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId: activeOrganizationId },
      });
      let currentRole = normalizeOrganizationTeamRole(readString(activeRole, "role"));
      if (!currentRole && organizationSummaries[0]?.organizationId) {
        activeOrganizationId = organizationSummaries[0].organizationId;
        await this.rememberActiveOrganization(headers, activeOrganizationId);
        const fallbackRole = await this.auth.api.getActiveMemberRole({
          headers,
          query: { organizationId: activeOrganizationId },
        });
        currentRole = normalizeOrganizationTeamRole(readString(fallbackRole, "role"));
      }
      if (!currentRole) {
        return err(productAuthForbidden(authInput, "organization-member-missing"));
      }

      const currentOrganization =
        organizationSummaries.find(
          (organization) => organization.organizationId === activeOrganizationId,
        ) ??
        mapContextOrganization({
          id: activeOrganizationId,
          name: activeOrganizationId,
          slug: activeOrganizationId,
          role: currentRole,
        });

      return ok({
        user: {
          userId,
          email,
          ...(displayName ? { displayName } : {}),
          ...(avatarUrl ? { avatarUrl } : {}),
        },
        currentOrganization: {
          ...currentOrganization,
          role: currentRole,
        },
        organizations: organizationSummaries,
        loginMethods: loginMethodsForRuntime({
          github: this.githubConfigured,
          google: this.googleConfigured,
          oidc: this.oidcConfigured,
        }),
        permissions: permissionsForRole(currentRole),
      });
    } catch {
      return err(productAuthInvalid(authInput, "organization-context-read-failed"));
    }
  }

  async switchCurrentOrganization(
    context: ExecutionContext,
    input: SwitchCurrentOrganizationInput,
  ): Promise<Result<CurrentOrganizationContext>> {
    const authInput = organizationTeamAuthInput(
      "POST",
      "/api/organizations/current-context/switch",
      input.organizationId,
    );
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(productAuthMissing(authInput, "session-missing"));
    }

    try {
      const selected = await this.auth.api.setActiveOrganization({
        headers,
        body: { organizationId: input.organizationId },
      });
      if (!selected) {
        return err(productAuthForbidden(authInput, "organization-switch-forbidden"));
      }
    } catch {
      return err(productAuthForbidden(authInput, "organization-switch-failed"));
    }

    return this.getCurrentContext(context);
  }

  async listMembers(
    context: ExecutionContext,
    input: OrganizationMemberListInput,
  ): Promise<Result<{ items: OrganizationMemberSummary[]; nextCursor?: string }>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("GET", "organization-members"),
          "session-missing",
        ),
      );
    }

    try {
      await this.rememberActiveOrganization(headers, input.organizationId);
      const result = await this.auth.api.listMembers({
        headers,
        query: {
          organizationId: input.organizationId,
          ...(input.limit ? { limit: input.limit } : {}),
        },
      });
      const resultObject = readRecord(result);
      return ok({
        items: toArray(resultObject?.members).map(mapMemberSummary),
      });
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("GET", "organization-members", input.organizationId),
          "member-list-failed",
        ),
      );
    }
  }

  async listInvitations(
    context: ExecutionContext,
    input: OrganizationInvitationListInput,
  ): Promise<Result<{ items: OrganizationInvitationSummary[]; nextCursor?: string }>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("GET", "organization-invitations"),
          "session-missing",
        ),
      );
    }

    try {
      await this.rememberActiveOrganization(headers, input.organizationId);
      const result = await this.auth.api.listInvitations({
        headers,
        query: { organizationId: input.organizationId },
      });
      const items = toArray(result)
        .map(mapInvitationSummary)
        .filter((invitation) => !input.status || invitation.status === input.status);
      return ok({ items });
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("GET", "organization-invitations", input.organizationId),
          "invitation-list-failed",
        ),
      );
    }
  }

  async inviteMember(
    context: ExecutionContext,
    input: InviteOrganizationMemberInput,
  ): Promise<Result<OrganizationInvitationSummary>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("POST", "organization-invite"),
          "session-missing",
        ),
      );
    }

    try {
      const result = await this.auth.api.createInvitation({
        headers,
        body: {
          organizationId: input.organizationId,
          email: input.email,
          role: toBetterAuthRole(input.role),
        },
      });
      return ok(mapInvitationSummary(result));
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("POST", "organization-invite", input.organizationId),
          "invite-member-failed",
        ),
      );
    }
  }

  async updateMemberRole(
    context: ExecutionContext,
    input: ChangeOrganizationMemberRoleInput,
  ): Promise<Result<OrganizationMemberSummary>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("POST", "organization-role"),
          "session-missing",
        ),
      );
    }

    try {
      const result = await this.auth.api.updateMemberRole({
        headers,
        body: {
          organizationId: input.organizationId,
          memberId: input.memberId,
          role: toBetterAuthRole(input.role),
        },
      });
      return ok(mapMemberSummary(readObject(result, "member") ?? result));
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("POST", "organization-role", input.organizationId),
          "change-member-role-failed",
        ),
      );
    }
  }

  async removeMember(
    context: ExecutionContext,
    input: RemoveOrganizationMemberInput,
  ): Promise<Result<{ memberId: string; organizationId: string; removedAt: string }>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("DELETE", "organization-member"),
          "session-missing",
        ),
      );
    }

    try {
      const result = await this.auth.api.removeMember({
        headers,
        body: {
          organizationId: input.organizationId,
          memberIdOrEmail: input.memberId,
        },
      });
      const member = readObject(result, "member") ?? {};
      return ok({
        memberId: readString(member, "id") ?? input.memberId,
        organizationId: readString(member, "organizationId") ?? input.organizationId,
        removedAt: new Date().toISOString(),
      });
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("DELETE", "organization-member", input.organizationId),
          "remove-member-failed",
        ),
      );
    }
  }
}

export function createBetterAuthRuntime(config: BetterAuthRuntimeConfig): AuthRuntime {
  return new BetterAuthRuntime(config);
}

function defaultOrganizationSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "self-hosted-appaloft";
}

function defaultPersonalOrganizationName(input: { displayName?: string; email?: string }): string {
  const base = input.displayName?.trim() || input.email?.split("@")[0]?.trim() || "Appaloft";
  return `${base} Workspace`;
}

function stableSlugSuffix(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8);
}

function firstAdminBootstrapFailed(message: string) {
  return {
    code: "first_admin_bootstrap_failed",
    category: "infra" as const,
    message,
    retryable: true,
    details: {
      phase: "first-admin-bootstrap",
    },
  };
}

function productAuthHeaders(input: ProductSessionAuthorizationInput): Headers {
  const headers = new Headers();
  if (input.cookieHeader) {
    headers.set("cookie", input.cookieHeader);
  }
  if (input.authorizationHeader) {
    headers.set("authorization", input.authorizationHeader);
  }
  return headers;
}

function contextAuthHeaders(context: ExecutionContext): Headers | null {
  const headers = new Headers();
  if (context.auth?.cookieHeader) {
    headers.set("cookie", context.auth.cookieHeader);
  }
  if (context.auth?.authorizationHeader) {
    headers.set("authorization", context.auth.authorizationHeader);
  }
  return headers.has("cookie") || headers.has("authorization") ? headers : null;
}

function shouldEnsureDefaultOrganizationAfterAuthRoute(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return (
    path === "/api/auth/sign-up/email" ||
    path === "/api/auth/sign-in/email" ||
    path === "/api/auth/callback/github" ||
    path === "/api/auth/callback/google" ||
    path === "/api/auth/oauth2/callback/oidc"
  );
}

function authResponseSessionHeaders(
  requestHeaders: Headers,
  responseHeaders: Headers,
): Headers | null {
  const cookieHeader = mergeCookieHeader(requestHeaders.get("cookie"), responseHeaders);
  if (!cookieHeader) {
    return null;
  }

  const headers = new Headers(requestHeaders);
  headers.set("cookie", cookieHeader);
  return headers;
}

function mergeCookieHeader(existingCookieHeader: string | null, responseHeaders: Headers): string {
  const cookies = new Map<string, string>();
  for (const cookiePart of (existingCookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = cookiePart.trim().split("=");
    if (rawName && rawValue.length > 0) {
      cookies.set(rawName, rawValue.join("="));
    }
  }

  const setCookieHeader = responseHeaders.get("set-cookie") ?? "";
  const cookiePattern = /(?:^|,\s*)([^=;,\s]+)=([^;,\s]*)/g;
  for (const match of setCookieHeader.matchAll(cookiePattern)) {
    const name = match[1];
    const value = match[2];
    if (name && value && !setCookieAttributeNames.has(name.toLowerCase())) {
      cookies.set(name, value);
    }
  }

  return Array.from(cookies, ([name, value]) => `${name}=${value}`).join("; ");
}

const setCookieAttributeNames = new Set([
  "domain",
  "expires",
  "httponly",
  "max-age",
  "path",
  "samesite",
  "secure",
]);

function organizationTeamAuthInput(
  method: string,
  path: string,
  organizationId?: string,
): ProductSessionAuthorizationInput {
  return {
    method,
    path,
    requiredRole: "member",
    ...(organizationId ? { organizationId } : {}),
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function readObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const property = (value as Record<string, unknown>)[key];
  return property && typeof property === "object"
    ? (property as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" && property.trim() ? property : undefined;
}

function readDateString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const property = (value as Record<string, unknown>)[key];
  if (property instanceof Date) {
    return property.toISOString();
  }
  return typeof property === "string" && property.trim() ? property : undefined;
}

function toArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
}

function normalizeOrganizationTeamRole(role: string | undefined): OrganizationTeamRole | null {
  if (!role) {
    return null;
  }
  const roles = role
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (roles.includes("owner")) {
    return "owner";
  }
  if (roles.includes("admin")) {
    return "admin";
  }
  if (roles.includes("billing")) {
    return "billing";
  }
  if (roles.includes("viewer")) {
    return "viewer";
  }
  return "developer";
}

function toBetterAuthRole(role: OrganizationTeamRole): "admin" | "member" | "owner" {
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "member";
}

function providerTitle(key: AuthProviderKey): string {
  if (key === "github") {
    return "GitHub";
  }
  if (key === "google") {
    return "Google";
  }
  return "OIDC";
}

function providerNotConfiguredReason(key: AuthProviderKey): string {
  if (key === "github") {
    return "Configure APPALOFT_GITHUB_CLIENT_ID and APPALOFT_GITHUB_CLIENT_SECRET to enable GitHub login.";
  }
  if (key === "google") {
    return "Configure APPALOFT_GOOGLE_CLIENT_ID and APPALOFT_GOOGLE_CLIENT_SECRET to enable Google login.";
  }
  return "Configure APPALOFT_OIDC_CLIENT_ID, APPALOFT_OIDC_CLIENT_SECRET, APPALOFT_OIDC_DISCOVERY_URL, and APPALOFT_OIDC_REDIRECT_URI to enable OIDC login.";
}

function providerStatuses(
  configured: Record<AuthProviderKey, boolean>,
  connectedProviders: ReadonlySet<AuthProviderKey> = new Set<AuthProviderKey>(),
): AuthProviderStatus[] {
  return (["github", "google", "oidc"] as const).map((key) =>
    buildProviderStatus(key, {
      configured: configured[key],
      connected: connectedProviders.has(key),
    }),
  );
}

function loginMethodsForRuntime(configured: Record<AuthProviderKey, boolean>) {
  return [
    {
      key: "local-password" as const,
      configured: true,
      enabled: true,
    },
    ...(["github", "google", "oidc"] as const).map((key) => ({
      key,
      configured: configured[key],
      enabled: configured[key],
      ...(configured[key] ? {} : { reason: "not-configured" }),
    })),
  ];
}

function permissionsForRole(role: OrganizationTeamRole) {
  const owns = role === "owner";
  const manages = owns || role === "admin";
  return {
    canInviteMembers: manages,
    canListMembers: true,
    canManageDeployTokens: manages,
    canRemoveMembers: owns,
    canUpdateMemberRoles: owns,
  };
}

function mapContextOrganization(value: Record<string, unknown>) {
  const role = normalizeOrganizationTeamRole(readString(value, "role")) ?? "developer";
  return {
    organizationId: readString(value, "id") ?? readString(value, "organizationId") ?? "",
    name: readString(value, "name") ?? "",
    slug: readString(value, "slug") ?? "",
    role,
  };
}

function mapMemberSummary(value: unknown): OrganizationMemberSummary {
  const member = readRecord(value) ?? {};
  const user = readObject(member, "user") ?? {};
  const avatarUrl = readString(user, "image");
  const displayName = readString(user, "name");
  const email = readString(user, "email");
  return {
    memberId: readString(member, "id") ?? "",
    userId: readString(member, "userId") ?? readString(user, "id") ?? "",
    role: normalizeOrganizationTeamRole(readString(member, "role")) ?? "developer",
    joinedAt:
      readDateString(member, "joinedAt") ??
      readDateString(member, "createdAt") ??
      new Date(0).toISOString(),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
  };
}

function normalizeInvitationStatus(status: string | undefined): OrganizationInvitationStatus {
  if (
    status === "accepted" ||
    status === "expired" ||
    status === "pending" ||
    status === "revoked"
  ) {
    return status;
  }
  return "pending";
}

function mapInvitationSummary(value: unknown): OrganizationInvitationSummary {
  const invitation = readRecord(value) ?? {};
  const expiresAt = readDateString(invitation, "expiresAt");
  const inviterId = readString(invitation, "inviterId");
  return {
    invitationId: readString(invitation, "id") ?? "",
    organizationId: readString(invitation, "organizationId") ?? "",
    email: readString(invitation, "email") ?? "",
    role: normalizeOrganizationTeamRole(readString(invitation, "role")) ?? "developer",
    status: normalizeInvitationStatus(readString(invitation, "status")),
    createdAt: readDateString(invitation, "createdAt") ?? new Date(0).toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    ...(inviterId ? { inviter: { userId: inviterId } } : {}),
  };
}

function normalizeProductOrganizationRole(
  role: string | undefined,
): ProductOrganizationRole | null {
  if (!role) {
    return null;
  }
  const roles = role
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (roles.includes("owner")) {
    return "owner";
  }
  if (roles.includes("admin")) {
    return "admin";
  }
  if (roles.includes("member")) {
    return "member";
  }
  if (roles.includes("billing") || roles.includes("developer") || roles.includes("viewer")) {
    return "member";
  }
  return null;
}

function productRoleAllows(role: ProductOrganizationRole, requiredRole: ProductOrganizationRole) {
  const rank: Record<ProductOrganizationRole, number> = {
    member: 1,
    admin: 2,
    owner: 3,
  };
  return rank[role] >= rank[requiredRole];
}

function productRoleToOrganizationRole(role: ProductOrganizationRole): OrganizationTeamRole {
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "developer";
}

function productAuthMissing(
  input: ProductSessionAuthorizationInput,
  reasonCode: string,
): DomainError {
  return {
    code: "product_auth_missing",
    category: "user",
    message: "Product operation requires a valid session",
    retryable: false,
    details: productAuthDetails(input, "product-authentication", reasonCode),
  };
}

function productAuthInvalid(
  input: ProductSessionAuthorizationInput,
  reasonCode: string,
): DomainError {
  return {
    code: "product_auth_invalid",
    category: "user",
    message: "Product session is invalid",
    retryable: false,
    details: productAuthDetails(input, "product-authentication", reasonCode),
  };
}

function productAuthForbidden(
  input: ProductSessionAuthorizationInput,
  reasonCode: string,
  actualRole?: ProductOrganizationRole,
): DomainError {
  return {
    code: "product_auth_forbidden",
    category: "user",
    message: "Product session is not authorized for this operation",
    retryable: false,
    details: {
      ...productAuthDetails(input, "product-authorization", reasonCode),
      ...(actualRole ? { actualRole } : {}),
    },
  };
}

function productAuthDetails(
  input: ProductSessionAuthorizationInput,
  phase: "product-authentication" | "product-authorization",
  reasonCode: string,
) {
  return {
    endpoint: input.path,
    method: input.method,
    phase,
    reasonCode,
    requiredRole: input.requiredRole,
    ...(input.organizationId ? { organizationId: input.organizationId } : {}),
  };
}

export interface StaticActionDeployTokenScope {
  environmentId?: string;
  projectId?: string;
  repositoryFullName?: string;
  resourceId?: string;
  serverId?: string;
  workflows?: readonly ActionDeployTokenAuthorizationInput["workflow"][];
}

function staticActionDeployTokenScope(
  scope: StaticActionDeployTokenScope,
): ActionDeployTokenResolvedScope {
  return {
    environmentIds: scope.environmentId ? [scope.environmentId] : [],
    projectIds: scope.projectId ? [scope.projectId] : [],
    repositoryFullNames: scope.repositoryFullName ? [scope.repositoryFullName] : [],
    resourceIds: scope.resourceId ? [scope.resourceId] : [],
    serverIds: scope.serverId ? [scope.serverId] : [],
  };
}

export class StaticActionDeployTokenAuthorizationPort
  implements ActionDeployTokenAuthorizationPort
{
  private readonly token: string | undefined;
  private readonly scope: StaticActionDeployTokenScope;

  constructor(input: { scope?: StaticActionDeployTokenScope; token?: string }) {
    const token = input.token?.trim();
    this.token = token ? token : undefined;
    this.scope = input.scope ?? {};
  }

  authorize(
    _context: ExecutionContext,
    input: ActionDeployTokenAuthorizationInput,
  ): Promise<Result<ActionDeployTokenAuthorizationResult>> {
    if (!this.token) {
      return Promise.resolve(
        err({
          code: "action_auth_invalid",
          category: "user",
          message: "Action deploy token authorization is not configured",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "action-authentication",
            reasonCode: "verifier-unavailable",
            workflow: input.workflow,
          },
        }),
      );
    }

    if (!timingSafeStringEqual(input.token, this.token)) {
      return Promise.resolve(
        err({
          code: "action_auth_invalid",
          category: "user",
          message: "Action deploy token is invalid",
          retryable: false,
          details: {
            endpoint: input.path,
            phase: "action-authentication",
            reasonCode: "unknown",
            workflow: input.workflow,
          },
        }),
      );
    }

    const scopeFailure = this.scopeFailure(input);
    if (scopeFailure) {
      return Promise.resolve(err(scopeFailure));
    }

    return Promise.resolve(
      ok({
        actor: {
          kind: "deploy-token",
          id: "dtok_static_self_hosted",
          label: "Self-hosted deploy token",
        },
        scope: staticActionDeployTokenScope(this.scope),
      }),
    );
  }

  private scopeFailure(input: ActionDeployTokenAuthorizationInput) {
    const allowedWorkflows = this.scope.workflows;
    if (allowedWorkflows && !allowedWorkflows.includes(input.workflow)) {
      return actionAuthForbidden(input, "workflow-command", "scope_value_not_allowed");
    }

    const requested = input.requestedScope;
    if (!requested) {
      return this.missingRequestedScopeFailure(input);
    }

    if (!requested.projectId && this.scope.projectId) {
      return actionAuthForbidden(input, "project", "scope_value_missing");
    }

    if (this.scope.projectId && requested.projectId !== this.scope.projectId) {
      return actionAuthForbidden(input, "project", "scope_value_not_allowed");
    }

    if (!requested.environmentId && this.scope.environmentId) {
      return actionAuthForbidden(input, "environment", "scope_value_missing");
    }

    if (this.scope.environmentId && requested.environmentId !== this.scope.environmentId) {
      return actionAuthForbidden(input, "environment", "scope_value_not_allowed");
    }

    if (!requested.resourceId && this.scope.resourceId) {
      return actionAuthForbidden(input, "resource", "scope_value_missing");
    }

    if (this.scope.resourceId && requested.resourceId !== this.scope.resourceId) {
      return actionAuthForbidden(input, "resource", "scope_value_not_allowed");
    }

    if (!requested.serverId && this.scope.serverId) {
      return actionAuthForbidden(input, "deployment-target", "scope_value_missing");
    }

    if (this.scope.serverId && requested.serverId !== this.scope.serverId) {
      return actionAuthForbidden(input, "deployment-target", "scope_value_not_allowed");
    }

    if (!requested.repositoryFullName && this.scope.repositoryFullName) {
      return actionAuthForbidden(input, "repository", "scope_value_missing");
    }

    if (
      this.scope.repositoryFullName &&
      requested.repositoryFullName !== this.scope.repositoryFullName
    ) {
      return actionAuthForbidden(input, "repository", "scope_value_not_allowed");
    }

    return undefined;
  }

  private missingRequestedScopeFailure(input: ActionDeployTokenAuthorizationInput) {
    if (this.scope.projectId) {
      return actionAuthForbidden(input, "project", "scope_value_missing");
    }

    if (this.scope.environmentId) {
      return actionAuthForbidden(input, "environment", "scope_value_missing");
    }

    if (this.scope.resourceId) {
      return actionAuthForbidden(input, "resource", "scope_value_missing");
    }

    if (this.scope.serverId) {
      return actionAuthForbidden(input, "deployment-target", "scope_value_missing");
    }

    if (this.scope.repositoryFullName) {
      return actionAuthForbidden(input, "repository", "scope_value_missing");
    }

    return undefined;
  }
}

export class PersistedActionDeployTokenAuthorizationPort
  implements ActionDeployTokenAuthorizationPort
{
  constructor(
    private readonly input: {
      clock: Clock;
      repository: DeployTokenRepository;
    },
  ) {}

  async authorize(
    context: ExecutionContext,
    input: ActionDeployTokenAuthorizationInput,
  ): Promise<Result<ActionDeployTokenAuthorizationResult>> {
    const digest = await sha256VerifierDigest(input.token);
    const verifierDigest = DeployTokenVerifierDigest.create(digest);
    if (verifierDigest.isErr()) {
      return err(actionAuthInvalid(input, "malformed-verifier"));
    }

    const now = CreatedAt.create(this.input.clock.now());
    if (now.isErr()) {
      return err(actionAuthInvalid(input, "verifier-unavailable"));
    }

    try {
      const repositoryContext = toRepositoryContext(context);
      const deployToken = await this.input.repository.findOne(
        repositoryContext,
        ActiveDeployTokenByVerifierDigestSpec.create(verifierDigest.value, now.value),
      );

      if (!deployToken) {
        return err(actionAuthInvalid(input, "unknown"));
      }

      const workflowCommand = DeployTokenWorkflowCommandValue.create(input.workflow);
      if (workflowCommand.isErr()) {
        return err(actionAuthForbidden(input, "workflow-command", "scope_value_not_allowed"));
      }

      const scopeAuthorization = deployToken.authorizeScope(
        toScopeRequest(input, workflowCommand.value),
      );
      if (!scopeAuthorization.allowed) {
        return err(
          actionAuthForbidden(input, scopeAuthorization.deniedScope, scopeAuthorization.reasonCode),
        );
      }

      const lastUsedAt = LastUsedAt.create(this.input.clock.now());
      if (lastUsedAt.isOk()) {
        deployToken.markUsed(lastUsedAt.value);
        await this.input.repository.updateOne(
          repositoryContext,
          deployToken,
          MarkDeployTokenUsedSpec.fromDeployToken(deployToken),
        );
      }

      const state = deployToken.toState();
      const scope = state.scope.toState();
      return ok({
        actor: {
          kind: "deploy-token",
          id: state.id.value,
          label: state.displayName.value,
        },
        organizationId: state.organizationId.value,
        scope: {
          environmentIds: scope.environmentIds.map((id) => id.value),
          projectIds: scope.projectIds.map((id) => id.value),
          repositoryFullNames: scope.repositoryFullNames.map((name) => name.value),
          resourceIds: scope.resourceIds.map((id) => id.value),
          serverIds: scope.deploymentTargetIds.map((id) => id.value),
        },
      });
    } catch {
      return err(actionAuthInvalid(input, "verifier-unavailable"));
    }
  }
}

export class BetterAuthDeployTokenMaterialIssuer implements DeployTokenMaterialIssuer {
  async issue(_context: ExecutionContext): Promise<Result<DeployTokenMaterial>> {
    try {
      const token = `aplt_dt_${randomHex(32)}`;
      const verifierDigest = DeployTokenVerifierDigest.create(await sha256VerifierDigest(token));
      if (verifierDigest.isErr()) {
        return err(verifierDigest.error);
      }

      const secretSuffix = DeployTokenSecretSuffix.create(token.slice(-8));
      if (secretSuffix.isErr()) {
        return err(secretSuffix.error);
      }

      return ok({
        token,
        verifierDigest: verifierDigest.value,
        secretSuffix: secretSuffix.value,
      });
    } catch {
      return err({
        code: "deploy_token_material_unavailable",
        category: "infra",
        message: "Deploy token material could not be issued",
        retryable: true,
        details: {
          phase: "deploy-token-material",
        },
      });
    }
  }
}

function actionAuthForbidden(
  input: ActionDeployTokenAuthorizationInput,
  deniedScope: DeployTokenAuthorizationScopeDimension,
  reasonCode: DeployTokenAuthorizationScopeDenyReason,
) {
  return {
    code: "action_auth_forbidden",
    category: "user",
    message: "Action deploy token is not authorized for this request",
    retryable: false,
    details: {
      deniedScope,
      endpoint: input.path,
      missingScope: deniedScope,
      phase: "action-authorization",
      reasonCode,
      workflow: input.workflow,
      ...(input.requestedScope?.projectId ? { projectId: input.requestedScope.projectId } : {}),
      ...(input.requestedScope?.environmentId
        ? { environmentId: input.requestedScope.environmentId }
        : {}),
      ...(input.requestedScope?.resourceId ? { resourceId: input.requestedScope.resourceId } : {}),
      ...(input.requestedScope?.serverId ? { serverId: input.requestedScope.serverId } : {}),
      ...(input.requestedScope?.repositoryFullName
        ? { repositoryFullName: input.requestedScope.repositoryFullName }
        : {}),
    },
  } as const;
}

function actionAuthInvalid(input: ActionDeployTokenAuthorizationInput, reasonCode: string) {
  return {
    code: "action_auth_invalid",
    category: "user",
    message: "Action deploy token is invalid",
    retryable: false,
    details: {
      endpoint: input.path,
      phase: "action-authentication",
      reasonCode,
      workflow: input.workflow,
    },
  } as const;
}

function toScopeRequest(
  input: ActionDeployTokenAuthorizationInput,
  workflowCommand: DeployTokenWorkflowCommandValue,
) {
  const requestedScope: ActionDeployTokenRequestedScope = input.requestedScope ?? {};

  return {
    workflowCommand,
    ...(requestedScope.projectId
      ? { projectId: ProjectId.rehydrate(requestedScope.projectId) }
      : {}),
    ...(requestedScope.environmentId
      ? { environmentId: EnvironmentId.rehydrate(requestedScope.environmentId) }
      : {}),
    ...(requestedScope.resourceId
      ? { resourceId: ResourceId.rehydrate(requestedScope.resourceId) }
      : {}),
    ...(requestedScope.serverId
      ? { deploymentTargetId: DeploymentTargetId.rehydrate(requestedScope.serverId) }
      : {}),
    ...(requestedScope.repositoryFullName
      ? {
          repositoryFullName: SourceRepositoryFullName.rehydrate(requestedScope.repositoryFullName),
        }
      : {}),
  };
}

async function sha256VerifierDigest(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return diff === 0;
}
