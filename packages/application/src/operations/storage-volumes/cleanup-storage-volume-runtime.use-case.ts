import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  StorageVolumeByIdSpec,
  StorageVolumeId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { z } from "zod";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventRecorder,
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type ServerRepository,
  type StorageRuntimeCleaner,
  type StorageRuntimeCleanupResult,
  type StorageVolumeBackupSafetyReader,
  type StorageVolumeReadModel,
  type StorageVolumeRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ParsedCleanupStorageVolumeRuntimeCommandInput } from "./cleanup-storage-volume-runtime.command";

const deploymentStorageMountSchema = z
  .object({
    storageVolumeId: z.string(),
  })
  .passthrough();

function withCleanupDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      commandName: "storage-volumes.cleanup-runtime",
      ...details,
    },
  };
}

function deploymentReferencesStorageVolume(
  deployment: DeploymentSummary,
  storageVolumeId: string,
): boolean {
  const serialized = deployment.runtimePlan.execution.metadata?.["storage.mounts"];
  if (!serialized) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(serialized);
    const mounts = z.array(deploymentStorageMountSchema).safeParse(parsed);
    return mounts.success
      ? mounts.data.some((mount) => mount.storageVolumeId === storageVolumeId)
      : false;
  } catch {
    return false;
  }
}

function hasRollbackArtifact(deployment: DeploymentSummary): boolean {
  return Boolean(
    deployment.runtimePlan.runtimeArtifact?.image ||
      deployment.runtimePlan.runtimeArtifact?.composeFile ||
      deployment.runtimePlan.execution.image ||
      deployment.runtimePlan.execution.composeFile,
  );
}

function isRollbackCandidate(deployment: DeploymentSummary): boolean {
  return deployment.status === "succeeded" && hasRollbackArtifact(deployment);
}

@injectable()
export class CleanupStorageVolumeRuntimeUseCase {
  constructor(
    @inject(tokens.storageVolumeRepository)
    private readonly storageVolumeRepository: StorageVolumeRepository,
    @inject(tokens.storageVolumeReadModel)
    private readonly storageVolumeReadModel: StorageVolumeReadModel,
    @inject(tokens.storageVolumeBackupSafetyReader)
    private readonly storageVolumeBackupSafetyReader: StorageVolumeBackupSafetyReader,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.storageRuntimeCleaner)
    private readonly storageRuntimeCleaner: StorageRuntimeCleaner,
    @inject(tokens.auditEventRecorder)
    private readonly auditEventRecorder: AuditEventRecorder,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedCleanupStorageVolumeRuntimeCommandInput,
  ): Promise<Result<StorageRuntimeCleanupResult>> {
    const storageVolumeId = StorageVolumeId.create(input.storageVolumeId);
    if (storageVolumeId.isErr()) {
      return err(
        withCleanupDetails(storageVolumeId.error, {
          phase: "command-validation",
          storageVolumeId: input.storageVolumeId,
        }),
      );
    }

    const serverId = DeploymentTargetId.create(input.serverId);
    if (serverId.isErr()) {
      return err(
        withCleanupDetails(serverId.error, {
          phase: "command-validation",
          serverId: input.serverId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const storageVolume = await this.storageVolumeRepository.findOne(
      repositoryContext,
      StorageVolumeByIdSpec.create(storageVolumeId.value),
    );
    if (!storageVolume) {
      return err(
        withCleanupDetails(domainError.notFound("storage_volume", input.storageVolumeId), {
          phase: "storage-volume-read",
          storageVolumeId: input.storageVolumeId,
        }),
      );
    }

    const server = await this.serverRepository.findOne(
      repositoryContext,
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server) {
      return err(
        withCleanupDetails(domainError.notFound("server", input.serverId), {
          phase: "server-read",
          serverId: input.serverId,
        }),
      );
    }

    const storageState = storageVolume.toState();
    const referencedDeployments = (
      await this.deploymentReadModel.list(repositoryContext, {
        projectId: storageState.projectId.value,
      })
    ).filter(
      (deployment) =>
        deployment.serverId === input.serverId &&
        deploymentReferencesStorageVolume(deployment, storageState.id.value),
    );
    const backupSafety = await this.storageVolumeBackupSafetyReader.findSafetyEvidence(
      repositoryContext,
      { storageVolumeId: storageState.id.value },
    );
    if (backupSafety.isErr()) {
      return err(
        withCleanupDetails(backupSafety.error, {
          phase: "storage-backup-safety-read",
          storageVolumeId: storageState.id.value,
        }),
      );
    }
    const cleanupResult = await this.storageRuntimeCleaner.cleanup(context, {
      server: server.toState(),
      storageVolume: storageState,
      before: input.before,
      dryRun: input.dryRun,
      safetyEvidence: {
        activeAttachmentCount: await this.storageVolumeReadModel.countAttachments(
          repositoryContext,
          storageState.id.value,
        ),
        backupRetentionRequired:
          (storageState.backupRelationship?.retentionRequired ?? false) ||
          backupSafety.value.backupRetentionRequired,
        backupRestoreInFlightCount: backupSafety.value.backupRestoreInFlightCount,
        retainedSnapshotCount: referencedDeployments.length,
        rollbackCandidateCount: referencedDeployments.filter(isRollbackCandidate).length,
      },
    });
    if (cleanupResult.isErr()) {
      return err(cleanupResult.error);
    }

    const auditResult = await this.recordDestructiveCleanupAudit(
      context,
      input,
      cleanupResult.value,
    );
    if (auditResult.isErr()) {
      return err(auditResult.error);
    }

    return ok(auditResult.value);
  }

  private async recordDestructiveCleanupAudit(
    context: ExecutionContext,
    input: ParsedCleanupStorageVolumeRuntimeCommandInput,
    result: StorageRuntimeCleanupResult,
  ): Promise<Result<StorageRuntimeCleanupResult>> {
    if (input.dryRun || result.summary.cleanedCount === 0) {
      return ok(result);
    }

    try {
      const auditResult = await this.auditEventRecorder.record(toRepositoryContext(context), {
        id: this.idGenerator.next("aud"),
        aggregateId: input.storageVolumeId,
        eventType: "storage-volume-runtime-cleaned",
        payload: {
          operationKey: "storage-volumes.cleanup-runtime",
          storageVolumeId: input.storageVolumeId,
          serverId: input.serverId,
          before: input.before,
          cleanedAt: result.cleanedAt,
          inspectedCount: result.summary.inspectedCount,
          matchedCount: result.summary.matchedCount,
          cleanedCount: result.summary.cleanedCount,
          skippedCount: result.summary.skippedCount,
          blockedCount: result.summary.blockedCount,
        },
        createdAt: this.clock.now(),
      });
      if (auditResult.isErr()) {
        return ok(withAuditWarning(result));
      }
    } catch {
      return ok(withAuditWarning(result));
    }

    return ok(result);
  }
}

function withAuditWarning(result: StorageRuntimeCleanupResult): StorageRuntimeCleanupResult {
  return {
    ...result,
    warnings: [
      ...result.warnings,
      {
        code: "audit-record-failed",
        message: "Storage runtime cleanup succeeded, but audit output could not be recorded.",
      },
    ],
  };
}
