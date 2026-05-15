import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type RuntimeMonitoringSampleReadModel,
  type RuntimeMonitoringSamplesWindow,
  type RuntimeUsageFreshness,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListRuntimeMonitoringSamplesQuery } from "./list-runtime-monitoring-samples.query";

function withRuntimeMonitoringSamplesDetails(error: DomainError): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "runtime-monitoring.samples.list",
    },
  };
}

function windowFreshness(
  samples: RuntimeMonitoringSamplesWindow["samples"],
): RuntimeUsageFreshness {
  if (samples.length === 0) {
    return "unknown";
  }
  if (samples.some((sample) => sample.freshness === "recent-sample")) {
    return "recent-sample";
  }
  if (samples.some((sample) => sample.freshness === "live")) {
    return "live";
  }
  if (samples.some((sample) => sample.freshness === "stale")) {
    return "stale";
  }
  return "unknown";
}

@injectable()
export class RuntimeMonitoringSamplesQueryService {
  constructor(
    @inject(tokens.runtimeMonitoringSampleReadModel)
    private readonly sampleReadModel: RuntimeMonitoringSampleReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ListRuntimeMonitoringSamplesQuery,
  ): Promise<Result<RuntimeMonitoringSamplesWindow>> {
    const signals = "signals" in query.input ? query.input.signals : undefined;
    const readResult = await this.sampleReadModel.listSamples(context, {
      scope: query.input.scope,
      window: query.input.window,
      limit: query.input.limit,
      ...(signals ? { signals } : {}),
    });

    if (readResult.isErr()) {
      return err(withRuntimeMonitoringSamplesDetails(readResult.error));
    }

    const read = readResult.value;
    const partial =
      read.samples.length === 0 ||
      read.warnings.length > 0 ||
      read.sourceErrors.length > 0 ||
      read.samples.some((sample) => sample.partial);

    return ok({
      schemaVersion: "runtime-monitoring.samples.list/v1",
      scope: query.input.scope,
      from: query.input.window.from,
      to: query.input.window.to,
      generatedAt: this.clock.now(),
      freshness: windowFreshness(read.samples),
      partial,
      retention: read.retention,
      samples: read.samples,
      warnings: read.warnings,
      sourceErrors: read.sourceErrors,
    });
  }
}
