import {
  type DependencyResourceBackupProviderInput,
  type DependencyResourceBackupProviderPort,
  type DependencyResourceBackupProviderResult,
  type DependencyResourceKind,
  type DependencyResourceRestoreProviderInput,
  type DependencyResourceRestoreProviderResult,
  type ExecutionContext,
  type ServerRepository,
} from "@appaloft/application";
import { type AshScript } from "@appaloft/ash";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { dockerBackupCapabilities } from "./backup-capabilities";
import {
  backupHandle,
  commandFailure,
  type DockerManagedDependencyServiceDefinition,
  parseDockerBackupHandle,
  requireTargetFromHandle,
  runTargetCommand,
  serviceForProvider,
} from "./docker-shared";

interface DockerDependencyBackupCapability {
  definition: DockerManagedDependencyServiceDefinition;
  createCommand(
    input: DependencyResourceBackupProviderInput & { container: string; path: string },
  ): Result<AshScript, DomainError>;
  restoreCommand(
    input: DependencyResourceRestoreProviderInput & { container: string; path: string },
  ): Result<AshScript, DomainError>;
  pathForBackup(input: Parameters<typeof backupHandle>[0]): string;
}

export class DockerBackedDependencyResourceBackupProvider
  implements DependencyResourceBackupProviderPort
{
  constructor(private readonly serverRepository: ServerRepository) {}

  supports(providerKey: string, dependencyKind: DependencyResourceKind): boolean {
    return Boolean(backupCapabilityFor(providerKey, dependencyKind));
  }

  async createBackup(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<Result<DependencyResourceBackupProviderResult, DomainError>> {
    const capability = backupCapabilityFor(input.providerKey, input.dependencyKind);
    if (!capability) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Provider does not support Docker-backed dependency backup",
          {
            phase: "managed-dependency-docker-backup",
            providerKey: input.providerKey,
            dependencyKind: input.dependencyKind,
          },
        ),
      );
    }

    if (!input.providerResourceHandle) {
      return ok({
        providerArtifactHandle: `backup/${input.dependencyResourceId}/${input.backupId}`,
        completedAt: input.requestedAt,
        retentionStatus: "retained",
      });
    }

    const resolved = await requireTargetFromHandle({
      context,
      serverRepository: this.serverRepository,
      providerResourceHandle: input.providerResourceHandle,
      operation: "dependency-resources.backup.create",
    });
    if (resolved.isErr()) {
      return err(resolved.error);
    }
    if (resolved.value.handle.kind !== capability.definition.kind) {
      return err(kindMismatch("managed-dependency-docker-backup", input.dependencyKind));
    }

    const backup = {
      ...resolved.value.handle,
      backupId: input.backupId,
    };
    const path = capability.pathForBackup(backup);
    const commandResult = capability.createCommand({
      ...input,
      container: backup.containerName,
      path,
    });
    if (commandResult.isErr()) {
      return err(commandResult.error);
    }
    const result = await runTargetCommand(resolved.value.target, commandResult.value);
    if (result.exitCode !== 0) {
      return commandFailure({
        message: "Docker-backed dependency backup failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.backup.create",
        exitCode: result.exitCode,
      });
    }

    return ok({
      providerArtifactHandle: backupHandle(backup),
      completedAt: input.requestedAt,
      retentionStatus: "retained",
    });
  }

  async restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>> {
    const capability = backupCapabilityFor(input.providerKey, input.dependencyKind);
    if (!capability) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Provider does not support Docker-backed dependency restore",
          {
            phase: "managed-dependency-docker-restore",
            providerKey: input.providerKey,
            dependencyKind: input.dependencyKind,
          },
        ),
      );
    }

    const backup = parseDockerBackupHandle(input.providerArtifactHandle);
    if (!backup) {
      return ok({ completedAt: input.requestedAt });
    }
    if (!input.providerResourceHandle) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Docker-backed restore requires provider resource handle",
          {
            phase: "managed-dependency-docker-restore",
            dependencyKind: input.dependencyKind,
          },
        ),
      );
    }
    const resolved = await requireTargetFromHandle({
      context,
      serverRepository: this.serverRepository,
      providerResourceHandle: input.providerResourceHandle,
      operation: "dependency-resources.backup.restore",
    });
    if (resolved.isErr()) {
      return err(resolved.error);
    }
    if (
      backup.kind !== capability.definition.kind ||
      resolved.value.handle.kind !== capability.definition.kind ||
      backup.containerName !== resolved.value.handle.containerName
    ) {
      return err(kindMismatch("managed-dependency-docker-restore", input.dependencyKind));
    }

    const path = capability.pathForBackup(backup);
    const commandResult = capability.restoreCommand({
      ...input,
      container: backup.containerName,
      path,
    });
    if (commandResult.isErr()) {
      return err(commandResult.error);
    }
    const result = await runTargetCommand(resolved.value.target, commandResult.value);
    if (result.exitCode !== 0) {
      return commandFailure({
        message: "Docker-backed dependency restore failed",
        providerKey: input.providerKey,
        operation: "dependency-resources.backup.restore",
        exitCode: result.exitCode,
      });
    }

    return ok({ completedAt: input.requestedAt });
  }
}

function backupCapabilityFor(
  providerKey: string,
  dependencyKind: DependencyResourceKind,
): DockerDependencyBackupCapability | undefined {
  const definition = serviceForProvider(providerKey, dependencyKind);
  return dockerBackupCapabilities.find((capability) => capability.definition === definition);
}

function kindMismatch(phase: string, dependencyKind: DependencyResourceKind): DomainError {
  return domainError.providerCapabilityUnsupported(
    "Docker-backed handle does not match dependency resource",
    {
      phase,
      dependencyKind,
    },
  );
}
