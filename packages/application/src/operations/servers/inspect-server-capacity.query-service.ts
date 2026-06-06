import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type RuntimeTargetCapacityInspection,
  type RuntimeTargetCapacityInspector,
  type ServerRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type InspectServerCapacityQuery } from "./inspect-server-capacity.query";

const defaultBoundedCapacityInspectTimeoutMs = 10_000;

function withInspectServerCapacityDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "servers.capacity.inspect",
      ...details,
    },
  };
}

function createTimeout(ms: number): {
  cancel(): void;
  promise: Promise<"timeout">;
} {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return {
    promise: new Promise<"timeout">((resolve) => {
      timeout = setTimeout(() => resolve("timeout"), ms);
    }),
    cancel() {
      if (!timeout) {
        return;
      }

      clearTimeout(timeout);
      timeout = undefined;
    },
  };
}

function createCapacityInspectTimeoutError(input: {
  providerKey: string;
  serverId: string;
  targetKind: string;
  timeoutMs: number;
}): DomainError {
  return domainError.timeout("Server capacity inspection timed out", {
    queryName: "servers.capacity.inspect",
    phase: "runtime-target-capacity",
    step: "inspect-timeout",
    serverId: input.serverId,
    providerKey: input.providerKey,
    targetKind: input.targetKind,
    timeoutMs: input.timeoutMs,
  });
}

@injectable()
export class InspectServerCapacityQueryService {
  private boundedInspectTimeoutMs = defaultBoundedCapacityInspectTimeoutMs;

  constructor(
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.runtimeTargetCapacityInspector)
    private readonly capacityInspector: RuntimeTargetCapacityInspector,
  ) {}

  async execute(
    context: ExecutionContext,
    query: InspectServerCapacityQuery,
  ): Promise<Result<RuntimeTargetCapacityInspection>> {
    const serverIdResult = DeploymentTargetId.create(query.serverId);
    if (serverIdResult.isErr()) {
      return err(
        withInspectServerCapacityDetails(serverIdResult.error, {
          phase: "query-validation",
          serverId: query.serverId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    let server: Awaited<ReturnType<ServerRepository["findOne"]>>;

    try {
      server = await this.serverRepository.findOne(
        repositoryContext,
        DeploymentTargetByIdSpec.create(serverIdResult.value),
      );
    } catch (error) {
      return err(
        domainError.infra("Server capacity inspection could not be assembled", {
          queryName: "servers.capacity.inspect",
          phase: "server-read",
          serverId: query.serverId,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }

    if (!server) {
      return err(
        withInspectServerCapacityDetails(domainError.notFound("server", query.serverId), {
          phase: "server-read",
          serverId: query.serverId,
        }),
      );
    }

    const serverState = server.toState();
    const inspectPromise = this.capacityInspector.inspect(context, {
      server: serverState,
    });
    const inspectTimeout = createTimeout(this.boundedInspectTimeoutMs);
    let resultOrTimeout: Result<RuntimeTargetCapacityInspection> | "timeout";

    try {
      resultOrTimeout = await Promise.race([inspectPromise, inspectTimeout.promise]);
    } catch (error) {
      return err(
        domainError.infra("Server capacity inspection failed", {
          queryName: "servers.capacity.inspect",
          phase: "runtime-target-capacity",
          serverId: query.serverId,
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    } finally {
      inspectTimeout.cancel();
    }

    if (resultOrTimeout === "timeout") {
      void inspectPromise.catch(() => undefined);
      return err(
        createCapacityInspectTimeoutError({
          providerKey: serverState.providerKey.value,
          serverId: serverState.id.value,
          targetKind: serverState.targetKind.value,
          timeoutMs: this.boundedInspectTimeoutMs,
        }),
      );
    }

    return resultOrTimeout;
  }
}
