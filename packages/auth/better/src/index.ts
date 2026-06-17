import "reflect-metadata";

import {
  type AccountProfileSummary,
  type AccountSessionSummary,
  type AccountSettingsPort,
  type ActionDeployTokenAuthorizationInput,
  type ActionDeployTokenAuthorizationPort,
  type ActionDeployTokenAuthorizationResult,
  type ActionDeployTokenRequestedScope,
  type ActionDeployTokenResolvedScope,
  type AppLogger,
  type ChangeAccountProfileInput,
  type ChangeOrganizationMemberRoleInput,
  type ChangeOrganizationProfileInput,
  type Clock,
  type CurrentOrganizationContext,
  type DeleteAccountInput,
  type DeleteOrganizationInput,
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
  type OrganizationProfileSummary,
  type OrganizationTeamManagementPort,
  type OrganizationTeamRole,
  type ProductOrganizationRole,
  type ProductSessionAuthorizationInput,
  type ProductSessionAuthorizationPort,
  type ProductSessionAuthorizationResult,
  type ReactivateOrganizationMemberInput,
  type RemoveOrganizationMemberInput,
  type RevokeAccountSessionInput,
  type SwitchCurrentOrganizationInput,
  type TransferOrganizationOwnerInput,
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
import { makeSignature } from "better-auth/crypto";
import {
  type AppaloftBetterAuth,
  type AppaloftBetterAuthAccountRecoveryStatus,
  type AppaloftBetterAuthAccountSecurityStatus,
  type AppaloftBetterAuthConfig,
  type AppaloftBetterAuthEmailVerificationStatus,
  type AppaloftBetterAuthMagicLinkStatus,
  createAppaloftBetterAuth,
  resolveAppaloftBetterAuthAccountRecoveryStatus,
  resolveAppaloftBetterAuthAccountSecurityStatus,
  resolveAppaloftBetterAuthEmailVerificationStatus,
  resolveAppaloftBetterAuthMagicLinkStatus,
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

export interface AuthPublicProviderStatus {
  key: AuthProviderKey;
  title: string;
  configured: boolean;
  deferred: boolean;
  connectPath?: string;
  reason?: string;
}

export interface AuthPublicConfig {
  schemaVersion: "appaloft.auth.public-config/v1";
  enabled: boolean;
  provider: "none" | "better-auth";
  providers: AuthPublicProviderStatus[];
}

export interface AuthSessionStatus {
  accountSecurity: AppaloftBetterAuthAccountSecurityStatus;
  accountRecovery: AppaloftBetterAuthAccountRecoveryStatus;
  currentUserOrganizationCount?: number;
  enabled: boolean;
  emailVerification: AppaloftBetterAuthEmailVerificationStatus;
  magicLink: AppaloftBetterAuthMagicLinkStatus;
  provider: "none" | "better-auth";
  loginRequired: boolean;
  deferredAuth: boolean;
  session: unknown | null;
  providers: AuthProviderStatus[];
}

export interface BetterAuthRuntimeConfig extends AppaloftBetterAuthConfig {
  enabled: boolean;
  logger?: AppLogger;
  organizationAdmission?: BetterAuthOrganizationAdmissionPort;
}

export interface AuthRuntime
  extends FirstAdminBootstrapper,
    AccountSettingsPort,
    OrganizationTeamManagementPort,
    ProductSessionAuthorizationPort {
  getPublicConfig(): AuthPublicConfig;
  getSessionStatus(request: Request): Promise<AuthSessionStatus>;
  getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null>;
  issueCliProductSessionCookie(request: Request): Promise<string | null>;
  handle(request: Request): Promise<Response>;
}

export type BetterAuthOrganizationProvisionReason =
  | "default-organization"
  | "pending-verification-intent";

interface BetterAuthRequestCache {
  activeMemberRoles: Map<string, Promise<unknown>>;
  organizations?: Promise<Record<string, unknown>[]>;
  session?: Promise<unknown | null>;
}

export interface BetterAuthOrganizationAdmissionRequest {
  readonly currentUserOrganizationCount?: number;
  readonly email?: string;
  readonly name: string;
  readonly reason: BetterAuthOrganizationProvisionReason;
  readonly slug: string;
  readonly userId: string;
}

export interface BetterAuthOrganizationAdmissionDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly details?: Record<string, unknown>;
}

export interface BetterAuthOrganizationAdmissionPort {
  admitOrganizationCreate(
    request: BetterAuthOrganizationAdmissionRequest,
  ): Promise<BetterAuthOrganizationAdmissionDecision>;
}

interface ProvisionedDefaultOrganization {
  organizationId: string;
  name: string;
  role: "owner";
  slug: string;
}

interface DirectAuthDatabase {
  selectFrom(table: string): DirectMemberQueryBuilder;
  updateTable(table: string): DirectMemberUpdateBuilder;
}

interface DirectMemberQueryBuilder {
  innerJoin(table: string, leftColumn: string, rightColumn: string): DirectMemberQueryBuilder;
  select(selection: readonly string[]): DirectMemberQueryBuilder;
  where(column: string, operator: "=", value: string): DirectMemberQueryBuilder;
  limit(limit: number): DirectMemberQueryBuilder;
  execute(): Promise<Record<string, unknown>[]>;
}

interface DirectMemberUpdateBuilder {
  set(values: Record<string, unknown>): DirectMemberUpdateBuilder;
  where(column: string, operator: "=", value: string): DirectMemberUpdateBuilder;
  returning(selection: readonly string[]): DirectMemberUpdateBuilder;
  executeTakeFirst(): Promise<Record<string, unknown> | undefined>;
}

type ForcedIdCreateAdapter = {
  create<T extends Record<string, unknown>, R = T>(input: {
    model: string;
    data: T & { id: string };
    select?: string[] | undefined;
    forceAllowId: true;
  }): Promise<R>;
};

type DirectMemberListReadback =
  | { result: Result<{ items: OrganizationMemberSummary[]; nextCursor?: string }> }
  | { reasonCode: string };

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
  private readonly accountRecovery: AppaloftBetterAuthAccountRecoveryStatus;
  private readonly emailVerification: AppaloftBetterAuthEmailVerificationStatus;
  private readonly githubConfigured: boolean;
  private readonly googleConfigured: boolean;
  private readonly magicLink: AppaloftBetterAuthMagicLinkStatus;
  private readonly organizationAdmission: BetterAuthOrganizationAdmissionPort | undefined;
  private readonly oidcConfigured: boolean;
  private readonly requestCaches = new WeakMap<ExecutionContext, BetterAuthRequestCache>();

  constructor(private readonly config: BetterAuthRuntimeConfig) {
    const providers = resolveAppaloftBetterAuthProviderConfig(config);
    this.accountRecovery = resolveAppaloftBetterAuthAccountRecoveryStatus(config);
    this.emailVerification = resolveAppaloftBetterAuthEmailVerificationStatus(config);
    this.githubConfigured = providers.github;
    this.googleConfigured = providers.google;
    this.magicLink = resolveAppaloftBetterAuthMagicLinkStatus(config);
    this.organizationAdmission = config.organizationAdmission;
    this.oidcConfigured = providers.oidc;
    this.auth = createAppaloftBetterAuth(config);
  }

  getPublicConfig(): AuthPublicConfig {
    if (!this.config.enabled) {
      return disabledPublicAuthConfig();
    }

    return {
      schemaVersion: "appaloft.auth.public-config/v1",
      enabled: true,
      provider: "better-auth",
      providers: publicProviderStatuses({
        github: this.githubConfigured,
        google: this.googleConfigured,
        oidc: this.oidcConfigured,
      }),
    };
  }

  async getSessionStatus(request: Request): Promise<AuthSessionStatus> {
    if (!this.config.enabled) {
      return {
        accountSecurity: disabledAccountSecurityStatus(),
        accountRecovery: disabledAccountRecoveryStatus(),
        enabled: false,
        emailVerification: disabledEmailVerificationStatus(),
        magicLink: disabledMagicLinkStatus(),
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

    const session = await this.resolveSessionStatusSession(request);
    const accounts = session ? await this.resolveSessionStatusAccounts(request) : [];
    const currentUserOrganizationCount = session
      ? await this.resolveSessionStatusOrganizationCount(request)
      : undefined;
    const passwordState = session ? resolvePasswordState(accounts) : "unknown";
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
      accountSecurity: resolveAppaloftBetterAuthAccountSecurityStatus({ passwordState }),
      accountRecovery: this.accountRecovery,
      ...(currentUserOrganizationCount !== undefined ? { currentUserOrganizationCount } : {}),
      enabled: true,
      emailVerification: this.emailVerification,
      magicLink: this.magicLink,
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

  private async resolveSessionStatusSession(request: Request): Promise<unknown | null> {
    try {
      return await this.auth.api.getSession({
        headers: request.headers,
      });
    } catch (error) {
      this.logSessionStatusReadFailure("session", error);
      return null;
    }
  }

  private async resolveSessionStatusAccounts(request: Request): Promise<unknown[]> {
    try {
      const accounts = await this.auth.api.listUserAccounts({
        headers: request.headers,
      });
      return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
      this.logSessionStatusReadFailure("accounts", error);
      return [];
    }
  }

  private async resolveSessionStatusOrganizationCount(
    request: Request,
  ): Promise<number | undefined> {
    try {
      return await this.currentUserOrganizationCount(request.headers);
    } catch (error) {
      this.logSessionStatusReadFailure("organization-count", error);
      return undefined;
    }
  }

  private logSessionStatusReadFailure(
    phase: "accounts" | "organization-count" | "session",
    error: unknown,
  ): void {
    this.config.logger?.warn("auth_session_status_read_failed", {
      phase,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
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

  async issueCliProductSessionCookie(request: Request): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    if (!session) {
      return null;
    }

    const sessionObject = readObject(session, "session");
    const userObject = readObject(session, "user");
    const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
    if (!userId) {
      return null;
    }

    const authContext = await this.auth.$context;
    const ipAddress = trustedRequestIp(request.headers);
    const cliSession = await authContext.internalAdapter.createSession(userId, false, {
      ...(ipAddress ? { ipAddress } : {}),
      userAgent: "appaloft-cli browser-auth-exchange",
    });
    const signedToken = `${cliSession.token}.${await makeSignature(cliSession.token, this.config.secret)}`;
    return `${authContext.authCookies.sessionToken.name}=${signedToken}`;
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

    if (isSetPasswordHttpWrapperRequest(request)) {
      return this.handleSetPasswordHttpWrapper(request);
    }

    const response = await this.auth.handler(request);
    await this.consumePendingVerificationIntentAfterAuthRoute(request, response);
    await this.ensureDefaultOrganizationAfterAuthRoute(request, response);
    return response;
  }

  private async handleSetPasswordHttpWrapper(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: {
            code: "method_not_allowed",
            message: "Set password requires POST.",
          },
        },
        405,
      );
    }

    const body = await readJsonObject(request);
    const newPassword = readString(body, "newPassword");
    if (!newPassword) {
      return jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "newPassword is required.",
          },
        },
        400,
      );
    }

    try {
      const result = await this.auth.api.setPassword({
        headers: request.headers,
        body: {
          newPassword,
        },
      });
      return jsonResponse(result, 200);
    } catch (error) {
      return betterAuthErrorResponse(error);
    }
  }

  private requestCache(context: ExecutionContext): BetterAuthRequestCache {
    const cached = this.requestCaches.get(context);
    if (cached) {
      return cached;
    }
    const created: BetterAuthRequestCache = {
      activeMemberRoles: new Map(),
    };
    this.requestCaches.set(context, created);
    return created;
  }

  private clearRequestCache(context: ExecutionContext): void {
    this.requestCaches.delete(context);
  }

  private async getCachedSession(
    context: ExecutionContext,
    headers: Headers,
  ): Promise<unknown | null> {
    const cache = this.requestCache(context);
    cache.session ??= this.auth.api.getSession({ headers });
    return cache.session;
  }

  private async getCachedVisibleOrganizations(
    context: ExecutionContext,
    headers: Headers,
  ): Promise<Record<string, unknown>[]> {
    const cache = this.requestCache(context);
    cache.organizations ??= this.visibleOrganizations(headers);
    return cache.organizations;
  }

  private async getCachedActiveMemberRole(
    context: ExecutionContext,
    headers: Headers,
    organizationId: string,
  ): Promise<unknown> {
    const cache = this.requestCache(context);
    let activeRole = cache.activeMemberRoles.get(organizationId);
    if (!activeRole) {
      activeRole = this.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId },
      });
      cache.activeMemberRoles.set(organizationId, activeRole);
    }
    return activeRole;
  }

  private async firstVisibleOrganizationId(
    headers: Headers,
    context?: ExecutionContext,
  ): Promise<string | undefined> {
    return (
      context
        ? await this.getCachedVisibleOrganizations(context, headers)
        : await this.visibleOrganizations(headers)
    )
      .map(
        (organization) =>
          readString(organization, "id") ?? readString(organization, "organizationId"),
      )
      .find((organizationId) => Boolean(organizationId));
  }

  private async visibleOrganizations(headers: Headers): Promise<Record<string, unknown>[]> {
    return toArray(await this.auth.api.listOrganizations({ headers }));
  }

  private async currentUserOrganizationCount(headers: Headers): Promise<number | undefined> {
    try {
      return (await this.visibleOrganizations(headers)).length;
    } catch {
      return undefined;
    }
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
    context?: ExecutionContext,
  ): Promise<{ organizationId: string; role: ProductOrganizationRole } | null> {
    const organizationId = await this.firstVisibleOrganizationId(headers, context);
    if (!organizationId) {
      return null;
    }

    const activeRole = context
      ? await this.getCachedActiveMemberRole(context, headers, organizationId)
      : await this.auth.api.getActiveMemberRole({
          headers,
          query: { organizationId },
        });
    const role = normalizeProductOrganizationRole(readString(activeRole, "role"));
    if (!role) {
      return null;
    }
    const status = await this.activeOrganizationMemberStatus(context, headers, organizationId);
    return status === "deactivated" ? null : { organizationId, role };
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

  private async consumePendingVerificationIntentAfterAuthRoute(
    request: Request,
    response: Response,
  ): Promise<void> {
    if (response.status >= 400 || !shouldConsumePendingVerificationIntentAfterAuthRoute(request)) {
      return;
    }

    const headers = authResponseSessionHeaders(request.headers, response.headers);
    if (!headers) {
      return;
    }

    try {
      await this.consumePendingVerificationIntentForHeaders(headers);
    } catch {
      // Verification succeeds independently; product authorization remains fail-closed.
    }
  }

  private async consumePendingVerificationIntentForHeaders(headers: Headers): Promise<void> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) {
      return;
    }

    const sessionObject = readObject(session, "session");
    const userObject = readObject(session, "user");
    const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
    if (!userId) {
      return;
    }

    const authContext = await this.auth.$context;
    const rawUser = await authContext.internalAdapter.findUserById(userId);
    const intentValue = readString(rawUser, "appaloftPendingVerificationIntent");
    if (!intentValue) {
      return;
    }

    const intent = parsePendingVerificationIntent(intentValue);
    await this.clearPendingVerificationIntent(authContext, userId);
    if (!intent) {
      return;
    }
    const visibleOrganizations = await this.visibleOrganizations(headers);
    if (visibleOrganizations.length > 0) {
      return;
    }
    const email = readString(userObject, "email");

    for (const slug of [intent.organizationSlug, `${intent.organizationSlug}-${randomHex(2)}`]) {
      try {
        const admitted = await this.admitOrganizationCreate({
          name: intent.organizationName,
          reason: "pending-verification-intent",
          slug,
          userId,
          currentUserOrganizationCount: visibleOrganizations.length,
          ...(email ? { email } : {}),
        });
        if (!admitted.allowed) {
          return;
        }

        const organization = await this.auth.api.createOrganization({
          headers,
          body: {
            keepCurrentActiveOrganization: false,
            name: intent.organizationName,
            slug,
            userId,
          },
        });
        const organizationId = readString(organization, "id");
        if (organizationId) {
          await this.rememberActiveOrganization(headers, organizationId);
          return;
        }
      } catch {
        const visibleOrganizationId = await this.firstVisibleOrganizationId(headers);
        if (visibleOrganizationId) {
          await this.rememberActiveOrganization(headers, visibleOrganizationId);
          return;
        }
      }
    }
  }

  private async clearPendingVerificationIntent(
    authContext: Awaited<AppaloftBetterAuth["$context"]>,
    userId: string,
  ): Promise<void> {
    await authContext.internalAdapter.updateUser(userId, {
      appaloftPendingVerificationIntent: null,
    });
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
    if (!userId) {
      return null;
    }
    const visibleOrganizations = await this.visibleOrganizations(headers);
    if (visibleOrganizations.length > 0) {
      return null;
    }

    const email = readString(userObject, "email");
    const displayName = readString(userObject, "name");
    return this.provisionDefaultOrganizationForSession({
      ...(displayName ? { displayName } : {}),
      ...(email ? { email } : {}),
      currentUserOrganizationCount: visibleOrganizations.length,
      headers,
      userId,
    });
  }

  private async provisionDefaultOrganizationForSession(input: {
    currentUserOrganizationCount?: number;
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
        const admitted = await this.admitOrganizationCreate({
          ...(input.email ? { email: input.email } : {}),
          name,
          reason: "default-organization",
          slug,
          userId: input.userId,
          ...(input.currentUserOrganizationCount !== undefined
            ? { currentUserOrganizationCount: input.currentUserOrganizationCount }
            : {}),
        });
        if (!admitted.allowed) {
          return null;
        }

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

  private async admitOrganizationCreate(
    request: BetterAuthOrganizationAdmissionRequest,
  ): Promise<BetterAuthOrganizationAdmissionDecision> {
    return (
      (await this.organizationAdmission?.admitOrganizationCreate(request)) ?? {
        allowed: true,
        reason: "organization-create-admission-not-configured",
      }
    );
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
      const session = await this.getCachedSession(_context, headers);
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
        : await this.firstVisibleOrganizationId(headers, _context);
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

      const activeRole = await this.getCachedActiveMemberRole(_context, headers, organizationId);
      let resolvedOrganizationId = organizationId;
      const activeRoleValue = readString(activeRole, "role");
      let organizationRole = normalizeOrganizationTeamRole(activeRoleValue);
      let role = normalizeProductOrganizationRole(activeRoleValue);
      if (!role && !input.organizationId) {
        const fallback = await this.firstAuthorizedOrganizationRole(headers, _context);
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
      const authContext = await this.auth.$context;
      const verifiedUser = await authContext.internalAdapter.updateUser(userId, {
        emailVerified: true,
      });
      const organization = await this.ensureFirstAdminOrganizationOwner({
        organizationId: request.organizationId ?? "org_self_hosted",
        organizationName: request.organizationName,
        organizationSlug:
          request.organizationSlug ?? defaultOrganizationSlug(request.organizationName),
        userId,
      });

      return ok({
        email: verifiedUser.email,
        organizationId: organization.organizationId,
        organizationSlug: organization.organizationSlug,
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

  private async ensureFirstAdminOrganizationOwner(input: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    userId: string;
  }): Promise<{ organizationId: string; organizationSlug: string }> {
    const authContext = await this.auth.$context;
    const existingOrganization = await authContext.adapter.findOne<{
      id?: string;
      slug?: string;
    }>({
      model: "organization",
      where: [
        {
          field: "id",
          value: input.organizationId,
        },
      ],
    });
    const organization =
      existingOrganization ??
      (await (authContext.adapter as ForcedIdCreateAdapter).create<
        {
          id: string;
          name: string;
          slug: string;
          logo: null;
          metadata: null;
          createdAt: Date;
        },
        {
          id?: string;
          slug?: string;
        }
      >({
        model: "organization",
        data: {
          id: input.organizationId,
          name: input.organizationName,
          slug: input.organizationSlug,
          logo: null,
          metadata: null,
          createdAt: new Date(),
        },
        forceAllowId: true,
      }));
    const organizationId = readString(organization, "id") ?? input.organizationId;
    const organizationSlug = readString(organization, "slug") ?? input.organizationSlug;
    const existingMember = await authContext.adapter.findOne<{ id?: string }>({
      model: "member",
      where: [
        {
          field: "organizationId",
          value: organizationId,
        },
        {
          field: "userId",
          value: input.userId,
        },
      ],
    });

    if (existingMember?.id) {
      await authContext.adapter.update({
        model: "member",
        where: [
          {
            field: "id",
            value: existingMember.id,
          },
        ],
        update: { role: "owner" },
      });
    } else {
      await authContext.adapter.create({
        model: "member",
        data: {
          organizationId,
          userId: input.userId,
          role: "owner",
          createdAt: new Date(),
        },
      });
    }

    return { organizationId, organizationSlug };
  }

  async showAccountProfile(context: ExecutionContext): Promise<Result<AccountProfileSummary>> {
    const authInput = accountSettingsAuthInput("GET", "/api/account/profile");
    const sessionRead = await this.readSessionForAccountSettings(context, authInput);
    if (sessionRead.isErr()) {
      return err(sessionRead.error);
    }

    return ok(mapAccountProfileSummary(sessionRead.value.user));
  }

  async changeAccountProfile(
    context: ExecutionContext,
    input: ChangeAccountProfileInput,
  ): Promise<Result<AccountProfileSummary>> {
    const authInput = accountSettingsAuthInput("POST", "/api/account/profile");
    const sessionRead = await this.readSessionForAccountSettings(context, authInput);
    if (sessionRead.isErr()) {
      return err(sessionRead.error);
    }

    const update: { image?: string | null; name?: string } = {};
    if (input.displayName !== undefined) {
      update.name = input.displayName;
    }
    if (input.avatarUrl !== undefined) {
      update.image = input.avatarUrl;
    }

    try {
      const authContext = await this.auth.$context;
      const updatedUser = await authContext.internalAdapter.updateUser(
        sessionRead.value.userId,
        update,
      );
      return ok(mapAccountProfileSummary(updatedUser));
    } catch {
      return err(productAuthInvalid(authInput, "account-profile-update-failed"));
    }
  }

  async listAccountSessions(
    context: ExecutionContext,
  ): Promise<Result<{ items: AccountSessionSummary[]; nextCursor?: string }>> {
    const authInput = accountSettingsAuthInput("GET", "/api/account/sessions");
    const sessionRead = await this.readSessionForAccountSettings(context, authInput);
    if (sessionRead.isErr()) {
      return err(sessionRead.error);
    }

    try {
      const authContext = await this.auth.$context;
      const sessions = await authContext.internalAdapter.listSessions(sessionRead.value.userId, {
        onlyActiveSessions: true,
      });
      return ok({
        items: sessions.map((session) =>
          mapAccountSessionSummary(session, sessionRead.value.currentSessionToken),
        ),
      });
    } catch {
      return err(productAuthInvalid(authInput, "account-session-list-failed"));
    }
  }

  async revokeAccountSession(
    context: ExecutionContext,
    input: RevokeAccountSessionInput,
  ): Promise<Result<{ sessionId: string; revokedAt: string }>> {
    const authInput = accountSettingsAuthInput("POST", "/api/account/sessions/revoke");
    const sessionRead = await this.readSessionForAccountSettings(context, authInput);
    if (sessionRead.isErr()) {
      return err(sessionRead.error);
    }

    try {
      const authContext = await this.auth.$context;
      const targetSession = await this.findAccountSessionForUser(
        sessionRead.value.userId,
        input.sessionId,
      );
      if (!targetSession) {
        return err(productAuthForbidden(authInput, "account-session-missing"));
      }

      const token = readString(targetSession, "token") ?? input.sessionId;
      await authContext.internalAdapter.deleteSession(token);
      return ok({
        sessionId: readString(targetSession, "id") ?? input.sessionId,
        revokedAt: new Date().toISOString(),
      });
    } catch {
      return err(productAuthInvalid(authInput, "account-session-revoke-failed"));
    }
  }

  async deleteAccount(
    context: ExecutionContext,
    input: DeleteAccountInput,
  ): Promise<Result<{ userId: string; deletedAt: string }>> {
    const authInput = accountSettingsAuthInput("DELETE", "/api/account");
    const sessionRead = await this.readSessionForAccountSettings(context, authInput);
    if (sessionRead.isErr()) {
      return err(sessionRead.error);
    }
    if (input.confirmation.userId !== sessionRead.value.userId) {
      return err(productAuthForbidden(authInput, "account-confirmation-mismatch"));
    }

    try {
      const authContext = await this.auth.$context;
      await authContext.internalAdapter.deleteUser(sessionRead.value.userId);
      return ok({
        deletedAt: new Date().toISOString(),
        userId: sessionRead.value.userId,
      });
    } catch {
      return err(productAuthInvalid(authInput, "account-delete-failed"));
    }
  }

  private async readSessionForAccountSettings(
    context: ExecutionContext,
    authInput: ProductSessionAuthorizationInput,
  ): Promise<
    Result<{
      currentSessionToken?: string;
      user: Record<string, unknown>;
      userId: string;
    }>
  > {
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
      if (!userId || !userObject) {
        return err(productAuthInvalid(authInput, "session-user-missing"));
      }

      const currentSessionToken = readString(sessionObject, "token");
      return ok({
        ...(currentSessionToken ? { currentSessionToken } : {}),
        user: userObject,
        userId,
      });
    } catch {
      return err(productAuthInvalid(authInput, "session-verification-failed"));
    }
  }

  private async findAccountSessionForUser(
    userId: string,
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    const authContext = await this.auth.$context;
    const directMatch = await authContext.internalAdapter.findSession(sessionId);
    if (directMatch?.session.userId === userId) {
      return directMatch.session;
    }

    const sessions = await authContext.internalAdapter.listSessions(userId);
    return (
      sessions.find(
        (session) =>
          readString(session, "id") === sessionId || readString(session, "token") === sessionId,
      ) ?? null
    );
  }

  async showOrganizationProfile(
    context: ExecutionContext,
    input: { organizationId: string },
  ): Promise<Result<OrganizationProfileSummary>> {
    const authInput = organizationTeamAuthInput(
      "GET",
      "/api/organizations/profile",
      input.organizationId,
    );
    const membership = await this.readOrganizationMembership(
      context,
      authInput,
      input.organizationId,
    );
    if (membership.isErr()) {
      return err(membership.error);
    }

    return ok(mapOrganizationProfileSummary(membership.value.organization, membership.value.role));
  }

  async changeOrganizationProfile(
    context: ExecutionContext,
    input: ChangeOrganizationProfileInput,
  ): Promise<Result<OrganizationProfileSummary>> {
    const authInput = organizationTeamAuthInput(
      "POST",
      "/api/organizations/profile",
      input.organizationId,
    );
    const membership = await this.readOrganizationMembership(
      context,
      authInput,
      input.organizationId,
    );
    if (membership.isErr()) {
      return err(membership.error);
    }
    if (!organizationRoleAllows(membership.value.role, "admin")) {
      return err(
        productAuthForbidden(
          authInput,
          "role-insufficient",
          organizationRoleToProductRole(membership.value.role),
        ),
      );
    }

    const data: { logo?: string | null; name?: string; slug?: string } = {};
    if (input.name !== undefined) {
      data.name = input.name;
    }
    if (input.slug !== undefined) {
      data.slug = input.slug;
    }
    if (input.logoUrl !== undefined) {
      data.logo = input.logoUrl;
    }

    try {
      const authContext = await this.auth.$context;
      const organization =
        (await authContext.adapter.update<Record<string, unknown>>({
          model: "organization",
          where: [
            {
              field: "id",
              value: input.organizationId,
            },
          ],
          update: data,
        })) ?? membership.value.organization;
      return ok(mapOrganizationProfileSummary(organization, membership.value.role));
    } catch {
      return err(productAuthForbidden(authInput, "organization-profile-update-failed"));
    }
  }

  async deleteOrganization(
    context: ExecutionContext,
    input: DeleteOrganizationInput,
  ): Promise<Result<{ organizationId: string; deletedAt: string }>> {
    const authInput = organizationTeamAuthInput(
      "DELETE",
      "/api/organizations",
      input.organizationId,
    );
    const membership = await this.readOrganizationMembership(
      context,
      authInput,
      input.organizationId,
    );
    if (membership.isErr()) {
      return err(membership.error);
    }
    if (membership.value.role !== "owner") {
      return err(
        productAuthForbidden(
          authInput,
          "role-insufficient",
          organizationRoleToProductRole(membership.value.role),
        ),
      );
    }

    try {
      await this.auth.api.deleteOrganization({
        headers: membership.value.headers,
        body: {
          organizationId: input.organizationId,
        },
      });
      return ok({
        deletedAt: new Date().toISOString(),
        organizationId: input.organizationId,
      });
    } catch {
      return err(productAuthForbidden(authInput, "organization-delete-failed"));
    }
  }

  private async readOrganizationMembership(
    context: ExecutionContext,
    authInput: ProductSessionAuthorizationInput,
    organizationId: string,
  ): Promise<
    Result<{
      headers: Headers;
      organization: Record<string, unknown>;
      role: OrganizationTeamRole;
    }>
  > {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(productAuthMissing(authInput, "session-missing"));
    }

    try {
      await this.rememberActiveOrganization(headers, organizationId);
      const activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId },
      });
      const role = normalizeOrganizationTeamRole(readString(activeRole, "role"));
      if (!role) {
        return err(productAuthForbidden(authInput, "organization-member-missing"));
      }
      const memberStatus = await this.activeOrganizationMemberStatus(
        context,
        headers,
        organizationId,
      );
      if (memberStatus === "deactivated") {
        return err(productAuthForbidden(authInput, "organization-member-deactivated"));
      }

      const authContext = await this.auth.$context;
      const organization = (await authContext.adapter.findOne<Record<string, unknown>>({
        model: "organization",
        where: [
          {
            field: "id",
            value: organizationId,
          },
        ],
      })) ?? {
        id: organizationId,
        name: organizationId,
        slug: organizationId,
      };

      return ok({ headers, organization, role });
    } catch {
      return err(productAuthInvalid(authInput, "organization-profile-read-failed"));
    }
  }

  async getCurrentContext(context: ExecutionContext): Promise<Result<CurrentOrganizationContext>> {
    const authInput = organizationTeamAuthInput("GET", "/api/organizations/current-context");
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(productAuthMissing(authInput, "session-missing"));
    }

    try {
      const session = await this.getCachedSession(context, headers);
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

      const organizations = await this.getCachedVisibleOrganizations(context, headers);
      const organizationSummaries = (
        await Promise.all(
          toArray(organizations).map(async (organization) => {
            const summary = mapContextOrganization(organization);
            const status = await this.activeOrganizationMemberStatus(
              context,
              headers,
              summary.organizationId,
            );
            return status === "deactivated" ? null : summary;
          }),
        )
      ).filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
      const displayName = readString(userObject, "name");
      const avatarUrl = readString(userObject, "image");
      let activeOrganizationId =
        readString(sessionObject, "activeOrganizationId") ??
        organizationSummaries[0]?.organizationId;
      if (
        activeOrganizationId &&
        !organizationSummaries.some(
          (organization) => organization.organizationId === activeOrganizationId,
        )
      ) {
        activeOrganizationId = organizationSummaries[0]?.organizationId;
      }
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

      const activeRole = await this.getCachedActiveMemberRole(
        context,
        headers,
        activeOrganizationId,
      );
      let currentRole = normalizeOrganizationTeamRole(readString(activeRole, "role"));
      if (!currentRole && organizationSummaries[0]?.organizationId) {
        activeOrganizationId = organizationSummaries[0].organizationId;
        await this.rememberActiveOrganization(headers, activeOrganizationId);
        const fallbackRole = await this.getCachedActiveMemberRole(
          context,
          headers,
          activeOrganizationId,
        );
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
      this.clearRequestCache(context);
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
      const directReadback = await this.listMembersFromDatabase(headers, input);
      if ("result" in directReadback) {
        return directReadback.result;
      }

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
      const readback = await this.listMembersFromDatabase(headers, input);
      if ("result" in readback) {
        return readback.result;
      }

      return err(
        productAuthForbidden(
          organizationTeamAuthInput("GET", "organization-members", input.organizationId),
          readback.reasonCode,
        ),
      );
    }
  }

  private async listMembersFromDatabase(
    headers: Headers,
    input: OrganizationMemberListInput,
  ): Promise<DirectMemberListReadback> {
    const db = directAuthDatabase(this.config.database);
    if (!db) {
      return { reasonCode: "member-list-readback-unavailable" };
    }

    let activeRole: unknown;
    try {
      activeRole = await this.auth.api.getActiveMemberRole({
        headers,
        query: { organizationId: input.organizationId },
      });
    } catch {
      return { reasonCode: "member-list-role-readback-failed" };
    }
    const role = normalizeProductOrganizationRole(readString(activeRole, "role"));
    if (!role) {
      return { reasonCode: "organization-member-missing" };
    }
    const memberStatus = await this.activeOrganizationMemberStatus(
      undefined,
      headers,
      input.organizationId,
    );
    if (memberStatus === "deactivated") {
      return { reasonCode: "organization-member-deactivated" };
    }

    try {
      const limit = Math.max(1, Math.min(input.limit ?? 100, 100));
      const rows = await db
        .selectFrom("member as member")
        .innerJoin("user as auth_user", "auth_user.id", "member.userId")
        .select([
          "member.id as memberId",
          "member.userId as userId",
          "member.role as role",
          "member.status as status",
          "member.createdAt as joinedAt",
          "auth_user.email as email",
          "auth_user.name as displayName",
          "auth_user.image as avatarUrl",
        ])
        .where("member.organizationId", "=", input.organizationId)
        .limit(limit)
        .execute();

      return {
        result: ok({
          items: rows.map(mapDirectMemberSummary),
        }),
      };
    } catch {
      return { reasonCode: "member-list-readback-failed" };
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
      const db = directAuthDatabase(this.config.database);
      if (!db) {
        return err(
          productAuthInvalid(
            organizationTeamAuthInput("DELETE", "organization-member", input.organizationId),
            "remove-member-lifecycle-unavailable",
          ),
        );
      }

      await this.rememberActiveOrganization(headers, input.organizationId);
      const member = await db
        .updateTable("member")
        .set({ status: "deactivated" })
        .where("id", "=", input.memberId)
        .where("organizationId", "=", input.organizationId)
        .returning(["id", "organizationId"])
        .executeTakeFirst();

      if (!member) {
        return err(
          productAuthForbidden(
            organizationTeamAuthInput("DELETE", "organization-member", input.organizationId),
            "organization-member-missing",
          ),
        );
      }

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

  async reactivateMember(
    context: ExecutionContext,
    input: ReactivateOrganizationMemberInput,
  ): Promise<Result<OrganizationMemberSummary>> {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("POST", "organization-member-reactivate"),
          "session-missing",
        ),
      );
    }

    try {
      const db = directAuthDatabase(this.config.database);
      if (!db) {
        return err(
          productAuthInvalid(
            organizationTeamAuthInput(
              "POST",
              "organization-member-reactivate",
              input.organizationId,
            ),
            "reactivate-member-lifecycle-unavailable",
          ),
        );
      }

      await this.rememberActiveOrganization(headers, input.organizationId);
      const member = await db
        .updateTable("member")
        .set({ status: "active" })
        .where("id", "=", input.memberId)
        .where("organizationId", "=", input.organizationId)
        .returning(["id", "organizationId", "userId", "role", "status", "createdAt"])
        .executeTakeFirst();

      if (!member) {
        return err(
          productAuthForbidden(
            organizationTeamAuthInput(
              "POST",
              "organization-member-reactivate",
              input.organizationId,
            ),
            "organization-member-missing",
          ),
        );
      }

      return ok(mapMemberSummary(member));
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("POST", "organization-member-reactivate", input.organizationId),
          "reactivate-member-failed",
        ),
      );
    }
  }

  async transferOwner(
    context: ExecutionContext,
    input: TransferOrganizationOwnerInput,
  ): Promise<
    Result<{
      fromMember: OrganizationMemberSummary;
      toMember: OrganizationMemberSummary;
      transferredAt: string;
    }>
  > {
    const headers = contextAuthHeaders(context);
    if (!headers) {
      return err(
        productAuthMissing(
          organizationTeamAuthInput("POST", "organization-owner-transfer"),
          "session-missing",
        ),
      );
    }

    try {
      const promotedResult = await this.auth.api.updateMemberRole({
        headers,
        body: {
          organizationId: input.organizationId,
          memberId: input.toMemberId,
          role: "owner",
        },
      });
      const demotedResult = await this.auth.api.updateMemberRole({
        headers,
        body: {
          organizationId: input.organizationId,
          memberId: input.fromMemberId,
          role: "admin",
        },
      });

      return ok({
        fromMember: mapMemberSummary(readObject(demotedResult, "member") ?? demotedResult),
        toMember: mapMemberSummary(readObject(promotedResult, "member") ?? promotedResult),
        transferredAt: new Date().toISOString(),
      });
    } catch {
      return err(
        productAuthForbidden(
          organizationTeamAuthInput("POST", "organization-owner-transfer", input.organizationId),
          "transfer-owner-failed",
        ),
      );
    }
  }

  private async activeOrganizationMemberStatus(
    context: ExecutionContext | undefined,
    headers: Headers,
    organizationId: string,
  ): Promise<OrganizationMemberSummary["status"]> {
    const db = directAuthDatabase(this.config.database);
    if (!db) {
      return "active";
    }

    const session = context
      ? await this.getCachedSession(context, headers)
      : await this.auth.api.getSession({ headers });
    const sessionObject = readObject(session, "session");
    const userObject = readObject(session, "user");
    const userId = readString(userObject, "id") ?? readString(sessionObject, "userId");
    if (!userId) {
      return undefined;
    }

    const rows = await db
      .selectFrom("member")
      .select(["status"])
      .where("organizationId", "=", organizationId)
      .where("userId", "=", userId)
      .limit(1)
      .execute();
    return normalizeMemberStatus(readString(rows[0], "status")) ?? "active";
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
    path === "/api/auth/magic-link/verify" ||
    path === "/api/auth/callback/github" ||
    path === "/api/auth/callback/google" ||
    path === "/api/auth/oauth2/callback/oidc"
  );
}

