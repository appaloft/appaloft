import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import {
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkReadModel,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListSourceLinksQuery, type ListSourceLinksResult } from "./list-source-links.query";
import { type ShowSourceLinkQuery, type ShowSourceLinkResult } from "./show-source-link.query";

function sourceLinkNotFound(sourceFingerprint: string) {
  return domainError.notFound("Source link", sourceFingerprint);
}

type ContextAwareFindOne = (
  context: RepositoryContext,
  spec: SourceLinkSelectionSpec,
) => Promise<Result<ShowSourceLinkResult["sourceLink"] | null>>;

@injectable()
export class SourceLinkQueryService {
  constructor(
    @inject(tokens.sourceLinkReadModel)
    private readonly sourceLinkReadModel: SourceLinkReadModel,
    @inject(tokens.sourceLinkRepository)
    private readonly sourceLinkRepository: SourceLinkRepository,
  ) {}

  async list(
    context: ExecutionContext,
    query: ListSourceLinksQuery,
  ): Promise<Result<ListSourceLinksResult>> {
    const items = await this.sourceLinkReadModel.list(toRepositoryContext(context), {
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      limit: query.limit,
    });

    return ok({
      schemaVersion: "source-links.list/v1",
      items,
    });
  }

  async show(
    context: ExecutionContext,
    query: ShowSourceLinkQuery,
  ): Promise<Result<ShowSourceLinkResult>> {
    const spec = SourceLinkBySourceFingerprintSpec.create(query.sourceFingerprint);
    const findOne = this.sourceLinkRepository.findOne.bind(this.sourceLinkRepository);
    const sourceLink =
      findOne.length >= 2
        ? await (findOne as unknown as ContextAwareFindOne)(toRepositoryContext(context), spec)
        : await findOne(spec);

    if (sourceLink.isErr()) {
      return err(sourceLink.error);
    }

    if (!sourceLink.value) {
      return err(sourceLinkNotFound(query.sourceFingerprint));
    }

    return ok({
      schemaVersion: "source-links.show/v1",
      sourceLink: sourceLink.value,
    });
  }
}
