import {
  Connection,
  CreatedAt,
  domainError,
  err,
  OccurredAt,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type Clock,
  type ConnectionStartResult,
  type ConnectorConnectionStore,
  type ConnectorRegistry,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { type StartConnectionCommandInput } from "./start-connection.command";

@injectable()
export class StartConnectionUseCase {
  constructor(
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry,
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: StartConnectionCommandInput): Promise<Result<ConnectionStartResult>> {
    const connector = this.connectorRegistry.findByKey(input.connectorKey);
    if (!connector) {
      return err(domainError.notFound("Connector", input.connectorKey));
    }
    const availability = connector.availability.status;
    if (availability === "unavailable" || availability === "deferred") {
      return err(
        domainError.conflict(`Connector ${input.connectorKey} is not currently available`, {
          status: availability,
        }),
      );
    }

    const owner = input.owner ?? { scope: "operator" as const, id: "local" };
    const existing = this.connectionStore
      .list({ owner, connectorKey: connector.key })
      .find((connection) => connection.status !== "revoked");
    if (existing?.status === "connected") {
      return ok({ connection: existing, nextAction: "already-connected" });
    }

    const credentialGrant =
      input.credentialGrant ??
      (connector.grantKinds[0]
        ? {
            kind: connector.grantKinds[0].kind,
            storage:
              connector.grantKinds[0].kind === "provider-app-installation"
                ? "provider-app"
                : "none",
          }
        : { kind: "manual-secret-reference" as const, storage: "none" as const });
    const started = Connection.start({
      id: this.idGenerator.next("conn"),
      connector,
      owner,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      credentialGrant: compactCredentialGrant(credentialGrant),
      createdAt: CreatedAt.rehydrate(this.clock.now()),
    });
    if (started.isErr()) {
      return err(started.error);
    }

    const connection = started.value;
    const shouldConnectImmediately =
      credentialGrant.storage === "secret-ref" || credentialGrant.storage === "provider-app";
    if (shouldConnectImmediately) {
      const connected = connection.connect(OccurredAt.rehydrate(this.clock.now()), {
        ...(credentialGrant.externalAccountId
          ? { externalAccountId: credentialGrant.externalAccountId }
          : {}),
        ...(credentialGrant.externalInstallationId
          ? { externalInstallationId: credentialGrant.externalInstallationId }
          : {}),
        ...(credentialGrant.expiresAt ? { expiresAt: credentialGrant.expiresAt } : {}),
      });
      if (connected.isErr()) {
        return err(connected.error);
      }
    }

    const snapshot = connection.toJSON();
    this.connectionStore.save(snapshot);
    return ok({
      connection: snapshot,
      ...(connector.setup?.connectHref ? { authorizationUrl: connector.setup.connectHref } : {}),
      nextAction: shouldConnectImmediately
        ? "ready"
        : connector.setup?.connectHref
          ? "authorize-in-browser"
          : "manual-secret-required",
    });
  }
}

function compactCredentialGrant(
  credentialGrant: NonNullable<StartConnectionCommandInput["credentialGrant"]>,
) {
  return {
    kind: credentialGrant.kind,
    storage: credentialGrant.storage,
    ...(credentialGrant.secretRef ? { secretRef: credentialGrant.secretRef } : {}),
    ...(credentialGrant.externalAccountId
      ? { externalAccountId: credentialGrant.externalAccountId }
      : {}),
    ...(credentialGrant.externalInstallationId
      ? { externalInstallationId: credentialGrant.externalInstallationId }
      : {}),
    ...(credentialGrant.expiresAt ? { expiresAt: credentialGrant.expiresAt } : {}),
  };
}
