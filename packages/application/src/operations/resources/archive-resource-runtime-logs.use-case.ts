import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DeploymentReadModel,
  type IdGenerator,
  type ResourceRuntimeLogArchiveResult,
  type ResourceRuntimeLogArchiveStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ArchiveResourceRuntimeLogsCommand } from "./archive-resource-runtime-logs.command";
import { ResourceRuntimeLogsQuery } from "./resource-runtime-logs.query";
import { type ResourceRuntimeLogsQueryService } from "./resource-runtime-logs.query-service";

@injectable()
export class ArchiveResourceRuntimeLogsUseCase {
  constructor(
    @inject(tokens.resourceRuntimeLogsQueryService)
    private readonly runtimeLogsQueryService: ResourceRuntimeLogsQueryService,
    @inject(tokens.resourceRuntimeLogArchiveStore)
    private readonly archiveStore: ResourceRuntimeLogArchiveStore,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: ArchiveResourceRuntimeLogsCommand,
  ): Promise<Result<ResourceRuntimeLogArchiveResult>> {
    const query = ResourceRuntimeLogsQuery.create({
      resourceId: command.resourceId,
      tailLines: command.tailLines,
      follow: false,
      ...(command.deploymentId ? { deploymentId: command.deploymentId } : {}),
      ...(command.serviceName ? { serviceName: command.serviceName } : {}),
      ...(command.since ? { since: command.since } : {}),
      ...(command.cursor ? { cursor: command.cursor } : {}),
    });

    if (query.isErr()) {
      return err(query.error);
    }

    const logsResult = await this.runtimeLogsQueryService.execute(context, query.value);

    if (logsResult.isErr()) {
      return err(logsResult.error);
    }

    const logs = logsResult.value;

    if (logs.mode !== "bounded") {
      return err(
        domainError.infra("Runtime log archive requires bounded runtime log output", {
          commandName: "resources.runtime-logs.archive",
          phase: "runtime-log-archive-capture",
          resourceId: command.resourceId,
        }),
      );
    }

    const deployment = logs.deploymentId
      ? (
          await this.deploymentReadModel.list(toRepositoryContext(context), {
            resourceId: logs.resourceId,
          })
        ).find((candidate) => candidate.id === logs.deploymentId)
      : undefined;
    const serviceName =
      command.serviceName ?? logs.logs.find((line) => line.serviceName)?.serviceName;
    const runtimeKind = deployment?.runtimePlan.execution.kind ?? logs.logs[0]?.runtimeKind;
    const stored = await this.archiveStore.create(toRepositoryContext(context), {
      archiveId: this.idGenerator.next("rla"),
      resourceId: logs.resourceId,
      ...(logs.deploymentId ? { deploymentId: logs.deploymentId } : {}),
      ...(deployment?.serverId ? { serverId: deployment.serverId } : {}),
      ...(serviceName ? { serviceName } : {}),
      ...(runtimeKind ? { runtimeKind } : {}),
      capturedAt: this.clock.now(),
      ...(command.reason ? { reason: command.reason } : {}),
      lines: logs.logs,
    });

    if (stored.isErr()) {
      return err(stored.error);
    }

    return ok({
      schemaVersion: "resources.runtime-logs.archive/v1",
      archive: stored.value,
    });
  }
}
