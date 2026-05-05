import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceBackupReadModel,
  type ListDependencyResourceBackupsResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListDependencyResourceBackupsQuery } from "./list-dependency-resource-backups.query";

@injectable()
export class ListDependencyResourceBackupsQueryService {
  constructor(
    @inject(tokens.dependencyResourceBackupReadModel)
    private readonly dependencyResourceBackupReadModel: DependencyResourceBackupReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListDependencyResourceBackupsQuery,
  ): Promise<Result<ListDependencyResourceBackupsResult>> {
    const items = await this.dependencyResourceBackupReadModel.list(toRepositoryContext(context), {
      dependencyResourceId: query.dependencyResourceId,
      ...(query.status ? { status: query.status } : {}),
    });

    return ok({
      schemaVersion: "dependency-resources.backups.list/v1",
      items,
      generatedAt: this.clock.now(),
    });
  }
}
