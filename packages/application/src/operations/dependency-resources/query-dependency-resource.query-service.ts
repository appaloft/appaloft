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
  type DependencyResourceSafeQueryResult,
  type DependencyResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type QueryDependencyResourceQuery } from "./query-dependency-resource.query";

const redisReadOnlyCommands = new Set(["PING", "INFO", "DBSIZE", "GET", "TTL", "SCAN"]);

function firstToken(statement: string): string {
  return statement.trim().split(/\s+/u)[0]?.toUpperCase() ?? "";
}

function validateSafeStatement(
  dependencyResource: DependencyResourceSummary,
  statement: string,
): Result<void> {
  const normalized = statement.trim();
  if (normalized.includes("\0")) {
    return err(domainError.validation("Safe query statement contains invalid characters"));
  }

  switch (dependencyResource.kind) {
    case "postgres": {
      const token = firstToken(normalized);
      const forbidden =
        /\b(insert|update|delete|drop|alter|create|truncate|copy|grant|revoke|call|do|listen|notify|vacuum|analyze|set|reset|begin|commit|rollback|prepare|execute|deallocate|lock|refresh)\b/iu;
      const withoutTrailingSemicolon = normalized.replace(/;\s*$/u, "");
      const containsMultipleStatements = withoutTrailingSemicolon.includes(";");
      const containsSqlComment = /--|\/\*|\*\//u.test(normalized);
      if (
        token !== "SELECT" ||
        forbidden.test(normalized) ||
        containsMultipleStatements ||
        containsSqlComment
      ) {
        return err(
          domainError.validation("Postgres dependency safe query only accepts read-only SELECT"),
        );
      }
      return ok(undefined);
    }
    case "redis": {
      const token = firstToken(normalized);
      if (!redisReadOnlyCommands.has(token)) {
        return err(
          domainError.validation("Redis dependency safe query command is not allowlisted"),
        );
      }
      return ok(undefined);
    }
    default:
      return err(
        domainError.validation("Dependency resource kind does not support safe query", {
          dependencyResourceId: dependencyResource.id,
          kind: dependencyResource.kind,
        }),
      );
  }
}

@injectable()
export class QueryDependencyResourceQueryService {
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
    query: QueryDependencyResourceQuery,
  ): Promise<Result<DependencyResourceSafeQueryResult>> {
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

    if (dependencyResource.lifecycleStatus !== "ready") {
      return err(
        domainError.validation("Dependency resource safe query requires a ready resource", {
          dependencyResourceId: dependencyResource.id,
          lifecycleStatus: dependencyResource.lifecycleStatus,
        }),
      );
    }

    const validation = validateSafeStatement(dependencyResource, query.statement);
    if (validation.isErr()) {
      return err(validation.error);
    }

    if (!this.safeQueryPort) {
      return err(
        domainError.validation("Dependency resource safe query provider is not configured", {
          dependencyResourceId: dependencyResource.id,
          kind: dependencyResource.kind,
          providerKey: dependencyResource.providerKey,
        }),
      );
    }

    if (!this.safeQueryPort.supports(dependencyResource)) {
      return err(
        domainError.providerCapabilityUnsupported(
          "Dependency resource safe query provider does not support this resource",
          {
            dependencyResourceId: dependencyResource.id,
            kind: dependencyResource.kind,
            providerKey: dependencyResource.providerKey,
          },
        ),
      );
    }

    const executed = await this.safeQueryPort.execute(context, {
      dependencyResource,
      statement: query.statement,
      maxRows: query.maxRows,
      timeoutMs: query.timeoutMs,
    });
    if (executed.isErr()) {
      return err(executed.error);
    }

    return ok({
      schemaVersion: "dependency-resources.query/v1",
      ...executed.value,
      executedAt: executed.value.executedAt || this.clock.now(),
    });
  }
}
