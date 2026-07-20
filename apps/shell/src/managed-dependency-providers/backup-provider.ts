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
import { type AshScript, ash } from "@appaloft/ash";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { dockerBackupCapabilities } from "./backup-capabilities";
import {
  backupHandle,
  commandFailure,
  type DockerManagedDependencyServiceDefinition,
  parseDockerBackupHandle,
  requireTargetFromHandle,
  resolveSingleServerTarget,
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
    const capability = backupCapabilityFor(providerKey, dependencyKind);
    return capability?.definition.managedProviderKey === providerKey;
  }

  supportsRestore(input: {
    backupId: string;
    sourceProviderKey: string;
    targetProviderKey: string;
    dependencyKind: DependencyResourceKind;
    providerArtifactHandle: string;
    sameDependencyResource: boolean;
  }): boolean {
    if (input.sameDependencyResource) {
      const backup = parseDockerBackupHandle(input.providerArtifactHandle);
      return (
        this.supports(input.targetProviderKey, input.dependencyKind) &&
        backup?.kind === input.dependencyKind &&
        backup.backupId === input.backupId
      );
    }
    const backup = parseDockerBackupHandle(input.providerArtifactHandle);
    return (
      input.sourceProviderKey === "appaloft-managed-postgres" &&
      input.targetProviderKey === "external-postgres" &&
      input.dependencyKind === "postgres" &&
      backup?.kind === "postgres" &&
      backup.backupId === input.backupId
    );
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
      retentionStatus: "none",
    });
  }

  async restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>> {
    const backup = parseDockerBackupHandle(input.providerArtifactHandle);
    if (
      backup &&
      input.sourceProviderKey === "appaloft-managed-postgres" &&
      input.providerKey === "external-postgres" &&
      input.dependencyKind === "postgres" &&
      input.sourceDependencyResourceId &&
      input.sourceDependencyResourceId !== input.dependencyResourceId &&
      backup.kind === "postgres" &&
      backup.backupId === input.backupId
    ) {
      const capability = backupCapabilityFor(input.sourceProviderKey, input.dependencyKind);
      if (!capability) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Source artifact is not supported for cross-resource restore",
            {
              phase: "managed-dependency-cross-resource-restore",
              providerKey: input.providerKey,
              dependencyKind: input.dependencyKind,
            },
          ),
        );
      }
      if (!input.connectionSecretValue) {
        return err(
          domainError.providerCapabilityUnsupported(
            "Cross-resource Postgres restore requires a target connection",
            {
              phase: "managed-dependency-cross-resource-restore",
              providerKey: input.providerKey,
              dependencyKind: input.dependencyKind,
            },
          ),
        );
      }
      const target = await resolveSingleServerTarget({
        context,
        serverRepository: this.serverRepository,
        serverId: backup.serverId,
        operation: "dependency-resources.backup.restore",
      });
      if (target.isErr()) {
        return err(target.error);
      }
      const path = capability.pathForBackup(backup);
      const pathSetup = renderBackupPathSetup(path);
      const nested = ash`
        IFS= read -r target_url
        export PGDATABASE="$target_url"
        pg_restore --list /appaloft-backup.dump | sed -e "/ SCHEMA - public /d" -e "/ ACL - SCHEMA public /d" -e "/ COMMENT - SCHEMA public /d" > /tmp/appaloft.restore.list
        pg_restore --use-list=/tmp/appaloft.restore.list --clean --if-exists --no-owner --no-privileges /appaloft-backup.dump
      `;
      const result = await runTargetCommand(
        target.value,
        ash`
          set -eu
          ${pathSetup}
          test -f "$APPALOFT_DEPENDENCY_BACKUP_PATH"
          docker run --rm -i -v "$APPALOFT_DEPENDENCY_BACKUP_PATH:/appaloft-backup.dump:ro" postgres:16-alpine sh -lc ${ash.arg(ash.render(nested))}
        `,
        {
          stdin: new TextEncoder().encode(`${input.connectionSecretValue}\n`),
        },
      );
      if (result.exitCode !== 0) {
        return commandFailure({
          message: "Cross-resource Postgres restore failed",
          providerKey: input.providerKey,
          operation: "dependency-resources.backup.restore",
          exitCode: result.exitCode,
        });
      }
      return ok({ completedAt: input.requestedAt });
    }
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

export class RoutedDependencyResourceBackupProvider
  implements DependencyResourceBackupProviderPort
{
  constructor(
    private readonly dockerProvider: DockerBackedDependencyResourceBackupProvider,
    private readonly fallbackProvider: DependencyResourceBackupProviderPort,
  ) {}

  supports(providerKey: string, dependencyKind: DependencyResourceKind): boolean {
    return (
      this.dockerProvider.supports(providerKey, dependencyKind) ||
      this.fallbackProvider.supports(providerKey, dependencyKind)
    );
  }

  supportsRestore(input: {
    backupId: string;
    sourceProviderKey: string;
    targetProviderKey: string;
    dependencyKind: DependencyResourceKind;
    providerArtifactHandle: string;
    sameDependencyResource: boolean;
  }): boolean {
    return (
      this.dockerProvider.supportsRestore(input) ||
      (input.sameDependencyResource &&
        this.fallbackProvider.supports(input.targetProviderKey, input.dependencyKind))
    );
  }

  createBackup(
    context: ExecutionContext,
    input: DependencyResourceBackupProviderInput,
  ): Promise<Result<DependencyResourceBackupProviderResult, DomainError>> {
    const provider = this.dockerProvider.supports(input.providerKey, input.dependencyKind)
      ? this.dockerProvider
      : this.fallbackProvider;
    return provider.createBackup(context, input);
  }

  restoreBackup(
    context: ExecutionContext,
    input: DependencyResourceRestoreProviderInput,
  ): Promise<Result<DependencyResourceRestoreProviderResult, DomainError>> {
    const sameDependencyResource =
      !input.sourceDependencyResourceId ||
      input.sourceDependencyResourceId === input.dependencyResourceId;
    const provider = this.dockerProvider.supportsRestore({
      backupId: input.backupId,
      sourceProviderKey: input.sourceProviderKey ?? input.providerKey,
      targetProviderKey: input.providerKey,
      dependencyKind: input.dependencyKind,
      providerArtifactHandle: input.providerArtifactHandle,
      sameDependencyResource,
    })
      ? this.dockerProvider
      : this.fallbackProvider;
    return provider.restoreBackup(context, input);
  }
}

function renderBackupPathSetup(path: string): AshScript {
  const homePrefix = "$HOME/";
  if (!path.startsWith(homePrefix)) {
    throw new TypeError("Managed dependency backup path must be rooted below $HOME");
  }
  return ash`
    ${ash.env("APPALOFT_DEPENDENCY_BACKUP_RELATIVE_PATH", path.slice(homePrefix.length))}
    APPALOFT_DEPENDENCY_BACKUP_PATH="$HOME/$APPALOFT_DEPENDENCY_BACKUP_RELATIVE_PATH"
  `;
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
