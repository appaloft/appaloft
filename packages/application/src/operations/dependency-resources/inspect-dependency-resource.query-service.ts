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
  type DependencyResourceSafeQueryPort,
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
    @inject(tokens.dependencyResourceSafeQueryPort, { isOptional: true })
    private readonly safeQueryPort?: DependencyResourceSafeQueryPort,
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
      Boolean(this.safeQueryPort?.supports(dependencyResource));

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
        status: supportsSafeQuery
          ? "supported"
          : this.safeQueryPort
            ? "not-supported"
            : "not-configured",
        allowedFamilies: supportsSafeQuery ? allowedFamilies(dependencyResource.kind) : [],
        maxRows: 100,
        timeoutMs: 5_000,
      },
      generatedAt: this.clock.now(),
    });
  }
}
