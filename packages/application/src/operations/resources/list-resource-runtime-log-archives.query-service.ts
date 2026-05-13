import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ResourceRuntimeLogArchiveListResult,
  type ResourceRuntimeLogArchiveStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourceRuntimeLogArchivesQuery } from "./list-resource-runtime-log-archives.query";

@injectable()
export class ListResourceRuntimeLogArchivesQueryService {
  constructor(
    @inject(tokens.resourceRuntimeLogArchiveStore)
    private readonly archiveStore: ResourceRuntimeLogArchiveStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListResourceRuntimeLogArchivesQuery,
  ): Promise<Result<ResourceRuntimeLogArchiveListResult>> {
    const page = await this.archiveStore.list(toRepositoryContext(context), {
      limit: query.limit,
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
      ...(query.serverId ? { serverId: query.serverId } : {}),
      ...(query.serviceName ? { serviceName: query.serviceName } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    if (page.isErr()) {
      return err(page.error);
    }

    return ok({
      schemaVersion: "resources.runtime-log-archives.list/v1",
      ...page.value,
      generatedAt: this.clock.now(),
    });
  }
}
