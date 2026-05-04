import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeletedAt,
  EnvironmentId,
  ProjectId,
  StorageBindSourcePath,
  StorageVolume,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");

describe("StorageVolume", () => {
  test("[STOR-CREATE-001] creates named volume metadata and emits a creation event", () => {
    const storageVolume = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("App Data"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt,
    })._unsafeUnwrap();

    const state = storageVolume.toState();
    expect(state.slug.value).toBe("app-data");
    expect(state.kind.value).toBe("named-volume");
    expect(state.sourcePath).toBeUndefined();
    expect(storageVolume.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "storage-volume-created",
        aggregateId: "stv_demo",
        payload: expect.objectContaining({
          storageVolumeId: "stv_demo",
          slug: "app-data",
          kind: "named-volume",
        }),
      }),
    ]);
  });

  test("[STOR-CREATE-002] rejects unsafe bind source paths", () => {
    const sourcePath = StorageBindSourcePath.create("/var/lib/../secret");

    expect(sourcePath.isErr()).toBe(true);
    expect(sourcePath._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "storage-volume-validation",
        field: "sourcePath",
      },
    });
  });

  test("[STOR-DELETE-001] blocks deletion while attachments exist", () => {
    const storageVolume = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("App Data"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt,
    })._unsafeUnwrap();

    const result = storageVolume.delete({
      attachmentCount: 1,
      deletedAt: DeletedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "storage-volume-delete-safety",
        storageVolumeId: "stv_demo",
      },
    });
    expect(storageVolume.toState().lifecycleStatus.value).toBe("active");
  });
});
