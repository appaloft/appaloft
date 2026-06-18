import {
  type ConnectionSnapshot,
  type ConnectorAuthorizationAttemptSnapshot,
  type ConnectorAuthorizationAttemptStore,
  type ConnectorConnectionStore,
  type ConnectorConnectionStoreListInput,
} from "@appaloft/application";
import { type Kysely, type Selectable } from "kysely";

import {
  type ConnectorAuthorizationAttemptsTable,
  type ConnectorConnectionsTable,
  type Database,
} from "../schema";

type ConnectorConnectionRow = Selectable<ConnectorConnectionsTable>;
type ConnectorAuthorizationAttemptRow = Selectable<ConnectorAuthorizationAttemptsTable>;

export class PgConnectorConnectionStore implements ConnectorConnectionStore {
  constructor(private readonly db: Kysely<Database>) {}

  async list(input: ConnectorConnectionStoreListInput = {}): Promise<ConnectionSnapshot[]> {
    let query = this.db.selectFrom("connector_connections").selectAll();

    if (input.owner) {
      query = query
        .where("owner_scope", "=", input.owner.scope)
        .where("owner_id", "=", input.owner.id);
      if (input.owner.tenantId) {
        query = query.where("owner_tenant_id", "=", input.owner.tenantId);
      }
    }
    if (input.connectorKey) {
      query = query.where("connector_key", "=", input.connectorKey);
    }
    if (input.category) {
      query = query.where("category", "=", input.category);
    }

    const rows = await query.orderBy("updated_at", "desc").execute();
    return rows.map(rowToConnectionSnapshot);
  }

  async findById(connectionId: string): Promise<ConnectionSnapshot | null> {
    const row = await this.db
      .selectFrom("connector_connections")
      .selectAll()
      .where("id", "=", connectionId)
      .executeTakeFirst();
    return row ? rowToConnectionSnapshot(row) : null;
  }

  async save(connection: ConnectionSnapshot): Promise<void> {
    const row = connectionSnapshotToRow(connection);
    await this.db
      .insertInto("connector_connections")
      .values(row)
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          owner_scope: row.owner_scope,
          owner_id: row.owner_id,
          owner_tenant_id: row.owner_tenant_id,
          connector_key: row.connector_key,
          category: row.category,
          status: row.status,
          snapshot: row.snapshot,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
  }
}

export class PgConnectorAuthorizationAttemptStore implements ConnectorAuthorizationAttemptStore {
  constructor(private readonly db: Kysely<Database>) {}

  async save(attempt: ConnectorAuthorizationAttemptSnapshot): Promise<void> {
    const row = authorizationAttemptSnapshotToRow(attempt);
    await this.db
      .insertInto("connector_authorization_attempts")
      .values(row)
      .onConflict((conflict) =>
        conflict.column("id").doUpdateSet({
          state: row.state,
          connection_id: row.connection_id,
          connector_key: row.connector_key,
          owner_scope: row.owner_scope,
          owner_id: row.owner_id,
          owner_tenant_id: row.owner_tenant_id,
          status: row.status,
          expires_at: row.expires_at,
          snapshot: row.snapshot,
          updated_at: new Date().toISOString(),
        }),
      )
      .execute();
  }

  async findById(attemptId: string): Promise<ConnectorAuthorizationAttemptSnapshot | null> {
    const row = await this.db
      .selectFrom("connector_authorization_attempts")
      .selectAll()
      .where("id", "=", attemptId)
      .executeTakeFirst();
    return row ? rowToAuthorizationAttemptSnapshot(row) : null;
  }

  async findByState(state: string): Promise<ConnectorAuthorizationAttemptSnapshot | null> {
    const row = await this.db
      .selectFrom("connector_authorization_attempts")
      .selectAll()
      .where("state", "=", state)
      .executeTakeFirst();
    return row ? rowToAuthorizationAttemptSnapshot(row) : null;
  }
}

function connectionSnapshotToRow(connection: ConnectionSnapshot) {
  const now = new Date().toISOString();
  return {
    id: connection.id,
    owner_scope: connection.owner.scope,
    owner_id: connection.owner.id,
    owner_tenant_id: connection.owner.tenantId ?? null,
    connector_key: connection.connectorKey,
    category: connection.category,
    status: connection.status,
    snapshot: cloneRecord(connection),
    updated_at: now,
  };
}

function authorizationAttemptSnapshotToRow(attempt: ConnectorAuthorizationAttemptSnapshot) {
  const now = new Date().toISOString();
  return {
    id: attempt.id,
    state: attempt.state,
    connection_id: attempt.connectionId,
    connector_key: attempt.connectorKey,
    owner_scope: attempt.owner.scope,
    owner_id: attempt.owner.id,
    owner_tenant_id: attempt.owner.tenantId ?? null,
    status: attempt.status,
    expires_at: attempt.expiresAt,
    snapshot: cloneRecord(attempt),
    updated_at: now,
  };
}

function rowToConnectionSnapshot(row: ConnectorConnectionRow): ConnectionSnapshot {
  return cloneRecord(row.snapshot) as unknown as ConnectionSnapshot;
}

function rowToAuthorizationAttemptSnapshot(
  row: ConnectorAuthorizationAttemptRow,
): ConnectorAuthorizationAttemptSnapshot {
  return cloneRecord(row.snapshot) as unknown as ConnectorAuthorizationAttemptSnapshot;
}

function cloneRecord<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
