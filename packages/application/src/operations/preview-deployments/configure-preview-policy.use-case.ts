import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ConfigurePreviewPolicyResult,
  type IdGenerator,
  type PreviewPolicyRecord,
  type PreviewPolicyRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigurePreviewPolicyCommandPayload } from "./configure-preview-policy.schema";

@injectable()
export class ConfigurePreviewPolicyUseCase {
  constructor(
    @inject(tokens.previewPolicyRepository)
    private readonly previewPolicyRepository: PreviewPolicyRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigurePreviewPolicyCommandPayload,
  ): Promise<Result<ConfigurePreviewPolicyResult>> {
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.previewPolicyRepository.findOne(repositoryContext, input.scope);

    if (input.idempotencyKey && existing?.idempotencyKey === input.idempotencyKey) {
      return ok({ id: existing.id });
    }

    const record: PreviewPolicyRecord = {
      id: existing?.id ?? this.idGenerator.next("pvp"),
      scope: input.scope,
      settings: {
        sameRepositoryPreviews: input.policy.sameRepositoryPreviews ?? true,
        forkPreviews: input.policy.forkPreviews ?? "disabled",
        secretBackedPreviews: input.policy.secretBackedPreviews ?? true,
        ...(input.policy.maxActivePreviews !== undefined
          ? { maxActivePreviews: input.policy.maxActivePreviews }
          : {}),
        ...(input.policy.previewTtlHours !== undefined
          ? { previewTtlHours: input.policy.previewTtlHours }
          : {}),
      },
      updatedAt: this.clock.now(),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    const saved = await this.previewPolicyRepository.upsert(repositoryContext, record);

    return ok({ id: saved.id });
  }
}
