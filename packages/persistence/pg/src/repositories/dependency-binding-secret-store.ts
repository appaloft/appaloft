import {
  type DependencyBindingSecretStore,
  type DependencyBindingSecretStoreInput,
  type DependencyBindingSecretStoreResult,
  type ExecutionContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "../schema";

function buildSecretRef(input: DependencyBindingSecretStoreInput): string {
  return `appaloft+pg://resource-binding/${input.bindingId}/${input.secretVersion}`;
}

export class PgDependencyBindingSecretStore implements DependencyBindingSecretStore {
  constructor(private readonly db: Kysely<Database>) {}

  async store(
    context: ExecutionContext,
    input: DependencyBindingSecretStoreInput,
  ): Promise<Result<DependencyBindingSecretStoreResult>> {
    void context;
    const secretRef = buildSecretRef(input);

    try {
      await this.db
        .insertInto("dependency_binding_secrets")
        .values({
          ref: secretRef,
          binding_id: input.bindingId,
          resource_id: input.resourceId,
          secret_version: input.secretVersion,
          payload: {
            value: input.secretValue,
          },
          metadata: {
            rotatedAt: input.rotatedAt,
          },
          created_at: input.rotatedAt,
        })
        .onConflict((conflict) =>
          conflict.column("ref").doUpdateSet({
            payload: {
              value: input.secretValue,
            },
            metadata: {
              rotatedAt: input.rotatedAt,
            },
          }),
        )
        .execute();

      return ok({
        secretRef,
        secretVersion: input.secretVersion,
      });
    } catch (error) {
      return err(
        domainError.infra("Dependency binding secret could not be stored", {
          phase: "resource-dependency-binding-secret-rotation",
          adapter: "persistence.pg",
          bindingId: input.bindingId,
          resourceId: input.resourceId,
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
