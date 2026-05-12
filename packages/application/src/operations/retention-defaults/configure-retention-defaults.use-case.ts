import { ok, type Result, safeTry, UpdatedAt } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureRetentionDefaultsCommandPayload } from "./configure-retention-defaults.command";
import {
  type ConfigureRetentionDefaultsResult,
  type RetentionDefaultRecord,
  type RetentionDefaultRepository,
} from "./retention-defaults.service";

@injectable()
export class ConfigureRetentionDefaultsUseCase {
  constructor(
    @inject(tokens.retentionDefaultRepository)
    private readonly repository: RetentionDefaultRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureRetentionDefaultsCommandPayload,
  ): Promise<Result<ConfigureRetentionDefaultsResult>> {
    const repositoryContext = toRepositoryContext(context);
    const { repository, clock, idGenerator } = this;

    return safeTry(async function* () {
      const updatedAt = yield* UpdatedAt.create(clock.now());
      const existing = yield* await repository.findOne(repositoryContext, {
        scope: input.scope,
        category: input.category,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      });
      const id = input.policyId ?? existing?.id ?? idGenerator.next("rdf");
      const record: RetentionDefaultRecord = {
        id,
        scope: input.scope,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        category: input.category,
        retentionDays: input.retentionDays,
        dryRunSchedulingEnabled: input.dryRunSchedulingEnabled,
        destructiveSchedulingEnabled: input.destructiveSchedulingEnabled,
        enabled: input.enabled,
        updatedAt: updatedAt.value,
        ...(context.actor?.id ? { updatedByActorId: context.actor.id } : {}),
        ...(context.actor?.kind ? { updatedByActorKind: context.actor.kind } : {}),
      };
      const persisted = yield* await repository.upsert(repositoryContext, record);

      return ok({ id: persisted.id });
    });
  }
}