function shouldConsumePendingVerificationIntentAfterAuthRoute(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return path === "/api/auth/email-otp/verify-email" || path === "/api/auth/magic-link/verify";
}

function isSetPasswordHttpWrapperRequest(request: Request): boolean {
  return new URL(request.url).pathname === "/api/auth/set-password";
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value = (await request.json()) as unknown;
    return readRecord(value);
  } catch {
    return undefined;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function betterAuthErrorResponse(error: unknown): Response {
  const statusCode = readNumber(error, "statusCode") ?? 500;
  const body = readRecord((error as { body?: unknown } | undefined)?.body);
  return jsonResponse(
    body ?? {
      error: {
        code: readString(error, "code") ?? "auth_error",
        message: readString(error, "message") ?? "Authentication request failed.",
      },
    },
    statusCode,
  );
}

function disabledEmailVerificationStatus(): AppaloftBetterAuthEmailVerificationStatus {
  return {
    enabled: false,
    otpEnabled: false,
    required: false,
  };
}

function disabledAccountRecoveryStatus(): AppaloftBetterAuthAccountRecoveryStatus {
  return {
    enabled: false,
  };
}

function disabledMagicLinkStatus(): AppaloftBetterAuthMagicLinkStatus {
  return {
    enabled: false,
  };
}

function disabledAccountSecurityStatus(): AppaloftBetterAuthAccountSecurityStatus {
  return {
    enabled: false,
    passwordState: "unknown",
  };
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

function accountSettingsAuthInput(method: string, path: string): ProductSessionAuthorizationInput {
  return {
    method,
    path,
    requiredRole: "member",
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

function readNumber(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "number" && Number.isInteger(property) ? property : undefined;
}

function readBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "boolean" ? property : undefined;
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

function trustedRequestIp(headers: Headers): string | undefined {
  return (
    firstHeaderListValue(headers.get("x-forwarded-for")) ??
    firstHeaderListValue(headers.get("x-real-ip")) ??
    firstHeaderListValue(headers.get("cf-connecting-ip"))
  );
}

function firstHeaderListValue(value: string | null): string | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .find((item) => item.length > 0);
}

function toArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(readRecord(item)))
    : [];
}

function resolvePasswordState(
  accounts: unknown[],
): AppaloftBetterAuthAccountSecurityStatus["passwordState"] {
  return accounts.some(
    (account) => readRecord(account) && readString(account, "providerId") === "credential",
  )
    ? "set"
    : "not-set";
}

type PendingVerificationIntent = {
  readonly organizationName: string;
  readonly organizationSlug: string;
};

function parsePendingVerificationIntent(value: string): PendingVerificationIntent | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    const organizationName = readString(parsed, "organizationName");
    const organizationSlug = readString(parsed, "organizationSlug");
    if (!organizationName || !organizationSlug) {
      return null;
    }

    return {
      organizationName,
      organizationSlug: defaultOrganizationSlug(organizationSlug),
    };
  } catch {
    return null;
  }
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

