import { type Destination, type Resource, type Server } from "@appaloft/core";
import { type CoordinationScope } from "../../ports";

export function deploymentResourceRuntimeScope(input: {
  resource: Resource;
  server: Server;
  destination: Destination;
}): CoordinationScope {
  return deploymentResourceRuntimeScopeForIds({
    resourceId: input.resource.toState().id.value,
    serverId: input.server.toState().id.value,
    destinationId: input.destination.toState().id.value,
  });
}

export function deploymentResourceRuntimeScopeForIds(input: {
  resourceId: string;
  serverId: string;
  destinationId: string;
}): CoordinationScope {
  return {
    kind: "resource-runtime",
    key: [input.resourceId, input.serverId, input.destinationId].join(":"),
  };
}

export function previewLifecycleScope(sourceFingerprint: string): CoordinationScope {
  return {
    kind: "preview-lifecycle",
    key: sourceFingerprint,
  };
}

export function sourceLinkScope(sourceFingerprint: string): CoordinationScope {
  return {
    kind: "source-link",
    key: sourceFingerprint,
  };
}
