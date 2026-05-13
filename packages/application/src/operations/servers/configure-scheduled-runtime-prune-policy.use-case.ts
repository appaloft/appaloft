import { ok, type Result, safeTry, UpdatedAt } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureScheduledRuntimePrunePolicyCommandPayload } from "./configure-scheduled-runtime-prune-policy.command";
import {
  type ConfigureScheduledRuntimePrunePolicyResult,
  type ScheduledRuntimePrunePolicyRecord,
  type ScheduledRuntimePrunePolicyRepository,
} from "./scheduled-runtime-prune.service";

@injectable()
export class ConfigureScheduledRuntimePrunePolicyUseCase {
  constructor(
    @inject(tokens.scheduledRuntimePrunePolicyRepository)
    private readonly policyRepository: ScheduledRuntimePrunePolicyRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureScheduledRuntimePrunePolicyCommandPayload,
  ): Promise<Result<ConfigureScheduledRuntimePrunePolicyResult>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, idGenerator, policyRepository } = this;

    return safeTry(async function* () {
      const updatedAt = yield* UpdatedAt.create(clock.now());
      const policyId = input.policyId ?? idGenerator.next("rpp");
      const existing = yield* await policyRepository.findOne(repositoryContext, policyId);
      const record: ScheduledRuntimePrunePolicyRecord = {
        id: policyId,
        version: input.version,
        scope: input.scope,
        serverId: input.serverId,
        retentionDays: input.retentionDays,
        destructive: input.destructive,
        categories: input.categories,
        retryOnFailure: input.retryOnFailure,
        enabled: input.enabled,
        updatedAt: updatedAt.value,
      };
      const persisted = yield* await policyRepository.upsert(repositoryContext, {
        ...record,
        id: existing?.id ?? record.id,
      });

      return ok({ id: persisted.id });
    });
  }
}
