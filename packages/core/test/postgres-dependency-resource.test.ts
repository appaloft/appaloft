import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeletedAt,
  DependencyResourceDeleteBlocker,
  DependencyResourceSourceModeValue,
  EnvironmentId,
  ProjectId,
  ProviderKey,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");

function createImportedPostgres(input?: {
  backupRetentionRequired?: boolean;
  providerManaged?: boolean;
}) {
  return ResourceInstance.createPostgresDependencyResource({
    id: ResourceInstanceId.rehydrate("rsi_pg"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceInstanceName.rehydrate("Main DB"),
    kind: ResourceInstanceKindValue.rehydrate("postgres"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-postgres"),
    endpoint: {
      host: "db.example.com",
      port: 5432,
      databaseName: "app",
      maskedConnection: "postgres://app:********@db.example.com:5432/app",
    },
    backupRelationship: input?.backupRetentionRequired
      ? { retentionRequired: true }
      : { retentionRequired: false },
    providerManaged: input?.providerManaged ?? false,
    createdAt,
  })._unsafeUnwrap();
}

describe("Postgres dependency resource", () => {
  test("[DEP-RES-PG-PROVISION-001] creates managed Postgres metadata and emits an event", () => {
    const dependencyResource = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_pg"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Main DB"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
      providerManaged: true,
      createdAt,
    })._unsafeUnwrap();

    expect(dependencyResource.toState()).toMatchObject({
      slug: expect.objectContaining({ value: "main-db" }),
      kind: expect.objectContaining({ value: "postgres" }),
      sourceMode: expect.objectContaining({ value: "appaloft-managed" }),
      providerManaged: true,
    });
    expect(dependencyResource.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "dependency-resource-created",
        aggregateId: "rsi_pg",
        payload: expect.objectContaining({
          dependencyResourceId: "rsi_pg",
          kind: "postgres",
          sourceMode: "appaloft-managed",
        }),
      }),
    ]);
  });

  test("[DEP-RES-PG-VALIDATION-001] rejects non-Postgres creation through the Postgres factory", () => {
    const result = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_pg"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Cache"),
      kind: ResourceInstanceKindValue.rehydrate("redis"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("appaloft-managed"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
      providerManaged: true,
      createdAt,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "dependency-resource-validation",
        field: "kind",
      },
    });
  });

  test("[DEP-RES-PG-DELETE-001] deletes imported external records without provider deletion", () => {
    const dependencyResource = createImportedPostgres();

    const result = dependencyResource.delete({
      deletedAt: DeletedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      blockers: [],
    });

    expect(result.isOk()).toBe(true);
    expect(dependencyResource.toState().status.value).toBe("deleted");
  });

  test("[DEP-RES-PG-DELETE-003] blocks backup protected deletion", () => {
    const dependencyResource = createImportedPostgres({ backupRetentionRequired: true });

    const result = dependencyResource.delete({
      deletedAt: DeletedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      blockers: [],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
      },
    });
  });

  test("[DEP-RES-PG-DELETE-004] blocks provider-managed unsafe deletion", () => {
    const dependencyResource = createImportedPostgres({ providerManaged: true });

    const result = dependencyResource.delete({
      deletedAt: DeletedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      blockers: [DependencyResourceDeleteBlocker.providerManagedUnsafe()],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_resource_delete_blocked",
      details: {
        phase: "dependency-resource-delete-safety",
      },
    });
  });
});
