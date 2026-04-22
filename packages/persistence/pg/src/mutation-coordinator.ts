import {
  type Clock,
  coordinationTimeoutError,
  createRepositorySpanName,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  validateCoordinationScope,
} from "@appaloft/application";
import { err, type Result } from "@appaloft/core";
import { type Kysely } from "kysely";

import { type Database } from "./schema";

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class PgMutationCoordinator implements MutationCoordinator {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly clock: Clock,
  ) {}

  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    const scopeValidation = validateCoordinationScope(input.scope);
    if (scopeValidation.isErr()) {
      return err(scopeValidation.error);
    }

    const startedAt = Date.now();
    const deadline = startedAt + input.policy.waitTimeoutMs;
    const scopeKind = input.scope.kind;
    const scopeKey = input.scope.key;

    return input.context.tracer.startActiveSpan(
      createRepositorySpanName("mutation_coordinator", "run_exclusive"),
      {
        attributes: {
          "appaloft.repository.name": "mutation_coordinator",
          "appaloft.mutation.scope_kind": scopeKind,
          "appaloft.mutation.scope_key": scopeKey,
          "appaloft.mutation.operation_key": input.policy.operationKey,
          "appaloft.mutation.mode": input.policy.mode,
        },
      },
      async () => {
        while (Date.now() <= deadline) {
          const acquiredAt = this.clock.now();
          const leaseExpiresAt = addMilliseconds(acquiredAt, input.policy.leaseTtlMs);
          const inserted = await this.db
            .insertInto("mutation_coordinations")
            .values({
              coordination_scope_kind: scopeKind,
              coordination_scope_key: scopeKey,
              operation_key: input.policy.operationKey,
              coordination_mode: input.policy.mode,
              owner_id: input.owner.ownerId,
              owner_label: input.owner.label,
              acquired_at: acquiredAt,
              heartbeat_at: acquiredAt,
              lease_expires_at: leaseExpiresAt,
              metadata: {},
            })
            .onConflict((conflict) =>
              conflict.columns(["coordination_scope_kind", "coordination_scope_key"]).doNothing(),
            )
            .returning(["coordination_scope_kind"])
            .executeTakeFirst();

          if (inserted) {
            return this.executeWithLease(input, acquiredAt);
          }

          const now = this.clock.now();
          const stolen = await this.db
            .updateTable("mutation_coordinations")
            .set({
              operation_key: input.policy.operationKey,
              coordination_mode: input.policy.mode,
              owner_id: input.owner.ownerId,
              owner_label: input.owner.label,
              acquired_at: now,
              heartbeat_at: now,
              lease_expires_at: addMilliseconds(now, input.policy.leaseTtlMs),
              metadata: {},
            })
            .where("coordination_scope_kind", "=", scopeKind)
            .where("coordination_scope_key", "=", scopeKey)
            .where("lease_expires_at", "<=", now)
            .returning(["coordination_scope_kind"])
            .executeTakeFirst();

          if (stolen) {
            return this.executeWithLease(input, now);
          }

          await sleep(input.policy.retryIntervalMs);
        }

        return err(
          coordinationTimeoutError({
            message:
              "Command coordination scope could not be acquired within the bounded wait window",
            policy: input.policy,
            scope: input.scope,
            waitedSeconds: Math.max(1, Math.ceil((Date.now() - startedAt) / 1_000)),
            retryAfterSeconds: Math.max(1, Math.ceil(input.policy.retryIntervalMs / 1_000)),
          }),
        );
      },
    );
  }

  private async executeWithLease<T>(
    input: MutationCoordinatorRunExclusiveInput<T>,
    acquiredAt: string,
  ): Promise<Result<T>> {
    let heartbeatActive = true;
    const heartbeat = (async () => {
      while (heartbeatActive) {
        await sleep(input.policy.heartbeatIntervalMs);
        if (!heartbeatActive) {
          break;
        }

        const now = this.clock.now();
        await this.db
          .updateTable("mutation_coordinations")
          .set({
            heartbeat_at: now,
            lease_expires_at: addMilliseconds(now, input.policy.leaseTtlMs),
          })
          .where("coordination_scope_kind", "=", input.scope.kind)
          .where("coordination_scope_key", "=", input.scope.key)
          .where("owner_id", "=", input.owner.ownerId)
          .execute();
      }
    })();

    try {
      return await input.work();
    } finally {
      heartbeatActive = false;
      await heartbeat.catch(() => undefined);
      await this.db
        .deleteFrom("mutation_coordinations")
        .where("coordination_scope_kind", "=", input.scope.kind)
        .where("coordination_scope_key", "=", input.scope.key)
        .where("owner_id", "=", input.owner.ownerId)
        .execute();
      void acquiredAt;
    }
  }
}
