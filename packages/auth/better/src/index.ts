import { type BetterAuthOptions, betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";

export interface AuthProviderStatus {
  key: "github";
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
}

export interface AuthRuntime {
  getSessionStatus(request: Request): Promise<AuthSessionStatus>;
  getProviderAccessToken(request: Request, providerKey: "github"): Promise<string | null>;
  handle(request: Request): Promise<Response>;
}

function buildGitHubProviderStatus(input: {
  configured: boolean;
  connected: boolean;
}): AuthProviderStatus {
  return {
    key: "github",
    title: "GitHub",
    configured: input.configured,
    connected: input.connected,
    requiresSignIn: true,
    deferred: true,
    ...(input.configured
      ? {
          connectPath: "/api/auth/sign-in/social",
        }
      : {
          reason:
            "Configure APPALOFT_GITHUB_CLIENT_ID and APPALOFT_GITHUB_CLIENT_SECRET to enable GitHub import.",
        }),
  };
}

export class BetterAuthRuntime implements AuthRuntime {
  private readonly auth;
  private readonly githubConfigured: boolean;

  constructor(private readonly config: BetterAuthRuntimeConfig) {
    this.githubConfigured = Boolean(config.githubClientId && config.githubClientSecret);
    this.auth = betterAuth({
      baseURL: this.config.baseURL,
      basePath: "/api/auth",
      secret: this.config.secret,
      ...(this.config.database ? { database: this.config.database } : {}),
      account: {
        storeAccountCookie: true,
      },
      emailAndPassword: {
        enabled: true,
      },
      plugins: [organization()],
      ...(this.githubConfigured && this.config.githubClientId && this.config.githubClientSecret
        ? {
            socialProviders: {
              github: {
                clientId: this.config.githubClientId,
                clientSecret: this.config.githubClientSecret,
              },
            },
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
        providers: [buildGitHubProviderStatus({ configured: false, connected: false })],
      };
    }

    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    const accounts =
      session && this.githubConfigured
        ? await this.auth.api.listUserAccounts({
            headers: request.headers,
          })
        : [];
    const githubConnected = accounts.some(
      (account) => account && typeof account === "object" && account.providerId === "github",
    );

    return {
      enabled: true,
      provider: "better-auth",
      loginRequired: false,
      deferredAuth: true,
      session,
      providers: [
        buildGitHubProviderStatus({
          configured: this.githubConfigured,
          connected: githubConnected,
        }),
      ],
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
}

export function createBetterAuthRuntime(config: BetterAuthRuntimeConfig): AuthRuntime {
  return new BetterAuthRuntime(config);
}
