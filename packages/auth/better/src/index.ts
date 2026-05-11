import {
  type ActionDeployTokenAuthorizationInput,
  type ActionDeployTokenAuthorizationPort,
  type ActionDeployTokenAuthorizationResult,
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
  type UpdateOrganizationMemberRoleInput,
} from "@appaloft/application";
import {
  ActiveDeployTokenByVerifierDigestSpec,
  CreatedAt,
  DeploymentTargetId,
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
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { bearer, organization } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";

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

export interface BetterAuthRuntimeConfig {
  enabled: boolean;
  baseURL: string;
  secret: string;
  database?: BetterAuthOptions["database"];
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
  trustedOrigins?: readonly string[];
}

export interface AuthRuntime
  extends FirstAdminBootstrapper,
    OrganizationTeamManagementPort,
    ProductSessionAuthorizationPort {
  getSessionStatus(request: Request): Promise<AuthSessionStatus>;
  getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null>;
  handle(request: Request): Promise<Response>;
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
  private readonly auth;
  private readonly githubConfigured: boolean;
  private readonly googleConfigured: boolean;
  private readonly oidcConfigured: boolean;

  constructor(private readonly config: BetterAuthRuntimeConfig) {
    const hasTrustedOrigin = Boolean(config.trustedOrigins?.length);
    this.githubConfigured = Boolean(
      config.githubClientId &&
        config.githubClientSecret &&
        config.githubRedirectUri &&
        hasTrustedOrigin,
    );
    this.googleConfigured = Boolean(
      config.googleClientId &&
        config.googleClientSecret &&
        config.googleRedirectUri &&
        hasTrustedOrigin,
    );
    this.oidcConfigured = Boolean(
      config.oidcClientId &&
        config.oidcClientSecret &&
        config.oidcDiscoveryUrl &&
        config.oidcRedirectUri &&
        hasTrustedOrigin,
    );
    const socialProviders = this.socialProviders();
    this.auth = betterAuth({
      baseURL: this.config.baseURL,
      basePath: "/api/auth",
      secret: this.config.secret,
      ...(this.config.database ? { database: this.config.database } : {}),
      ...(this.config.trustedOrigins?.length
        ? { trustedOrigins: [...this.config.trustedOrigins] }
        : {}),
      account: {
        storeAccountCookie: true,
      },
      emailAndPassword: {
        enabled: true,
      },
      plugins: [
        bearer(),
        organization(),
        ...(this.oidcConfigured &&
        this.config.oidcClientId &&
        this.config.oidcClientSecret &&
        this.config.oidcDiscoveryUrl &&
        this.config.oidcRedirectUri
          ? [
              genericOAuth({
                config: [
                  {
                    providerId: "oidc",
                    clientId: this.config.oidcClientId,
                    clientSecret: this.config.oidcClientSecret,
                    discoveryUrl: this.config.oidcDiscoveryUrl,
                    redirectURI: this.config.oidcRedirectUri,
                    scopes: ["openid", "email", "profile"],
                    pkce: true,
                    ...(this.config.oidcIssuer
                      ? {
                          issuer: this.config.oidcIssuer,
                          requireIssuerValidation: true,
                        }
                      : {}),
                  },
                ],
              }),
            ]
          : []),
      ],
      ...(Object.keys(socialProviders).length > 0
        ? {
            socialProviders,
          }
        : {}),
    });
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
      loginRequired: false,
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

    return this.auth.handler(request);
  }

  private hasConfiguredOAuthProvider(): boolean {
    return this.githubConfigured || this.googleConfigured || this.oidcConfigured;
  }

  private socialProviders(): NonNullable<BetterAuthOptions["socialProviders"]> {
    const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
    if (
      this.githubConfigured &&
      this.config.githubClientId &&
      this.config.githubClientSecret &&
      this.config.githubRedirectUri
    ) {
      socialProviders.github = {
        clientId: this.config.githubClientId,
        clientSecret: this.config.githubClientSecret,
        redirectURI: this.config.githubRedirectUri,
      };
    }
    if (
      this.googleConfigured &&
      this.config.googleClientId &&
      this.config.googleClientSecret &&
      this.config.googleRedirectUri
    ) {
      socialProviders.google = {
        clientId: this.config.googleClientId,
        clientSecret: this.config.googleClientSecret,
        redirectURI: this.config.googleRedirectUri,
      };
    }
    return socialProviders;
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

      const organizationId =
        input.organizationId ?? readString(sessionObject, "activeOrganizationId");
      if (!organizationId) {
        return err(productAuthForbidden(input, "active-organization-missing"));
      }

      const activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: {
          organizationId,
        },
      });
      const role = normalizeProductOrganizationRole(readString(activeRole, "role"));
      if (!role) {
        return err(productAuthForbidden(input, "organization-member-missing"));
      }
      if (!productRoleAllows(role, input.requiredRole)) {
        return err(productAuthForbidden(input, "role-insufficient", role));
      }

      const email = readString(userObject, "email");
      return ok({
        actor: {
          kind: "user",
          id: userId,
          ...(email ? { label: email } : {}),
        },
        ...(email ? { email } : {}),
        organizationId,
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
      const activeOrganizationId =
        readString(sessionObject, "activeOrganizationId") ??
        organizationSummaries[0]?.organizationId;
      if (!activeOrganizationId) {
        return err(productAuthForbidden(authInput, "active-organization-missing"));
      }

      const activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId: activeOrganizationId },
      });
      const currentRole = normalizeOrganizationTeamRole(readString(activeRole, "role"));
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

      const displayName = readString(userObject, "name");
      const avatarUrl = readString(userObject, "image");

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
    input: UpdateOrganizationMemberRoleInput,
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
          "update-member-role-failed",
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
      }),
    );
  }

  private scopeFailure(input: ActionDeployTokenAuthorizationInput) {
    const allowedWorkflows = this.scope.workflows;
    if (allowedWorkflows && !allowedWorkflows.includes(input.workflow)) {
      return actionAuthForbidden(input, "workflow-command");
    }

    const requested = input.requestedScope;
    if (!requested) {
      return undefined;
    }

    if (
      this.scope.projectId &&
      requested.projectId &&
      requested.projectId !== this.scope.projectId
    ) {
      return actionAuthForbidden(input, "project");
    }

    if (
      this.scope.environmentId &&
      requested.environmentId &&
      requested.environmentId !== this.scope.environmentId
    ) {
      return actionAuthForbidden(input, "environment");
    }

    if (
      this.scope.resourceId &&
      requested.resourceId &&
      requested.resourceId !== this.scope.resourceId
    ) {
      return actionAuthForbidden(input, "resource");
    }

    if (this.scope.serverId && requested.serverId && requested.serverId !== this.scope.serverId) {
      return actionAuthForbidden(input, "server");
    }

    if (
      this.scope.repositoryFullName &&
      requested.repositoryFullName &&
      requested.repositoryFullName !== this.scope.repositoryFullName
    ) {
      return actionAuthForbidden(input, "repository");
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
        return err(actionAuthForbidden(input, "workflow-command"));
      }

      if (!deployToken.authorizesScope(toScopeRequest(input, workflowCommand.value))) {
        return err(actionAuthForbidden(input, "scope"));
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
      return ok({
        actor: {
          kind: "deploy-token",
          id: state.id.value,
          label: state.displayName.value,
        },
        organizationId: state.organizationId.value,
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

function actionAuthForbidden(input: ActionDeployTokenAuthorizationInput, missingScope: string) {
  return {
    code: "action_auth_forbidden",
    category: "user",
    message: "Action deploy token is not authorized for this request",
    retryable: false,
    details: {
      endpoint: input.path,
      missingScope,
      phase: "action-authorization",
      workflow: input.workflow,
      ...(input.requestedScope?.projectId ? { projectId: input.requestedScope.projectId } : {}),
      ...(input.requestedScope?.environmentId
        ? { environmentId: input.requestedScope.environmentId }
        : {}),
      ...(input.requestedScope?.resourceId ? { resourceId: input.requestedScope.resourceId } : {}),
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
  return {
    workflowCommand,
    ...(input.requestedScope?.projectId
      ? { projectId: ProjectId.rehydrate(input.requestedScope.projectId) }
      : {}),
    ...(input.requestedScope?.environmentId
      ? { environmentId: EnvironmentId.rehydrate(input.requestedScope.environmentId) }
      : {}),
    ...(input.requestedScope?.resourceId
      ? { resourceId: ResourceId.rehydrate(input.requestedScope.resourceId) }
      : {}),
    ...(input.requestedScope?.serverId
      ? { deploymentTargetId: DeploymentTargetId.rehydrate(input.requestedScope.serverId) }
      : {}),
    ...(input.requestedScope?.repositoryFullName
      ? {
          repositoryFullName: SourceRepositoryFullName.rehydrate(
            input.requestedScope.repositoryFullName,
          ),
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
