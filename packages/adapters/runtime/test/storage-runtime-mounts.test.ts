import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ash } from "@appaloft/ash";
import {
  dockerStorageMountsFromRuntimeMetadata,
  dockerStorageVolumeRealizationsFromRuntimeMetadata,
  renderDockerVolumeRealizationScript,
} from "../src/storage-runtime-mounts";

const repoFile = (path: string) => new URL(`../../../../${path}`, import.meta.url);

describe("storage runtime mounts", () => {
  test("[STOR-RUNTIME-001] converts storage mount metadata to Docker mounts", () => {
    const result = dockerStorageMountsFromRuntimeMetadata({
      "storage.mounts": JSON.stringify([
        {
          attachmentId: "rsa_data",
          storageVolumeId: "stv_data",
          storageVolumeKind: "named-volume",
          destinationPath: "/var/lib/app/data",
          mountMode: "read-write",
        },
        {
          attachmentId: "rsa_cache",
          storageVolumeId: "stv_cache",
          storageVolumeKind: "bind-mount",
          sourcePath: "/srv/appaloft/cache",
          destinationPath: "/cache",
          mountMode: "read-only",
        },
      ]),
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual([
      {
        type: "volume",
        source: "appaloft-stv_data",
        target: "/var/lib/app/data",
        readOnly: false,
      },
      {
        type: "bind",
        source: "/srv/appaloft/cache",
        target: "/cache",
        readOnly: true,
      },
    ]);
  });

  test("[STOR-REALIZE-001] renders Docker volume realization with Appaloft ownership labels", () => {
    const realizations = dockerStorageVolumeRealizationsFromRuntimeMetadata({
      "storage.mounts": JSON.stringify([
        {
          attachmentId: "rsa_data",
          storageVolumeId: "stv_data",
          storageVolumeKind: "named-volume",
          destinationPath: "/var/lib/app/data",
          mountMode: "read-write",
        },
        {
          attachmentId: "rsa_data_readonly",
          storageVolumeId: "stv_data",
          storageVolumeKind: "named-volume",
          destinationPath: "/readonly-data",
          mountMode: "read-only",
        },
        {
          attachmentId: "rsa_cache",
          storageVolumeId: "stv_cache",
          storageVolumeKind: "bind-mount",
          sourcePath: "/srv/appaloft/cache",
          destinationPath: "/cache",
          mountMode: "read-only",
        },
      ]),
    });

    expect(realizations.isOk()).toBe(true);
    expect(realizations._unsafeUnwrap()).toEqual([
      {
        storageVolumeId: "stv_data",
        volumeName: "appaloft-stv_data",
        labels: {
          "appaloft.managed": "true",
          "appaloft.storage-runtime-realized-by": "deployment-execution",
          "appaloft.storage-volume-id": "stv_data",
          "appaloft.storage-volume-kind": "named-volume",
        },
      },
    ]);

    const script = renderDockerVolumeRealizationScript({
      realizations: realizations._unsafeUnwrap(),
      quote: ash.quote,
    });

    expect(script).toContain("docker volume create");
    expect(script).toContain("--label 'appaloft.managed=true'");
    expect(script).toContain("--label 'appaloft.storage-volume-id=stv_data'");
    expect(script).toContain("--label 'appaloft.storage-volume-kind=named-volume'");
    expect(script).toContain(
      "--label 'appaloft.storage-runtime-realized-by=deployment-execution'",
    );
    expect(script).toContain("'appaloft-stv_data'");
    expect(script).toContain('{{ index .Labels "appaloft.storage-volume-id" }}');
    expect(script).toContain("Docker volume appaloft-stv_data is not owned by Appaloft");
  });

  test("[STOR-RUNTIME-001] rejects bind mount metadata without sourcePath", () => {
    const result = dockerStorageMountsFromRuntimeMetadata({
      "storage.mounts": JSON.stringify([
        {
          attachmentId: "rsa_cache",
          storageVolumeId: "stv_cache",
          storageVolumeKind: "bind-mount",
          destinationPath: "/cache",
          mountMode: "read-only",
        },
      ]),
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "storage-runtime-realization",
        attachmentId: "rsa_cache",
        storageVolumeId: "stv_cache",
      },
    });
  });

  test("[STOR-RUNTIME-001] rejects unsafe runtime mount paths before Docker command rendering", () => {
    const unsafeDestination = dockerStorageMountsFromRuntimeMetadata({
      "storage.mounts": JSON.stringify([
        {
          attachmentId: "rsa_data",
          storageVolumeId: "stv_data",
          storageVolumeKind: "named-volume",
          destinationPath: "/var/lib/../secret",
          mountMode: "read-write",
        },
      ]),
    });
    const unsafeBindSource = dockerStorageMountsFromRuntimeMetadata({
      "storage.mounts": JSON.stringify([
        {
          attachmentId: "rsa_cache",
          storageVolumeId: "stv_cache",
          storageVolumeKind: "bind-mount",
          sourcePath: "/srv/appaloft/cache;rm",
          destinationPath: "/cache",
          mountMode: "read-only",
        },
      ]),
    });

    expect(unsafeDestination.isErr()).toBe(true);
    expect(unsafeDestination._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "storage-runtime-realization",
        attachmentId: "rsa_data",
        storageVolumeId: "stv_data",
        field: "destinationPath",
      },
    });
    expect(unsafeBindSource.isErr()).toBe(true);
    expect(unsafeBindSource._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "storage-runtime-realization",
        attachmentId: "rsa_cache",
        storageVolumeId: "stv_cache",
        field: "sourcePath",
      },
    });
  });

  test("[STOR-REALIZE-001][STOR-REALIZE-002] source-of-truth docs do not preserve stale storage realization gaps", () => {
    const baselinePlan = readFileSync(
      repoFile("docs/specs/032-storage-volume-lifecycle-and-resource-attachment/plan.md"),
      "utf8",
    );
    const baselineTasks = readFileSync(
      repoFile("docs/specs/032-storage-volume-lifecycle-and-resource-attachment/tasks.md"),
      "utf8",
    );
    const matrix = readFileSync(repoFile("docs/testing/storage-volume-test-matrix.md"), "utf8");

    expect(baselinePlan).toContain("Docker, Docker Compose, Docker Swarm image-service");
    expect(baselinePlan).toContain("storage-volumes.cleanup-runtime");
    expect(baselinePlan).not.toContain("Provider-native Docker/Compose/Swarm realization is deferred");
    expect(baselinePlan).not.toContain("Runtime cleanup/prune remains out of scope");
    expect(baselineTasks).not.toContain("otherwise record deferred-gap");
    expect(baselineTasks).not.toContain("Record deployment snapshot materialization as a deferred gap");
    expect(matrix).not.toContain("planned: `packages/adapters/runtime/test/storage-runtime-mounts.test.ts`");
    expect(matrix).not.toContain("planned: `packages/application/test/storage-volume-lifecycle.test.ts`");
  });
});
