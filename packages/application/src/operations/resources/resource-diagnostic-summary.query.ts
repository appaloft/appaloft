import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ResourceDiagnosticSummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ResourceDiagnosticSummaryQueryInput,
  resourceDiagnosticSummaryQueryInputSchema,
} from "./resource-diagnostic-summary.schema";

export {
  type ResourceDiagnosticSummaryQueryInput,
  resourceDiagnosticSummaryQueryInputSchema,
} from "./resource-diagnostic-summary.schema";

export class ResourceDiagnosticSummaryQuery extends Query<ResourceDiagnosticSummary> {
  constructor(
    public readonly resourceId: string,
    public readonly includeDeploymentLogTail: boolean,
    public readonly includeRuntimeLogTail: boolean,
    public readonly includeProxyConfiguration: boolean,
    public readonly tailLines: number,
    public readonly deploymentId?: string,
    public readonly locale?: string,
  ) {
    super();
  }

  static create(
    input: ResourceDiagnosticSummaryQueryInput,
  ): Result<ResourceDiagnosticSummaryQuery> {
    return parseOperationInput(resourceDiagnosticSummaryQueryInputSchema, input).map(
      (parsed) =>
        new ResourceDiagnosticSummaryQuery(
          parsed.resourceId,
          parsed.includeDeploymentLogTail,
          parsed.includeRuntimeLogTail,
          parsed.includeProxyConfiguration,
          parsed.tailLines,
          trimToUndefined(parsed.deploymentId),
          trimToUndefined(parsed.locale),
        ),
    );
  }
}
