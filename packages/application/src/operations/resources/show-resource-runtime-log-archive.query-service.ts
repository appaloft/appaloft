import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type ResourceRuntimeLogArchiveShowResult,
  type ResourceRuntimeLogArchiveStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowResourceRuntimeLogArchiveQuery } from "./show-resource-runtime-log-archive.query";

@injectable()
export class ShowResourceRuntimeLogArchiveQueryService {
  constructor(
    @inject(tokens.resourceRuntimeLogArchiveStore)
    private readonly archiveStore: ResourceRuntimeLogArchiveStore,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowResourceRuntimeLogArchiveQuery,
  ): Promise<Result<ResourceRuntimeLogArchiveShowResult>> {
    const archive = await this.archiveStore.findOne(toRepositoryContext(context), {
      archiveId: query.archiveId,
    });

    if (archive.isErr()) {
      return err(archive.error);
    }

    if (!archive.value) {
      return err(domainError.notFound("resource runtime log archive", query.archiveId));
    }

    return ok({
      schemaVersion: "resources.runtime-log-archives.show/v1",
      archive: archive.value,
    });
  }
}
