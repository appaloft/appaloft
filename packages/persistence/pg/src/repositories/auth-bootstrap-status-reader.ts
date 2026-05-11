import {
  type AuthBootstrapStatus,
  type AuthBootstrapStatusReader,
  appaloftTraceAttributes,
  createRepositorySpanName,
  type ProductLoginMethodStatus,
  type RepositoryContext,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

export interface PgAuthBootstrapStatusReaderOptions {
  githubConfigured?: boolean;
  googleConfigured?: boolean;
  oidcConfigured?: boolean;
  loginUrl?: string;
}

export class PgAuthBootstrapStatusReader implements AuthBootstrapStatusReader {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly options: PgAuthBootstrapStatusReaderOptions = {},
  ) {}

  async getStatus(context: RepositoryContext): Promise<Result<AuthBootstrapStatus>> {
    const executor = resolveRepositoryExecutor(this.db, context);
    return context.tracer.startActiveSpan(
      createRepositorySpanName("auth_bootstrap_status", "get_status"),
      {
        attributes: {
          [appaloftTraceAttributes.repositoryName]: "auth_bootstrap_status",
        },
      },
      async () => {
        try {
          const owner = await executor
            .selectFrom("member")
            .innerJoin("user", "user.id", "member.userId")
            .innerJoin("organization", "organization.id", "member.organizationId")
            .select([
              "member.organizationId as organizationId",
              "organization.slug as organizationSlug",
              "user.email as email",
              "user.id as userId",
            ])
            .where("member.role", "=", "owner")
            .orderBy("member.createdAt", "asc")
            .limit(1)
            .executeTakeFirst();
          const organization = owner
            ? undefined
            : await executor
                .selectFrom("organization")
                .select(["id", "slug"])
                .orderBy("createdAt", "asc")
                .limit(1)
                .executeTakeFirst();

          return ok({
            bootstrapRequired: !owner,
            firstAdminConfigured: Boolean(owner),
            organizationConfigured: Boolean(owner ?? organization),
            loginMethods: this.loginMethods(),
            ...(owner?.email ? { firstAdminEmail: owner.email } : {}),
            ...(this.options.loginUrl ? { loginUrl: this.options.loginUrl } : {}),
            ...(owner?.organizationId
              ? { organizationId: owner.organizationId }
              : organization?.id
                ? { organizationId: organization.id }
                : {}),
            ...(owner?.organizationSlug
              ? { organizationSlug: owner.organizationSlug }
              : organization?.slug
                ? { organizationSlug: organization.slug }
                : {}),
            nextSteps: owner ? ["sign-in"] : ["create-first-admin"],
          });
        } catch {
          return err({
            code: "first_admin_bootstrap_failed",
            category: "infra",
            message: "First admin bootstrap status could not be read",
            retryable: true,
            details: {
              phase: "first-admin-bootstrap-status",
            },
          });
        }
      },
    );
  }

  private loginMethods(): ProductLoginMethodStatus[] {
    return [
      {
        key: "local-password",
        configured: true,
        enabled: true,
      },
      {
        key: "github",
        configured: Boolean(this.options.githubConfigured),
        enabled: Boolean(this.options.githubConfigured),
        ...(this.options.githubConfigured ? {} : { reason: "not-configured" }),
      },
      {
        key: "google",
        configured: Boolean(this.options.googleConfigured),
        enabled: Boolean(this.options.googleConfigured),
        ...(this.options.googleConfigured ? {} : { reason: "not-configured" }),
      },
      {
        key: "oidc",
        configured: Boolean(this.options.oidcConfigured),
        enabled: Boolean(this.options.oidcConfigured),
        ...(this.options.oidcConfigured ? {} : { reason: "not-configured" }),
      },
    ];
  }
}
