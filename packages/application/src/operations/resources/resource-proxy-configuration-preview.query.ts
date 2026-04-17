import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ProxyConfigurationRouteScope, type ProxyConfigurationView } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ResourceProxyConfigurationPreviewQueryInput,
  resourceProxyConfigurationPreviewQueryInputSchema,
} from "./resource-proxy-configuration-preview.schema";

export {
  type ResourceProxyConfigurationPreviewQueryInput,
  resourceProxyConfigurationPreviewQueryInputSchema,
} from "./resource-proxy-configuration-preview.schema";

export class ResourceProxyConfigurationPreviewQuery extends Query<ProxyConfigurationView> {
  constructor(
    public readonly resourceId: string,
    public readonly routeScope: ProxyConfigurationRouteScope,
    public readonly includeDiagnostics: boolean,
    public readonly deploymentId?: string,
  ) {
    super();
  }

  static create(
    input: ResourceProxyConfigurationPreviewQueryInput,
  ): Result<ResourceProxyConfigurationPreviewQuery> {
    return parseOperationInput(resourceProxyConfigurationPreviewQueryInputSchema, input).map(
      (parsed) =>
        new ResourceProxyConfigurationPreviewQuery(
          parsed.resourceId,
          parsed.routeScope,
          parsed.includeDiagnostics,
          trimToUndefined(parsed.deploymentId),
        ),
    );
  }
}
