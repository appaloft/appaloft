import {
  type DependencyResourceSecretResolutionInput,
  type DependencyResourceSecretResolutionResult,
  type DependencyResourceSecretStore,
  type DependencyResourceSecretStoreInput,
  type DependencyResourceSecretStoreResult,
  type ExecutionContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";

type DependencySecretPayload = {
  value?: unknown;
};

function buildSecretRef(input: DependencyResourceSecretStoreInput): string {
  return `appaloft://dependency-resources/${input.dependencyResourceId}/${input.purpose}`;
}

export class PgDependencyResourceSecretStore implements DependencyResourceSecretStore {
  constructor(private readonly db: Kysely<Database>) {}

  async storeConnection(
    context: ExecutionContext,
    input: DependencyResourceSecretStoreInput,
  ): Promise<Result<DependencyResourceSecretStoreResult>> {
    void context;
    const secretRef = buildSecretRef(input);

    try {
      await this.db
        .insertInto("dependency_resource_secrets")
        .values({
          ref: secretRef,
          dependency_resource_id: input.dependencyResourceId,
          project_id: input.projectId,
          environment_id: input.environmentId,
          kind: input.kind,
          purpose: input.purpose,
          payload: {
            value: input.secretValue,
          },
          metadata: {
            storedAt: input.storedAt,
          },
          created_at: input.storedAt,
        })
        .onConflict((conflict) =>
          conflict.column("ref").doUpdateSet({
            payload: {
              value: input.secretValue,
            },
            metadata: {
              storedAt: input.storedAt,
            },
          }),
        )
        .execute();

      return ok({ secretRef });
    } catch (error) {
      return err(
        domainError.infra("Dependency resource secret could not be stored", {
          phase: "dependency-resource-secret-storage",
          adapter: "persistence.pg",
          dependencyResourceId: input.dependencyResourceId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          kind: input.kind,
          purpose: input.purpose,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async resolve(
    context: ExecutionContext,
    input: DependencyResourceSecretResolutionInput,
  ): Promise<Result<DependencyResourceSecretResolutionResult>> {
    void context;

    try {
      const row = await this.db
        .selectFrom("dependency_resource_secrets")
        .select(["ref", "payload"])
        .where("ref", "=", input.secretRef)
        .executeTakeFirst();

      if (!row) {
        return err(domainError.notFound("dependency_resource_secret", input.secretRef));
      }

      const payload = row.payload as DependencySecretPayload;
      if (typeof payload.value !== "string") {
        return err(
          domainError.infra("Dependency resource secret payload is invalid", {
            phase: "dependency-runtime-secret-resolution",
            adapter: "persistence.pg",
            secretRef: input.secretRef,
          }),
        );
      }

      return ok({
        secretRef: row.ref,
        secretValue: payload.value,
      });
    } catch (error) {
      return err(
        domainError.infra("Dependency resource secret could not be resolved", {
          phase: "dependency-runtime-secret-resolution",
          adapter: "persistence.pg",
          secretRef: input.secretRef,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
