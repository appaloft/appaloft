import {
  type SourceLinkRecord,
  type SourceLinkStore,
  type SourceLinkTarget,
} from "@appaloft/application";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { type Kysely, type Selectable } from "kysely";

import { type Database, type SourceLinksTable } from "../schema";

type SourceLinkRow = Selectable<SourceLinksTable>;

function sourceLinkError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

function validateSourceFingerprint(sourceFingerprint: string): Result<void> {
  if (!sourceFingerprint.trim()) {
    return err(
      domainError.validation("Source fingerprint is required", {
        phase: "source-link-validation",
      }),
    );
  }

  if (/\/\/[^/\s]+:[^/@\s]+@/.test(sourceFingerprint)) {
    return err(
      domainError.validation("Source fingerprint contains credential-bearing material", {
        phase: "source-link-validation",
      }),
    );
  }

  return ok(undefined);
}

function validateTargetContext(target: SourceLinkTarget): Result<void> {
  if (target.destinationId && !target.serverId) {
    return err(
      sourceLinkError(
        "source_link_context_mismatch",
        "Destination relink requires server context",
        {
          phase: "source-link-admission",
          destinationId: target.destinationId,
        },
      ),
    );
  }

  return ok(undefined);
}

function sameTarget(left: SourceLinkTarget, right: SourceLinkTarget): boolean {
  return (
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.resourceId === right.resourceId &&
    left.serverId === right.serverId &&
    left.destinationId === right.destinationId
  );
}

function normalizeTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function mapRow(row: SourceLinkRow): SourceLinkRecord {
  return {
    sourceFingerprint: row.source_fingerprint,
    projectId: row.project_id,
    environmentId: row.environment_id,
    resourceId: row.resource_id,
    updatedAt: normalizeTimestamp(row.updated_at),
    ...(row.server_id ? { serverId: row.server_id } : {}),
    ...(row.destination_id ? { destinationId: row.destination_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

function persistenceError(message: string, error: unknown): DomainError {
  return domainError.infra(message, {
    phase: "source-link-persistence",
    adapter: "persistence.pg",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export class PgSourceLinkStore implements SourceLinkStore {
  constructor(private readonly db: Kysely<Database>) {}

  async read(sourceFingerprint: string): Promise<Result<SourceLinkRecord | null>> {
    const fingerprintResult = validateSourceFingerprint(sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }

    try {
      const row = await this.db
        .selectFrom("source_links")
        .selectAll()
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirst();

      return ok(row ? mapRow(row) : null);
    } catch (error) {
      return err(persistenceError("Source link could not be read", error));
    }
  }

  async requireSameTargetOrMissing(
    sourceFingerprint: string,
    target: SourceLinkTarget,
  ): Promise<Result<SourceLinkRecord | null>> {
    const targetResult = validateTargetContext(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(sourceFingerprint);
    if (existing.isErr() || !existing.value) {
      return existing;
    }
    if (sameTarget(existing.value, target)) {
      return existing;
    }

    return err(
      domainError.validation("Source link points at another deployment context", {
        phase: "source-link-resolution",
        sourceFingerprint,
        projectId: existing.value.projectId,
        environmentId: existing.value.environmentId,
        resourceId: existing.value.resourceId,
      }),
    );
  }

  async createIfMissing(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
  }): Promise<Result<SourceLinkRecord>> {
    const targetResult = validateTargetContext(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(input.sourceFingerprint);
    if (existing.isErr()) {
      return err(existing.error);
    }
    if (existing.value) {
      return ok(existing.value);
    }

    try {
      const inserted = await this.db
        .insertInto("source_links")
        .values({
          source_fingerprint: input.sourceFingerprint,
          project_id: input.target.projectId,
          environment_id: input.target.environmentId,
          resource_id: input.target.resourceId,
          server_id: input.target.serverId ?? null,
          destination_id: input.target.destinationId ?? null,
          updated_at: input.updatedAt,
          reason: null,
          metadata: {},
        })
        .onConflict((conflict) => conflict.column("source_fingerprint").doNothing())
        .returningAll()
        .executeTakeFirst();

      if (inserted) {
        return ok(mapRow(inserted));
      }

      const racedExisting = await this.read(input.sourceFingerprint);
      if (racedExisting.isErr()) {
        return err(racedExisting.error);
      }
      if (racedExisting.value) {
        return ok(racedExisting.value);
      }

      return err(
        persistenceError(
          "Source link could not be persisted",
          new Error("insert returned no row and no existing source link was found"),
        ),
      );
    } catch (error) {
      return err(persistenceError("Source link could not be persisted", error));
    }
  }

  async relink(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
    expectedCurrentProjectId?: string;
    expectedCurrentEnvironmentId?: string;
    expectedCurrentResourceId?: string;
    reason?: string;
  }): Promise<Result<SourceLinkRecord>> {
    const targetResult = validateTargetContext(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(input.sourceFingerprint);
    if (existing.isErr()) {
      return err(existing.error);
    }
    if (!existing.value) {
      return err(
        sourceLinkError("source_link_not_found", "Source link was not found", {
          phase: "source-link-resolution",
          sourceFingerprint: input.sourceFingerprint,
        }),
      );
    }
    if (
      input.expectedCurrentProjectId &&
      existing.value.projectId !== input.expectedCurrentProjectId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current project did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentProjectId: input.expectedCurrentProjectId,
            actualProjectId: existing.value.projectId,
          },
        ),
      );
    }
    if (
      input.expectedCurrentEnvironmentId &&
      existing.value.environmentId !== input.expectedCurrentEnvironmentId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current environment did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentEnvironmentId: input.expectedCurrentEnvironmentId,
            actualEnvironmentId: existing.value.environmentId,
          },
        ),
      );
    }
    if (
      input.expectedCurrentResourceId &&
      existing.value.resourceId !== input.expectedCurrentResourceId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current resource did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentResourceId: input.expectedCurrentResourceId,
            actualResourceId: existing.value.resourceId,
          },
        ),
      );
    }
    if (sameTarget(existing.value, input.target)) {
      return ok(existing.value);
    }

    try {
      const updated = await this.db
        .updateTable("source_links")
        .set({
          project_id: input.target.projectId,
          environment_id: input.target.environmentId,
          resource_id: input.target.resourceId,
          server_id: input.target.serverId ?? null,
          destination_id: input.target.destinationId ?? null,
          updated_at: input.updatedAt,
          reason: input.reason ?? null,
        })
        .where("source_fingerprint", "=", input.sourceFingerprint)
        .returningAll()
        .executeTakeFirst();

      if (!updated) {
        return err(
          sourceLinkError("source_link_not_found", "Source link was not found", {
            phase: "source-link-resolution",
            sourceFingerprint: input.sourceFingerprint,
          }),
        );
      }

      return ok(mapRow(updated));
    } catch (error) {
      return err(persistenceError("Source link could not be persisted", error));
    }
  }

  async unlink(sourceFingerprint: string): Promise<Result<boolean>> {
    const fingerprintResult = validateSourceFingerprint(sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }

    try {
      const deleted = await this.db
        .deleteFrom("source_links")
        .where("source_fingerprint", "=", sourceFingerprint)
        .returning("source_fingerprint")
        .executeTakeFirst();

      return ok(Boolean(deleted));
    } catch (error) {
      return err(persistenceError("Source link could not be removed", error));
    }
  }
}
