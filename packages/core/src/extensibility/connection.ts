import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type OccurredAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import {
  type ConnectionCategoryKey,
  ConnectionCategoryValue,
  type ConnectorDefinitionSnapshot,
  type CredentialGrantKind,
  CredentialGrantKindValue,
} from "./connector-definition";

export type ConnectionOwnerScope =
  | "account"
  | "organization"
  | "project"
  | "environment"
  | "resource"
  | "operator";

export type ConnectionStatus = "pending" | "connected" | "failed" | "revoked";

export type ConnectionCredentialStorage = "none" | "secret-ref" | "provider-app" | "ephemeral";

export interface ConnectionOwnerSnapshot {
  scope: ConnectionOwnerScope;
  id: string;
  tenantId?: string | undefined;
}

export interface ConnectionCredentialGrantSnapshot {
  kind: CredentialGrantKind;
  storage: ConnectionCredentialStorage;
  redacted: true;
  secretRef?: string;
  externalAccountId?: string;
  externalInstallationId?: string;
  expiresAt?: string;
}

export interface ConnectionDiagnosticSnapshot {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
}

export interface ConnectionSnapshot {
  id: string;
  connectorKey: string;
  providerKey: string;
  category: ConnectionCategoryKey;
  owner: ConnectionOwnerSnapshot;
  displayName: string;
  status: ConnectionStatus;
  capabilities: string[];
  credentialGrant: ConnectionCredentialGrantSnapshot;
  diagnostics: ConnectionDiagnosticSnapshot[];
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
}

const ownerScopes: readonly ConnectionOwnerScope[] = [
  "account",
  "organization",
  "project",
  "environment",
  "resource",
  "operator",
] as const;

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

function rejectSecretLikeText(
  value: string | undefined,
  label: string,
): Result<string | undefined> {
  if (!value) {
    return ok(undefined);
  }
  return requiredText(value, label).andThen((normalized) => {
    if (
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(normalized) ||
      /\b(?:password|token|private[_ -]?key)\s*[:=]/i.test(normalized) ||
      /\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{16,})/.test(normalized)
    ) {
      return err(domainError.validation(`${label} must be a reference or id, not secret material`));
    }
    return ok(normalized);
  });
}

const connectionIdBrand: unique symbol = Symbol("ConnectionId");
export class ConnectionId extends IdentifierValue {
  private [connectionIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConnectionId> {
    return requiredText(value, "Connection ID").map((normalized) => new ConnectionId(normalized));
  }

  static rehydrate(value: string): ConnectionId {
    return new ConnectionId(value.trim());
  }
}

export class ConnectionOwnerRef {
  private constructor(private readonly snapshot: ConnectionOwnerSnapshot) {}

  static create(snapshot: ConnectionOwnerSnapshot): Result<ConnectionOwnerRef> {
    if (!ownerScopes.includes(snapshot.scope)) {
      return err(domainError.validation(`Unknown connection owner scope ${snapshot.scope}`));
    }
    return requiredText(snapshot.id, "Connection owner ID").andThen((id) =>
      rejectSecretLikeText(snapshot.tenantId, "Connection owner tenant ID").map(
        (tenantId) =>
          new ConnectionOwnerRef({
            scope: snapshot.scope,
            id,
            ...(tenantId ? { tenantId } : {}),
          }),
      ),
    );
  }

  static rehydrate(snapshot: ConnectionOwnerSnapshot): ConnectionOwnerRef {
    return new ConnectionOwnerRef({
      scope: snapshot.scope,
      id: snapshot.id.trim(),
      ...(snapshot.tenantId?.trim() ? { tenantId: snapshot.tenantId.trim() } : {}),
    });
  }

  sameAs(other: ConnectionOwnerRef): boolean {
    return (
      this.snapshot.scope === other.snapshot.scope &&
      this.snapshot.id === other.snapshot.id &&
      this.snapshot.tenantId === other.snapshot.tenantId
    );
  }

  toJSON(): ConnectionOwnerSnapshot {
    return { ...this.snapshot };
  }
}

export class ConnectionStatusValue extends ScalarValueObject<ConnectionStatus> {
  private constructor(value: ConnectionStatus) {
    super(value);
  }

  static pending(): ConnectionStatusValue {
    return new ConnectionStatusValue("pending");
  }

  static rehydrate(value: ConnectionStatus): ConnectionStatusValue {
    return new ConnectionStatusValue(value);
  }

