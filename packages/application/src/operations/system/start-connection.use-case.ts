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
import { createExecutionContext, type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type ConnectionStartResult,
  type ConnectorAuthorizationAdapterRegistry,
  type ConnectorAuthorizationAttemptStore,
  type ConnectorConnectionStore,
  type ConnectorRegistry,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  defaultConnectionOwnerForContext,
  ensureConnectionOwnerAllowedForContext,
} from "./connection-tenant-scope";
import { type StartConnectionCommandInput } from "./start-connection.command";

@injectable()
export class StartConnectionUseCase {
  private authorizationAdapterRegistry?: ConnectorAuthorizationAdapterRegistry;
  private authorizationAttemptStore?: ConnectorAuthorizationAttemptStore;

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

  withAuthorizationLifecycle(input: {
    authorizationAdapterRegistry: ConnectorAuthorizationAdapterRegistry;
    authorizationAttemptStore: ConnectorAuthorizationAttemptStore;
  }): this {
    this.authorizationAdapterRegistry = input.authorizationAdapterRegistry;
    this.authorizationAttemptStore = input.authorizationAttemptStore;
    return this;
  }

  async execute(input: StartConnectionCommandInput): Promise<Result<ConnectionStartResult>>;
  async execute(
    context: ExecutionContext,
    input: StartConnectionCommandInput,
  ): Promise<Result<ConnectionStartResult>>;
  async execute(
    contextOrInput: ExecutionContext | StartConnectionCommandInput,
    maybeInput?: StartConnectionCommandInput,
  ): Promise<Result<ConnectionStartResult>> {
    const context = maybeInput ? (contextOrInput as ExecutionContext) : undefined;
    const input = maybeInput ?? (contextOrInput as StartConnectionCommandInput);
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

    const ownerResult = ensureConnectionOwnerAllowedForContext(
      context,
      input.owner ?? defaultConnectionOwnerForContext(context),
    );
    if (ownerResult.isErr()) {
      return err(ownerResult.error);
    }
    const owner = ownerResult.value;
    const existing = (await this.connectionStore.list({ owner, connectorKey: connector.key })).find(
      (connection) => connection.status !== "revoked",
    );
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
    const authAdapter = this.authorizationAdapterRegistry?.findForConnector(connector.key) ?? null;
    if (!shouldConnectImmediately && authAdapter && this.authorizationAttemptStore) {
      const snapshot = connection.toJSON();
      const attempt = {
        id: this.idGenerator.next("conn_auth"),
        connectorKey: connector.key,
        connectionId: snapshot.id,
        owner,
        state: this.idGenerator.next("conn_state"),
        status: "pending" as const,
        ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
        ...(input.requestedCapabilityKey
          ? { requestedCapabilityKey: input.requestedCapabilityKey }
          : {}),
        ...(input.originalHostname ? { originalHostname: input.originalHostname } : {}),
        createdAt: this.clock.now(),
        expiresAt: addSeconds(this.clock.now(), 900),
        diagnostics: [],
      };
      const authorization = await authAdapter.startAuthorization(
        context ?? createExecutionContext({ entrypoint: "system" }),
        {
          connector,
          connection: snapshot,
          attempt,
        },
      );
      if (authorization.isErr()) {
        return err(authorization.error);
      }
      await this.authorizationAttemptStore.save(attempt);
      await this.connectionStore.save(snapshot);
      return ok({
        connection: snapshot,
        authorizationAttemptId: attempt.id,
        ...(authorization.value.authorizationUrl
          ? { authorizationUrl: authorization.value.authorizationUrl }
          : {}),
        nextAction: authorization.value.nextAction,
      });
    }

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
    await this.connectionStore.save(snapshot);
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

function addSeconds(iso: string, seconds: number): string {
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) {
    return iso;
  }
  return new Date(timestamp + seconds * 1000).toISOString();
}
