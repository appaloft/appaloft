import { domainError, err, ok, ResourceByIdSpec, ResourceId, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import {
  type ResolveGenericSignedSourceEventSecretQueryParsedInput,
  type ResolveGenericSignedSourceEventSecretResponse,
} from "./resolve-generic-signed-source-event-secret.schema";

@injectable()
export class ResolveGenericSignedSourceEventSecretQueryService {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ResolveGenericSignedSourceEventSecretQueryParsedInput,
  ): Promise<Result<ResolveGenericSignedSourceEventSecretResponse>> {
    const resourceId = ResourceId.create(input.resourceId);
    if (resourceId.isErr()) {
      return err(resourceId.error);
    }

    const resource = await this.resourceRepository.findOne(
      toRepositoryContext(context),
      ResourceByIdSpec.create(resourceId.value),
    );
    if (!resource) {
      return err(domainError.notFound("resource", resourceId.value.value));
    }

    const secretValue = resource.genericSignedWebhookSecretValue();
    if (secretValue.isErr()) {
      return err(secretValue.error);
    }

    return ok({ secretValue: secretValue.value });
  }
}
