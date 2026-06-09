import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { type CreateStorageVolumeBackupPlanQuery } from "./create-storage-volume-backup-plan.query";
import {
  planStorageVolumeBackup,
  type StorageBackupProviderRegistryPort,
} from "./storage-volume-backup-contract";

@injectable()
export class CreateStorageVolumeBackupPlanQueryService {
  constructor(
    @inject(tokens.storageVolumeBackupProviderRegistry)
    private readonly providerRegistry: StorageBackupProviderRegistryPort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CreateStorageVolumeBackupPlanQuery,
  ): Promise<
    Result<ReturnType<typeof planStorageVolumeBackup> extends Result<infer TValue> ? TValue : never>
  > {
    void context;
    const plan = planStorageVolumeBackup(query.request, {
      sourceAdapters: this.providerRegistry.sourceAdapters(),
      targetProviders: this.providerRegistry.targetProviders(),
    });
    if (plan.isErr()) {
      return plan;
    }
    return ok(plan.value);
  }
}
