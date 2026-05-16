import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "../../mutation-coordination";
import {
  type MutationCoordinator,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { sourceLinkScope } from "../deployments/deployment-mutation-scopes";
import {
  type DeleteSourceLinkCommand,
  type DeleteSourceLinkResult,
} from "./delete-source-link.command";

@injectable()
export class DeleteSourceLinkUseCase {
  constructor(
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
    @inject(tokens.mutationCoordinator)
    private readonly mutationCoordinator: MutationCoordinator,
  ) {}

  async execute(
    context: ExecutionContext,
    command: DeleteSourceLinkCommand,
  ): Promise<Result<DeleteSourceLinkResult>> {
    return await this.mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.relinkSourceLink,
      scope: sourceLinkScope(command.sourceFingerprint),
      owner: createCoordinationOwner(context, "source-links.delete"),
      work: async () => {
        const sourceLink = await this.sourceLinkRepository.findOne(
          SourceLinkBySourceFingerprintSpec.create(command.sourceFingerprint),
        );
        if (sourceLink.isErr()) {
          return err(sourceLink.error);
        }
        if (!sourceLink.value) {
          return err(domainError.notFound("Source link", command.sourceFingerprint));
        }

        const deleted = await this.sourceLinkRepository.deleteOne(
          SourceLinkBySourceFingerprintSpec.create(command.sourceFingerprint),
        );
        if (deleted.isErr()) {
          return err(deleted.error);
        }

        return ok({
          sourceFingerprint: command.sourceFingerprint,
          deleted: deleted.value,
        });
      },
    });
  }
}
