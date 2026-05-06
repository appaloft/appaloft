import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type PreviewPolicyReadModel, type ShowPreviewPolicyResult } from "../../ports";
import { tokens } from "../../tokens";
import { type ShowPreviewPolicyQueryInput } from "./show-preview-policy.query";

@injectable()
export class ShowPreviewPolicyQueryService {
  constructor(
    @inject(tokens.previewPolicyReadModel)
    private readonly previewPolicyReadModel: PreviewPolicyReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowPreviewPolicyQueryInput,
  ): Promise<Result<ShowPreviewPolicyResult>> {
    const policy = await this.previewPolicyReadModel.findOneSummary(
      toRepositoryContext(context),
      input.scope,
    );

    return ok({
      schemaVersion: "preview-policies.show/v1",
      policy,
      generatedAt: this.clock.now(),
    });
  }
}
