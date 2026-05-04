import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  EnvironmentId,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceStorageAttachmentId,
  ResourceStorageMountModeValue,
  StorageDestinationPath,
  StorageVolumeId,
  UpdatedAt,
} from "../src";

function resourceFixture(): Resource {
  return Resource.create({
    id: ResourceId.rehydrate("res_web"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("Web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("Resource storage attachments", () => {
  test("[STOR-ATTACH-001] attaches storage with a validated destination path", () => {
    const resource = resourceFixture();

    const result = resource.attachStorage({
      attachmentId: ResourceStorageAttachmentId.rehydrate("rsa_demo"),
      storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
      destinationPath: StorageDestinationPath.create("/data")._unsafeUnwrap(),
      mountMode: ResourceStorageMountModeValue.rehydrate("read-write"),
      attachedAt: CreatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    expect(result.isOk()).toBe(true);
    expect(resource.toState().storageAttachments).toHaveLength(1);
    expect(resource.toState().storageAttachments[0]?.destinationPath.value).toBe("/data");
  });

  test("[STOR-ATTACH-002] rejects duplicate resource destination paths", () => {
    const resource = resourceFixture();
    const destinationPath = StorageDestinationPath.create("/data")._unsafeUnwrap();
    resource
      .attachStorage({
        attachmentId: ResourceStorageAttachmentId.rehydrate("rsa_one"),
        storageVolumeId: StorageVolumeId.rehydrate("stv_one"),
        destinationPath,
        mountMode: ResourceStorageMountModeValue.rehydrate("read-write"),
        attachedAt: CreatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const duplicate = resource.attachStorage({
      attachmentId: ResourceStorageAttachmentId.rehydrate("rsa_two"),
      storageVolumeId: StorageVolumeId.rehydrate("stv_two"),
      destinationPath,
      mountMode: ResourceStorageMountModeValue.rehydrate("read-only"),
      attachedAt: CreatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    expect(duplicate.isErr()).toBe(true);
    expect(duplicate._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
      details: {
        phase: "resource-storage-attachment",
        resourceId: "res_web",
        destinationPath: "/data",
      },
    });
  });

  test("[STOR-DETACH-001] detaches storage without deleting volume identity", () => {
    const resource = resourceFixture();
    const attachmentId = ResourceStorageAttachmentId.rehydrate("rsa_demo");
    resource
      .attachStorage({
        attachmentId,
        storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
        destinationPath: StorageDestinationPath.create("/data")._unsafeUnwrap(),
        mountMode: ResourceStorageMountModeValue.rehydrate("read-write"),
        attachedAt: CreatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const result = resource.detachStorage({
      attachmentId,
      detachedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    });

    expect(result.isOk()).toBe(true);
    expect(resource.toState().storageAttachments).toHaveLength(0);
  });
});