  establish(): Result<ConnectionStatusValue> {
    if (this.value === "revoked") {
      return err(domainError.invariant("Revoked connections cannot be established again"));
    }
    return ok(new ConnectionStatusValue("connected"));
  }

  fail(): ConnectionStatusValue {
    return new ConnectionStatusValue("failed");
  }

  revoke(): ConnectionStatusValue {
    return new ConnectionStatusValue("revoked");
  }

  isRevoked(): boolean {
    return this.value === "revoked";
  }
}

export class ConnectionCredentialGrant {
  private constructor(private readonly snapshot: ConnectionCredentialGrantSnapshot) {}

  static create(
    snapshot: Omit<ConnectionCredentialGrantSnapshot, "redacted">,
  ): Result<ConnectionCredentialGrant> {
    return CredentialGrantKindValue.create(snapshot.kind)
      .andThen(() => rejectSecretLikeText(snapshot.secretRef, "Connection secret reference"))
      .andThen((secretRef) =>
        rejectSecretLikeText(snapshot.externalAccountId, "Connection external account id").map(
          (externalAccountId) => ({ secretRef, externalAccountId }),
        ),
      )
      .andThen(({ secretRef, externalAccountId }) =>
        rejectSecretLikeText(
          snapshot.externalInstallationId,
          "Connection external installation id",
        ).map((externalInstallationId) => ({
          secretRef,
          externalAccountId,
          externalInstallationId,
        })),
      )
      .map(
        ({ secretRef, externalAccountId, externalInstallationId }) =>
          new ConnectionCredentialGrant({
            kind: snapshot.kind,
            storage: snapshot.storage,
            redacted: true,
            ...(secretRef ? { secretRef } : {}),
            ...(externalAccountId ? { externalAccountId } : {}),
            ...(externalInstallationId ? { externalInstallationId } : {}),
            ...(snapshot.expiresAt ? { expiresAt: snapshot.expiresAt } : {}),
          }),
      );
  }

  static rehydrate(snapshot: ConnectionCredentialGrantSnapshot): ConnectionCredentialGrant {
    return new ConnectionCredentialGrant({ ...snapshot, redacted: true });
  }

  withReadback(
    snapshot: Partial<
      Pick<
        ConnectionCredentialGrantSnapshot,
        "externalAccountId" | "externalInstallationId" | "expiresAt"
      >
    >,
  ): Result<ConnectionCredentialGrant> {
    return ConnectionCredentialGrant.create({
      kind: this.snapshot.kind,
      storage: this.snapshot.storage,
      ...(this.snapshot.secretRef ? { secretRef: this.snapshot.secretRef } : {}),
      ...((snapshot.externalAccountId ?? this.snapshot.externalAccountId)
        ? { externalAccountId: snapshot.externalAccountId ?? this.snapshot.externalAccountId }
        : {}),
      ...((snapshot.externalInstallationId ?? this.snapshot.externalInstallationId)
        ? {
            externalInstallationId:
              snapshot.externalInstallationId ?? this.snapshot.externalInstallationId,
          }
        : {}),
      ...((snapshot.expiresAt ?? this.snapshot.expiresAt)
        ? { expiresAt: snapshot.expiresAt ?? this.snapshot.expiresAt }
        : {}),
    });
  }

