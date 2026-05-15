import { type ResourceInstanceState } from "@appaloft/core";

import { type DependencyResourceProviderConnectionContext } from "../../ports";

export function dependencyResourceProviderResourceHandle(
  state: ResourceInstanceState,
): string | undefined {
  return state.providerRealization?.providerResourceHandle?.value;
}

export function dependencyResourceProviderConnectionContext(
  state: ResourceInstanceState,
): DependencyResourceProviderConnectionContext | undefined {
  const endpoint = state.kind.value === "redis" ? state.redisEndpoint : state.postgresEndpoint;
  const connection: DependencyResourceProviderConnectionContext = {};

  if (endpoint) {
    connection.host = endpoint.host.value;
    if (endpoint.port) {
      connection.port = endpoint.port.value;
    }
    if (endpoint.databaseName) {
      connection.databaseName = endpoint.databaseName.value;
    }
    connection.maskedConnection = endpoint.maskedConnection.value;
  }

  if (state.connectionSecretRef) {
    connection.secretRef = state.connectionSecretRef.value;
  }

  return Object.keys(connection).length > 0 ? connection : undefined;
}
