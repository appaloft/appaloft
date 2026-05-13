import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ProcessAttemptRecoveryRecorder,
  type PrunableProcessAttemptStatus,
  prunableProcessAttemptStatuses,
} from "../../ports";
import { tokens } from "../../tokens";
import { type PruneOperatorWorkCommandInput } from "./prune-operator-work.command";

export interface PruneOperatorWorkResult {
  prunedCount: number;
  matchedCount: number;
  dryRun: boolean;
  before: string;
  statuses: PrunableProcessAttemptStatus[];
  countsByStatus: Partial<Record<PrunableProcessAttemptStatus, number>>;
  prunedAt: string;
}

@injectable()
export class PruneOperatorWorkUseCase {
  constructor(
    @inject(tokens.processAttemptRecoveryRecorder)
    private readonly processAttemptRecoveryRecorder: ProcessAttemptRecoveryRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: PruneOperatorWorkCommandInput,
  ): Promise<Result<PruneOperatorWorkResult>> {
    const before = input.before.trim();
    const statuses = input.statuses?.length ? input.statuses : [...prunableProcessAttemptStatuses];
    const dryRun = input.dryRun ?? true;
    const prunedAt = this.clock.now();
    const result = await this.processAttemptRecoveryRecorder.prune(toRepositoryContext(context), {
      before,
      statuses,
      dryRun,
    });

    if (result.isErr()) {
      return err(result.error);
    }

    return ok({
      prunedCount: result.value.prunedCount,
      matchedCount: result.value.matchedCount,
      dryRun,
      before,
      statuses,
      countsByStatus: result.value.countsByStatus,
      prunedAt,
    });
  }
}
