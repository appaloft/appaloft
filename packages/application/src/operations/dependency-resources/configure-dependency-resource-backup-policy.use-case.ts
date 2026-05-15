import { ok, type Result, safeTry } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureDependencyResourceBackupPolicyCommandPayload } from "./configure-dependency-resource-backup-policy.command";
import {
  type ConfigureDependencyResourceBackupPolicyResult,
  type DependencyResourceBackupPolicyRecord,
  type DependencyResourceBackupPolicyRepository,
} from "./dependency-resource-backup-policy.types";

@injectable()
export class ConfigureDependencyResourceBackupPolicyUseCase {
  constructor(
    @inject(tokens.dependencyResourceBackupPolicyRepository)
    private readonly policyRepository: DependencyResourceBackupPolicyRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureDependencyResourceBackupPolicyCommandPayload,
  ): Promise<Result<ConfigureDependencyResourceBackupPolicyResult>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, idGenerator, policyRepository } = this;

    return safeTry(async function* () {
      const updatedAt = clock.now();
      const policyId = input.policyId ?? idGenerator.next("dbp");
      const existing = yield* await policyRepository.findOne(repositoryContext, policyId);
      const record: DependencyResourceBackupPolicyRecord = {
        id: existing?.id ?? policyId,
        version: input.version,
        dependencyResourceId: input.dependencyResourceId,
        retentionDays: input.retentionDays,
        scheduleIntervalHours: input.scheduleIntervalHours,
        providerKey: input.providerKey ?? null,
        retryOnFailure: input.retryOnFailure,
        enabled: input.enabled,
        lastRunAt: existing?.lastRunAt ?? null,
        nextRunAt: input.nextRunAt ?? existing?.nextRunAt ?? updatedAt,
        updatedAt,
      };
      const persisted = yield* await policyRepository.upsert(repositoryContext, record);

      return ok({ id: persisted.id });
    });
  }
}