function publicProviderStatuses(configured: Record<AuthProviderKey, boolean>) {
  return (["github", "google", "oidc"] as const).map((key) => {
    const connectPath = key === "oidc" ? "/api/auth/sign-in/oauth2" : "/api/auth/sign-in/social";
    return {
      key,
      title: providerTitle(key),
      configured: configured[key],
      deferred: true,
      ...(configured[key] ? { connectPath } : { reason: providerNotConfiguredReason(key) }),
    };
  });
}

function disabledPublicAuthConfig(): AuthPublicConfig {
  return {
    schemaVersion: "appaloft.auth.public-config/v1",
    enabled: false,
    provider: "none",
    providers: publicProviderStatuses({
      github: false,
      google: false,
      oidc: false,
    }),
  };
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
    canTransferOwnership: owns,
    canUpdateMemberRoles: owns,
  };
}

function organizationRoleToProductRole(role: OrganizationTeamRole): ProductOrganizationRole {
  if (role === "owner" || role === "admin") {
    return role;
  }
  return "member";
}

function organizationRoleAllows(
  role: OrganizationTeamRole,
  requiredRole: ProductOrganizationRole,
): boolean {
  return productRoleAllows(organizationRoleToProductRole(role), requiredRole);
}

function mapAccountProfileSummary(value: Record<string, unknown>): AccountProfileSummary {
  const avatarUrl = readString(value, "image");
  const createdAt = readDateString(value, "createdAt");
  const displayName = readString(value, "name");
  const updatedAt = readDateString(value, "updatedAt");
  return {
    userId: readString(value, "id") ?? "",
    email: readString(value, "email") ?? "",
    emailVerified:
      readBoolean(value, "emailVerified") ?? readDateString(value, "emailVerified") !== undefined,
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function mapAccountSessionSummary(
  value: Record<string, unknown>,
  currentSessionToken?: string,
): AccountSessionSummary {
  const token = readString(value, "token");
  const ipAddress = readString(value, "ipAddress");
  const lastActiveAt = readDateString(value, "updatedAt");
  const userAgent = readString(value, "userAgent");
  const clientKind = classifyAccountSessionClient(userAgent);
  const displayName = accountSessionDisplayName(clientKind, userAgent);
  return {
    sessionId: readString(value, "id") ?? token ?? "",
    userId: readString(value, "userId") ?? "",
    clientKind,
    ...(displayName ? { displayName } : {}),
    createdAt: readDateString(value, "createdAt") ?? new Date(0).toISOString(),
    expiresAt: readDateString(value, "expiresAt") ?? new Date(0).toISOString(),
    ...(ipAddress ? { ipAddress } : {}),
    ...(userAgent ? { userAgent } : {}),
    current: Boolean(token && currentSessionToken && token === currentSessionToken),
    ...(lastActiveAt ? { lastActiveAt } : {}),
  };
}

function classifyAccountSessionClient(userAgent: string | undefined): "web" | "cli" | "unknown" {
  if (!userAgent) {
    return "unknown";
  }
  if (/\b(appaloft-cli|appaloft cli)\b/i.test(userAgent)) {
    return "cli";
  }
  return "web";
}

function accountSessionDisplayName(
  clientKind: "web" | "cli" | "unknown",
  userAgent: string | undefined,
): string | undefined {
  if (clientKind === "cli") {
    return "Appaloft CLI";
  }
  if (userAgent) {
    return accountSessionBrowserDisplayName(userAgent);
  }
  return undefined;
}

function accountSessionBrowserDisplayName(userAgent: string): string {
  if (/\bCodex\//i.test(userAgent)) {
    return "Codex Browser";
  }
  if (/\bElectron\//i.test(userAgent)) {
    return "Electron app";
  }
  if (/\bEdg\//i.test(userAgent)) {
    return "Microsoft Edge";
  }
  if (/\bChrome\//i.test(userAgent) || /\bChromium\//i.test(userAgent)) {
    return "Chrome";
  }
  if (/\bFirefox\//i.test(userAgent)) {
    return "Firefox";
  }
  if (/\bSafari\//i.test(userAgent)) {
    return "Safari";
  }
  return userAgent;
}

function mapOrganizationProfileSummary(
  value: Record<string, unknown>,
  role: OrganizationTeamRole,
): OrganizationProfileSummary {
  const createdAt = readDateString(value, "createdAt");
  const logoUrl = readString(value, "logo");
  const updatedAt = readDateString(value, "updatedAt");
  return {
    organizationId: readString(value, "id") ?? readString(value, "organizationId") ?? "",
    name: readString(value, "name") ?? "",
    slug: readString(value, "slug") ?? "",
    role,
    permissions: permissionsForRole(role),
    ...(logoUrl ? { logoUrl } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
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
  const status = normalizeMemberStatus(readString(member, "status"));
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
    ...(status ? { status } : {}),
  };
}

function mapDirectMemberSummary(value: Record<string, unknown>): OrganizationMemberSummary {
  const avatarUrl = readString(value, "avatarUrl");
  const displayName = readString(value, "displayName");
  const email = readString(value, "email");
  const status = normalizeMemberStatus(readString(value, "status"));
  return {
    memberId: readString(value, "memberId") ?? "",
    userId: readString(value, "userId") ?? "",
    role: normalizeOrganizationTeamRole(readString(value, "role")) ?? "developer",
    joinedAt: readDateString(value, "joinedAt") ?? new Date(0).toISOString(),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(displayName ? { displayName } : {}),
    ...(email ? { email } : {}),
    ...(status ? { status } : {}),
  };
}

function normalizeMemberStatus(status: string | undefined): OrganizationMemberSummary["status"] {
  if (status === "active" || status === "deactivated") {
    return status;
  }
  return undefined;
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
    message: productAuthForbiddenMessage(reasonCode),
    retryable: false,
    details: {
      ...productAuthDetails(input, "product-authorization", reasonCode),
      ...(actualRole ? { actualRole } : {}),
    },
  };
}

function productAuthForbiddenMessage(reasonCode: string): string {
  switch (reasonCode) {
    case "active-organization-missing":
      return "Choose an organization before running this operation.";
    case "member-list-failed":
      return "Organization members could not be read for the current session.";
    case "member-list-readback-failed":
      return "Organization members could not be read from the auth database.";
    case "member-list-readback-unavailable":
      return "Organization member readback is not available for this auth runtime.";
    case "member-list-role-readback-failed":
      return "The current organization role could not be verified before reading members.";
    case "organization-member-missing":
      return "The current session is not a member of this organization.";
    case "organization-switch-failed":
    case "organization-switch-forbidden":
      return "The current session cannot switch to this organization.";
    case "role-insufficient":
      return "The current organization role is not allowed to run this operation.";
    default:
      return "Product session is not authorized for this operation.";
  }
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

function directAuthDatabase(
  database: BetterAuthRuntimeConfig["database"] | undefined,
): DirectAuthDatabase | null {
  const db = readObject(database, "db");
  return db && typeof db.selectFrom === "function" && typeof db.updateTable === "function"
    ? (db as unknown as DirectAuthDatabase)
    : null;
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
