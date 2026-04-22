import { type Destination, type Resource, type Server } from "@appaloft/core";
import { type CoordinationScope } from "../../ports";

export function deploymentResourceRuntimeScope(input: {
  resource: Resource;
  server: Server;
  destination: Destination;
}): CoordinationScope {
  return {
    kind: "resource-runtime",
    key: [
      input.resource.toState().id.value,
      input.server.toState().id.value,
      input.destination.toState().id.value,
    ].join(":"),
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
