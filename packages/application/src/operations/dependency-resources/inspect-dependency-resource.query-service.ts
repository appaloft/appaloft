import {
  domainError,
  err,
  ok,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DependencyResourceReadModel,
  type InspectDependencyResourceResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type InspectDependencyResourceQuery } from "./inspect-dependency-resource.query";

function allowedFamilies(kind: InspectDependencyResourceResult["kind"]): string[] {
  switch (kind) {
    case "postgres":
      return ["select", "schema-inspection"];
    case "redis":
      return ["ping", "info", "dbsize", "get", "ttl", "scan"];
    default:
      return [];
  }
}

@injectable()
export class InspectDependencyResourceQueryService {
  constructor(
    @inject(tokens.dependencyResourceReadModel)
    private readonly dependencyResourceReadModel: DependencyResourceReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: InspectDependencyResourceQuery,
  ): Promise<Result<InspectDependencyResourceResult>> {
    const repositoryContext = toRepositoryContext(context);
    const dependencyResourceId = ResourceInstanceId.create(query.dependencyResourceId);
    if (dependencyResourceId.isErr()) {
      return err(dependencyResourceId.error);
    }

    const dependencyResource = await this.dependencyResourceReadModel.findOne(
      repositoryContext,
      ResourceInstanceByIdSpec.create(dependencyResourceId.value),
    );
    if (!dependencyResource) {
      return err(domainError.notFound("dependency_resource", dependencyResourceId.value.value));
    }

    const supportsSafeQuery =
      dependencyResource.lifecycleStatus === "ready" &&
      (dependencyResource.kind === "postgres" || dependencyResource.kind === "redis");

    return ok({
      schemaVersion: "dependency-resources.inspect/v1",
      dependencyResourceId: dependencyResource.id,
      kind: dependencyResource.kind,
      providerKey: dependencyResource.providerKey,
      providerManaged: dependencyResource.providerManaged,
      sourceMode: dependencyResource.sourceMode,
      lifecycleStatus: dependencyResource.lifecycleStatus,
      ...(dependencyResource.connection ? { connection: dependencyResource.connection } : {}),
      ...(dependencyResource.providerRealization
        ? { providerRealization: dependencyResource.providerRealization }
        : {}),
      desiredCapabilities: dependencyResource.desiredCapabilities,
      capabilityReadbacks: dependencyResource.capabilityReadbacks,
      safeQuery: {
        status: supportsSafeQuery ? "not-configured" : "not-supported",
        allowedFamilies: supportsSafeQuery ? allowedFamilies(dependencyResource.kind) : [],
        maxRows: 100,
        timeoutMs: 5_000,
      },
      generatedAt: this.clock.now(),
    });
  }
}
