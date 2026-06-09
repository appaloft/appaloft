import {
  domainError,
  err,
  ok,
  type Result,
  StorageBindSourcePath,
  StorageDestinationPath,
} from "@appaloft/core";
import type { DockerRunMountInput } from "./runtime-commands";

interface RuntimeStorageMountMetadata {
  attachmentId: string;
  storageVolumeId: string;
  storageVolumeKind: "named-volume" | "bind-mount";
  sourcePath?: string;
  destinationPath: string;
  mountMode: "read-write" | "read-only";
  dataFormat?: "sqlite" | "json-files" | "filesystem" | "application-export" | "unknown";
  applicationDataLabel?: string;
}

export interface DockerStorageVolumeRealization {
  storageVolumeId: string;
  volumeName: string;
  labels: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeStorageMountMetadata(value: unknown): value is RuntimeStorageMountMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.attachmentId === "string" &&
    typeof value.storageVolumeId === "string" &&
    (value.storageVolumeKind === "named-volume" || value.storageVolumeKind === "bind-mount") &&
    (typeof value.sourcePath === "string" || value.sourcePath === undefined) &&
    typeof value.destinationPath === "string" &&
    (value.mountMode === "read-write" || value.mountMode === "read-only")
    &&
    (
      value.dataFormat === undefined ||
      value.dataFormat === "sqlite" ||
      value.dataFormat === "json-files" ||
      value.dataFormat === "filesystem" ||
      value.dataFormat === "application-export" ||
      value.dataFormat === "unknown"
    ) &&
    (typeof value.applicationDataLabel === "string" || value.applicationDataLabel === undefined)
  );
}

export function dockerVolumeNameForStorageVolumeId(storageVolumeId: string): Result<string> {
  const candidate = `appaloft-${storageVolumeId}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(candidate)) {
    return err(
      domainError.validation("Storage volume id cannot be rendered as a Docker volume name", {
        phase: "storage-runtime-realization",
        storageVolumeId,
      }),
    );
  }
  return ok(candidate);
}

function storageMountMetadataFromRuntimeMetadata(
  metadata: Record<string, string> | undefined,
): Result<RuntimeStorageMountMetadata[]> {
  const serialized = metadata?.["storage.mounts"];
  if (!serialized) {
    return ok([]);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return err(
      domainError.validation("Storage mount metadata is not valid JSON", {
        phase: "storage-runtime-realization",
      }),
    );
  }

  if (!Array.isArray(parsed) || !parsed.every(isRuntimeStorageMountMetadata)) {
    return err(
      domainError.validation("Storage mount metadata has an unsupported shape", {
        phase: "storage-runtime-realization",
      }),
    );
  }

  return ok(parsed);
}

function dockerStorageVolumeLabels(input: {
  storageVolumeId: string;
}): Record<string, string> {
  return {
    "appaloft.managed": "true",
    "appaloft.storage-volume-id": input.storageVolumeId,
    "appaloft.storage-volume-kind": "named-volume",
    "appaloft.storage-runtime-realized-by": "deployment-execution",
  };
}

export function dockerStorageVolumeRealizationsFromRuntimeMetadata(
  metadata: Record<string, string> | undefined,
): Result<DockerStorageVolumeRealization[]> {
  const parsed = storageMountMetadataFromRuntimeMetadata(metadata);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const realizations = new Map<string, DockerStorageVolumeRealization>();
  for (const mount of parsed.value) {
    if (mount.storageVolumeKind !== "named-volume") {
      continue;
    }

    const volumeName = dockerVolumeNameForStorageVolumeId(mount.storageVolumeId);
    if (volumeName.isErr()) {
      return err(volumeName.error);
    }

    if (!realizations.has(volumeName.value)) {
      realizations.set(volumeName.value, {
        storageVolumeId: mount.storageVolumeId,
        volumeName: volumeName.value,
        labels: dockerStorageVolumeLabels({ storageVolumeId: mount.storageVolumeId }),
      });
    }
  }

  return ok([...realizations.values()]);
}

export function renderDockerVolumeRealizationScript(input: {
  realizations: readonly DockerStorageVolumeRealization[];
  quote: (value: string) => string;
}): string {
  return input.realizations
    .flatMap((realization) => {
      const labelFlags = Object.entries(realization.labels)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `--label ${input.quote(`${name}=${value}`)}`)
        .join(" ");
      return [
        `docker volume create ${labelFlags} ${input.quote(realization.volumeName)} >/dev/null`,
        `appaloft_storage_volume_id=$(docker volume inspect -f ${input.quote('{{ index .Labels "appaloft.storage-volume-id" }}')} ${input.quote(realization.volumeName)})`,
        `appaloft_storage_managed=$(docker volume inspect -f ${input.quote('{{ index .Labels "appaloft.managed" }}')} ${input.quote(realization.volumeName)})`,
        `if [ "$appaloft_storage_volume_id" != ${input.quote(realization.storageVolumeId)} ] || [ "$appaloft_storage_managed" != ${input.quote("true")} ]; then printf '%s\\n' ${input.quote(`Docker volume ${realization.volumeName} is not owned by Appaloft storage volume ${realization.storageVolumeId}`)} >&2; exit 2; fi`,
      ];
    })
    .join("\n");
}

export function dockerStorageMountsFromRuntimeMetadata(
  metadata: Record<string, string> | undefined,
): Result<DockerRunMountInput[]> {
  const parsed = storageMountMetadataFromRuntimeMetadata(metadata);
  if (parsed.isErr()) {
    return err(parsed.error);
  }

  const mounts: DockerRunMountInput[] = [];
  for (const mount of parsed.value) {
    const destinationPath = StorageDestinationPath.create(mount.destinationPath);
    if (destinationPath.isErr()) {
      return err(
        domainError.validation("Storage mount metadata has an unsafe destination path", {
          phase: "storage-runtime-realization",
          attachmentId: mount.attachmentId,
          storageVolumeId: mount.storageVolumeId,
          field: "destinationPath",
        }),
      );
    }

    if (mount.storageVolumeKind === "bind-mount" && !mount.sourcePath) {
      return err(
        domainError.validation("Bind mount storage metadata requires sourcePath", {
          phase: "storage-runtime-realization",
          attachmentId: mount.attachmentId,
          storageVolumeId: mount.storageVolumeId,
        }),
      );
    }

    if (mount.storageVolumeKind === "named-volume") {
      const volumeName = dockerVolumeNameForStorageVolumeId(mount.storageVolumeId);
      if (volumeName.isErr()) {
        return err(volumeName.error);
      }
      mounts.push({
        type: "volume",
        source: volumeName.value,
        target: destinationPath.value.value,
        readOnly: mount.mountMode === "read-only",
      });
      continue;
    }

    const sourcePath = mount.sourcePath;
    if (!sourcePath) {
      return err(
        domainError.validation("Bind mount storage metadata requires sourcePath", {
          phase: "storage-runtime-realization",
          attachmentId: mount.attachmentId,
          storageVolumeId: mount.storageVolumeId,
        }),
      );
    }
    const bindSourcePath = StorageBindSourcePath.create(sourcePath);
    if (bindSourcePath.isErr()) {
      return err(
        domainError.validation("Storage mount metadata has an unsafe bind source path", {
          phase: "storage-runtime-realization",
          attachmentId: mount.attachmentId,
          storageVolumeId: mount.storageVolumeId,
          field: "sourcePath",
        }),
      );
    }

    mounts.push({
      type: "bind",
      source: bindSourcePath.value.value,
      target: destinationPath.value.value,
      readOnly: mount.mountMode === "read-only",
    });
  }

  return ok(mounts);
}