  toJSON(): ConnectionCredentialGrantSnapshot {
    return { ...this.snapshot, redacted: true };
  }
}

export interface ConnectionStartInput {
  id: string;
  connector: ConnectorDefinitionSnapshot;
  owner: ConnectionOwnerSnapshot;
  displayName?: string;
  credentialGrant?: Omit<ConnectionCredentialGrantSnapshot, "redacted">;
  createdAt: CreatedAt;
}

export class Connection extends AggregateRoot<
  { id: ConnectionId; snapshot: ConnectionSnapshot },
  ConnectionId
> {
  private constructor(state: { id: ConnectionId; snapshot: ConnectionSnapshot }) {
    super(state);
  }

  static start(input: ConnectionStartInput): Result<Connection> {
    return ConnectionId.create(input.id)
      .andThen((id) =>
        ConnectionOwnerRef.create(input.owner).map((owner) => ({
          id,
          owner,
        })),
      )
      .andThen(({ id, owner }) =>
        ConnectionCategoryValue.create(input.connector.category).map((category) => ({
          id,
          owner,
          category,
        })),
      )
      .andThen(({ id, owner, category }) =>
        ConnectionCredentialGrant.create(
          input.credentialGrant ?? {
            kind: input.connector.grantKinds[0]?.kind ?? "manual-secret-reference",
            storage: "none",
          },
        ).map((credentialGrant) => ({
          id,
          owner,
          category,
          credentialGrant,
        })),
      )
      .andThen(({ id, owner, category, credentialGrant }) =>
        requiredText(input.displayName ?? input.connector.title, "Connection display name").map(
          (displayName) => ({ id, owner, category, credentialGrant, displayName }),
        ),
      )
      .map(({ id, owner, category, credentialGrant, displayName }) => {
        const snapshot: ConnectionSnapshot = {
          id: id.value,
          connectorKey: input.connector.key,
          providerKey: input.connector.providerKey,
          category: category.value,
          owner: owner.toJSON(),
          displayName,
          status: ConnectionStatusValue.pending().value,
          capabilities: input.connector.capabilities
            .filter((capability) => capability.implemented)
            .map((capability) => capability.key),
          credentialGrant: credentialGrant.toJSON(),
          diagnostics: [],
          createdAt: input.createdAt.value,
          updatedAt: input.createdAt.value,
        };
        const connection = new Connection({ id, snapshot });
        connection.recordDomainEvent("connection.started", input.createdAt, {
          connectorKey: snapshot.connectorKey,
          category: snapshot.category,
          ownerScope: snapshot.owner.scope,
        });
        return connection;
      });
  }

  static rehydrate(snapshot: ConnectionSnapshot): Connection {
    return new Connection({ id: ConnectionId.rehydrate(snapshot.id), snapshot: { ...snapshot } });
  }

  owner(): ConnectionOwnerRef {
    return ConnectionOwnerRef.rehydrate(this.state.snapshot.owner);
  }

  connectorKey(): string {
    return this.state.snapshot.connectorKey;
  }

  connect(
    at: OccurredAt,
    readback: Partial<
      Pick<
        ConnectionCredentialGrantSnapshot,
        "externalAccountId" | "externalInstallationId" | "expiresAt"
      >
    > = {},
  ): Result<void> {
    return ConnectionStatusValue.rehydrate(this.state.snapshot.status)
      .establish()
      .andThen((status) =>
        ConnectionCredentialGrant.rehydrate(this.state.snapshot.credentialGrant)
          .withReadback(readback)
          .map((credentialGrant) => ({ status, credentialGrant })),
      )
      .map(({ status, credentialGrant }) => {
        this.state.snapshot = {
          ...this.state.snapshot,
          status: status.value,
          credentialGrant: credentialGrant.toJSON(),
          diagnostics: [],
          updatedAt: at.value,
        };
        this.recordDomainEvent("connection.established", at, {
          connectorKey: this.state.snapshot.connectorKey,
          category: this.state.snapshot.category,
          ownerScope: this.state.snapshot.owner.scope,
        });
        return undefined;
      });
  }

  fail(at: OccurredAt, diagnostic: ConnectionDiagnosticSnapshot): void {
    this.state.snapshot = {
      ...this.state.snapshot,
      status: ConnectionStatusValue.rehydrate(this.state.snapshot.status).fail().value,
      diagnostics: [diagnostic],
      updatedAt: at.value,
    };
    this.recordDomainEvent("connection.failed", at, {
      connectorKey: this.state.snapshot.connectorKey,
      category: this.state.snapshot.category,
      code: diagnostic.code,
    });
  }

  revoke(at: OccurredAt): void {
    this.state.snapshot = {
      ...this.state.snapshot,
      status: ConnectionStatusValue.rehydrate(this.state.snapshot.status).revoke().value,
      updatedAt: at.value,
      revokedAt: at.value,
    };
    this.recordDomainEvent("connection.revoked", at, {
      connectorKey: this.state.snapshot.connectorKey,
      category: this.state.snapshot.category,
      ownerScope: this.state.snapshot.owner.scope,
    });
  }

  toJSON(): ConnectionSnapshot {
    return {
      ...this.state.snapshot,
      owner: { ...this.state.snapshot.owner },
      capabilities: [...this.state.snapshot.capabilities],
      credentialGrant: { ...this.state.snapshot.credentialGrant, redacted: true },
      diagnostics: [...this.state.snapshot.diagnostics],
    };
  }
}
