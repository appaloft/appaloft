import { describe, expect, test } from "bun:test";

import {
  ArchivedAt,
  ArchiveReason,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  EnvironmentSnapshotId,
  GeneratedAt,
  LockedAt,
  LockReason,
  ProjectId,
  UnlockedAt,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "../src";

describe("EnvironmentProfile", () => {
  test("accepts empty config values", () => {
    const value = ConfigValueText.create("")._unsafeUnwrap();
    expect(value.value).toBe("");
  });

  test("materializes snapshots with scope precedence and masks no secrets at domain level", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_prod"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    environment.setVariable({
      key: ConfigKey.rehydrate("APP_PORT"),
      value: ConfigValueText.rehydrate("3000"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("defaults"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    });
    environment.setVariable({
      key: ConfigKey.rehydrate("APP_PORT"),
      value: ConfigValueText.rehydrate("3100"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });
    environment.setVariable({
      key: ConfigKey.rehydrate("PUBLIC_BASE_URL"),
      value: ConfigValueText.rehydrate("https://demo.appaloft.dev"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("build-time"),
      scope: ConfigScopeValue.rehydrate("project"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    const snapshot = environment.materializeSnapshot({
      snapshotId: EnvironmentSnapshotId.rehydrate("snap_prod_001"),
      createdAt: GeneratedAt.rehydrate("2026-01-01T00:03:00.000Z"),
    });

    expect(snapshot.precedence).toEqual([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "resource",
      "deployment",
    ]);
    expect(snapshot.variables).toHaveLength(2);
    expect(snapshot.variables.find((item) => item.key === "APP_PORT")?.value).toBe("3100");
    expect(snapshot.variables.find((item) => item.key === "PUBLIC_BASE_URL")?.exposure).toBe(
      "build-time",
    );
  });

  test("promotes environments and diffs snapshots explicitly", () => {
    const source = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_stage"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("staging"),
      kind: EnvironmentKindValue.rehydrate("staging"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    source.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://masked"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    const promoted = source
      .promoteTo({
        targetEnvironmentId: EnvironmentId.rehydrate("env_prod"),
        targetName: EnvironmentName.rehydrate("production"),
        targetKind: EnvironmentKindValue.rehydrate("production"),
        createdAt: CreatedAt.rehydrate("2026-01-02T00:00:00.000Z"),
      })
      ._unsafeUnwrap();
    promoted.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://prod"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-02T00:01:00.000Z"),
    });

    const diff = source.diffAgainst(
      promoted.materializeSnapshot({
        snapshotId: EnvironmentSnapshotId.rehydrate("snap_prod"),
        createdAt: GeneratedAt.rehydrate("2026-01-02T00:02:00.000Z"),
      }),
    );

    expect(promoted.toState().parentEnvironmentId?.value).toBe("env_stage");
    expect(diff).toHaveLength(1);
    expect(diff[0]?.key.value).toBe("DATABASE_URL");
    expect(diff[0]?.change).toBe("changed");
    expect(diff[0]?.exposure.value).toBe("runtime");
  });

  test("rejects unsafe build-time variables", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_web"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("web"),
      kind: EnvironmentKindValue.rehydrate("development"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(
      environment
        .setVariable({
          key: ConfigKey.rehydrate("API_SECRET"),
          value: ConfigValueText.rehydrate("secret"),
          kind: VariableKindValue.rehydrate("secret"),
          exposure: VariableExposureValue.rehydrate("build-time"),
          isSecret: true,
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
        })
        .isErr(),
    ).toBe(true);
    expect(
      environment
        .setVariable({
          key: ConfigKey.rehydrate("PUBLIC_BASE_URL"),
          value: ConfigValueText.rehydrate("https://example.com"),
          kind: VariableKindValue.rehydrate("plain-config"),
          exposure: VariableExposureValue.rehydrate("build-time"),
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        })
        .isOk(),
    ).toBe(true);
  });

  test("[ENV-LIFE-AGG-001] archives idempotently and blocks configuration and promotion mutations", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_prod"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    const archiveResult = environment.archive({
      archivedAt: ArchivedAt.rehydrate("2026-01-03T00:00:00.000Z"),
      reason: ArchiveReason.rehydrate("Retired"),
    });

    expect(archiveResult._unsafeUnwrap()).toEqual({ changed: true });
    expect(environment.toState().lifecycleStatus.value).toBe("archived");
    expect(environment.pullDomainEvents()).toMatchObject([
      {
        type: "environment-archived",
        payload: {
          environmentId: "env_prod",
          projectId: "prj_demo",
          environmentName: "production",
          environmentKind: "production",
          archivedAt: "2026-01-03T00:00:00.000Z",
          reason: "Retired",
        },
      },
    ]);

    expect(
      environment
        .archive({
          archivedAt: ArchivedAt.rehydrate("2026-01-04T00:00:00.000Z"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: false });
    expect(environment.pullDomainEvents()).toEqual([]);

    const setResult = environment.setVariable({
      key: ConfigKey.rehydrate("APP_PORT"),
      value: ConfigValueText.rehydrate("3000"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      updatedAt: UpdatedAt.rehydrate("2026-01-04T00:00:00.000Z"),
    });
    expect(setResult.isErr()).toBe(true);
    if (setResult.isErr()) {
      expect(setResult.error.code).toBe("environment_archived");
      expect(setResult.error.details?.commandName).toBe("environments.set-variable");
    }

    const promoteResult = environment.promoteTo({
      targetEnvironmentId: EnvironmentId.rehydrate("env_prod_next"),
      targetName: EnvironmentName.rehydrate("production-next"),
      targetKind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-04T00:00:00.000Z"),
    });
    expect(promoteResult.isErr()).toBe(true);
    if (promoteResult.isErr()) {
      expect(promoteResult.error.code).toBe("environment_archived");
      expect(promoteResult.error.details?.commandName).toBe("environments.promote");
    }
  });

  test("[ENV-LIFE-LOCK-001] [ENV-LIFE-LOCK-003] [ENV-LIFE-UNLOCK-001] [ENV-LIFE-UNLOCK-003] locks and unlocks idempotently", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_prod"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(
      environment
        .lock({
          lockedAt: LockedAt.rehydrate("2026-01-03T00:00:00.000Z"),
          reason: LockReason.rehydrate("Change freeze"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: true });
    expect(environment.toState().lifecycleStatus.value).toBe("locked");
    expect(environment.toState().lockedAt?.value).toBe("2026-01-03T00:00:00.000Z");
    expect(environment.toState().lockReason?.value).toBe("Change freeze");
    expect(environment.pullDomainEvents()).toMatchObject([
      {
        type: "environment-locked",
        payload: {
          environmentId: "env_prod",
          projectId: "prj_demo",
          environmentName: "production",
          environmentKind: "production",
          lockedAt: "2026-01-03T00:00:00.000Z",
          reason: "Change freeze",
        },
      },
    ]);

    expect(
      environment
        .lock({
          lockedAt: LockedAt.rehydrate("2026-01-04T00:00:00.000Z"),
          reason: LockReason.rehydrate("New reason"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: false });
    expect(environment.toState().lockedAt?.value).toBe("2026-01-03T00:00:00.000Z");
    expect(environment.toState().lockReason?.value).toBe("Change freeze");
    expect(environment.pullDomainEvents()).toEqual([]);

    const setResult = environment.setVariable({
      key: ConfigKey.rehydrate("APP_PORT"),
      value: ConfigValueText.rehydrate("3000"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      updatedAt: UpdatedAt.rehydrate("2026-01-04T00:00:00.000Z"),
    });
    expect(setResult.isErr()).toBe(true);
    if (setResult.isErr()) {
      expect(setResult.error.code).toBe("environment_locked");
      expect(setResult.error.details?.commandName).toBe("environments.set-variable");
    }

    expect(
      environment
        .unlock({
          unlockedAt: UnlockedAt.rehydrate("2026-01-05T00:00:00.000Z"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: true });
    expect(environment.toState().lifecycleStatus.value).toBe("active");
    expect(environment.toState().lockedAt).toBeUndefined();
    expect(environment.toState().lockReason).toBeUndefined();
    expect(environment.pullDomainEvents()).toMatchObject([
      {
        type: "environment-unlocked",
        payload: {
          environmentId: "env_prod",
          projectId: "prj_demo",
          environmentName: "production",
          environmentKind: "production",
          lockedAt: "2026-01-03T00:00:00.000Z",
          unlockedAt: "2026-01-05T00:00:00.000Z",
          reason: "Change freeze",
        },
      },
    ]);

    expect(
      environment
        .unlock({
          unlockedAt: UnlockedAt.rehydrate("2026-01-06T00:00:00.000Z"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: false });
    expect(environment.pullDomainEvents()).toEqual([]);
  });

  test("[ENV-LIFE-ARCHIVE-004] archives a locked environment and clears lock metadata", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_prod"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    environment
      .lock({
        lockedAt: LockedAt.rehydrate("2026-01-03T00:00:00.000Z"),
        reason: LockReason.rehydrate("Change freeze"),
      })
      ._unsafeUnwrap();
    environment.pullDomainEvents();

    expect(
      environment
        .archive({
          archivedAt: ArchivedAt.rehydrate("2026-01-04T00:00:00.000Z"),
          reason: ArchiveReason.rehydrate("Retired"),
        })
        ._unsafeUnwrap(),
    ).toEqual({ changed: true });
    expect(environment.toState().lifecycleStatus.value).toBe("archived");
    expect(environment.toState().lockedAt).toBeUndefined();
    expect(environment.toState().lockReason).toBeUndefined();
  });
});
