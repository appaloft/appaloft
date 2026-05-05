import {
  DependencyResourceBackupByIdSpec,
  DependencyResourceBackupId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceBackupReadModel,
  type ShowDependencyResourceBackupResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowDependencyResourceBackupQuery } from "./show-dependency-resource-backup.query";

@injectable()
export class ShowDependencyResourceBackupQueryService {
  constructor(
    @inject(tokens.dependencyResourceBackupReadModel)
    private readonly dependencyResourceBackupReadModel: DependencyResourceBackupReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowDependencyResourceBackupQuery,
  ): Promise<Result<ShowDependencyResourceBackupResult>> {
    const backupId = DependencyResourceBackupId.create(query.backupId);
    if (backupId.isErr()) {
      return err(backupId.error);
    }
    const backup = await this.dependencyResourceBackupReadModel.findOne(
      toRepositoryContext(context),
      DependencyResourceBackupByIdSpec.create(backupId.value),
    );
    if (!backup) {
      return err(domainError.notFound("dependency_resource_backup", backupId.value.value));
    }
    return ok({
      schemaVersion: "dependency-resources.backups.show/v1",
      backup,
      generatedAt: this.clock.now(),
    });
  }
}
