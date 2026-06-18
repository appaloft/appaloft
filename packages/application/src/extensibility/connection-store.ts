import { type ConnectionOwnerSnapshot, type ConnectionSnapshot } from "@appaloft/core";

import { type ConnectorConnectionStore, type ConnectorConnectionStoreListInput } from "../ports";

function ownerMatches(
  snapshot: ConnectionSnapshot,
  owner: ConnectionOwnerSnapshot | undefined,
): boolean {
  if (!owner) {
    return true;
  }
  return (
    snapshot.owner.scope === owner.scope &&
    snapshot.owner.id === owner.id &&
    (!owner.tenantId || snapshot.owner.tenantId === owner.tenantId)
  );
}

export class InMemoryConnectorConnectionStore implements ConnectorConnectionStore {
  private readonly byId = new Map<string, ConnectionSnapshot>();

  constructor(seed: readonly ConnectionSnapshot[] = []) {
    for (const connection of seed) {
      this.byId.set(connection.id, cloneConnection(connection));
    }
  }

  list(input: ConnectorConnectionStoreListInput = {}): ConnectionSnapshot[] {
    return [...this.byId.values()]
      .filter((connection) => ownerMatches(connection, input.owner))
      .filter((connection) =>
        input.connectorKey ? connection.connectorKey === input.connectorKey : true,
      )
      .filter((connection) => (input.category ? connection.category === input.category : true))
      .map(cloneConnection);
  }

  findById(connectionId: string): ConnectionSnapshot | null {
    const connection = this.byId.get(connectionId);
    return connection ? cloneConnection(connection) : null;
  }

  save(connection: ConnectionSnapshot): void {
    this.byId.set(connection.id, cloneConnection(connection));
  }
}

function cloneConnection(connection: ConnectionSnapshot): ConnectionSnapshot {
  return {
    ...connection,
    owner: { ...connection.owner },
    capabilities: [...connection.capabilities],
    credentialGrant: { ...connection.credentialGrant, redacted: true },
    providerResources: (connection.providerResources ?? []).map((resource) => ({ ...resource })),
    diagnostics: [...connection.diagnostics],
  };
}
