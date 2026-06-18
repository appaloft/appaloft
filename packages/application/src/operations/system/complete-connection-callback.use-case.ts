import { Connection, domainError, err, OccurredAt, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { createExecutionContext, type ExecutionContext } from "../../execution-context";
import {
  type Clock,
  type ConnectionCallbackResult,
  type ConnectorAuthorizationAdapterRegistry,
  type ConnectorAuthorizationAttemptStore,
  type ConnectorConnectionStore,
} from "../../ports";
import { tokens } from "../../tokens";
import { type CompleteConnectionCallbackCommandInput } from "./complete-connection-callback.command";
import { connectionBelongsToContext } from "./connection-tenant-scope";

@injectable()
export class CompleteConnectionCallbackUseCase {
  private authorizationAdapterRegistry?: ConnectorAuthorizationAdapterRegistry;
  private authorizationAttemptStore?: ConnectorAuthorizationAttemptStore;

  constructor(
    @inject(tokens.connectorConnectionStore)
    private readonly connectionStore: ConnectorConnectionStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  withAuthorizationLifecycle(input: {
    authorizationAdapterRegistry: ConnectorAuthorizationAdapterRegistry;
    authorizationAttemptStore: ConnectorAuthorizationAttemptStore;
  }): this {
    this.authorizationAdapterRegistry = input.authorizationAdapterRegistry;
    this.authorizationAttemptStore = input.authorizationAttemptStore;
    return this;
  }

  async execute(
    input: CompleteConnectionCallbackCommandInput,
  ): Promise<Result<ConnectionCallbackResult>>;
  async execute(
    context: ExecutionContext,
    input: CompleteConnectionCallbackCommandInput,
  ): Promise<Result<ConnectionCallbackResult>>;
  async execute(
    contextOrInput: ExecutionContext | CompleteConnectionCallbackCommandInput,
    maybeInput?: CompleteConnectionCallbackCommandInput,
  ): Promise<Result<ConnectionCallbackResult>> {
    const context = maybeInput ? (contextOrInput as ExecutionContext) : undefined;
    const input = maybeInput ?? (contextOrInput as CompleteConnectionCallbackCommandInput);
    const snapshot = await this.connectionStore.findById(input.connectionId);
    if (!snapshot || !connectionBelongsToContext(context, snapshot)) {
      return err(domainError.notFound("Connection", input.connectionId));
    }
    const connection = Connection.rehydrate(snapshot);
    const occurredAt = OccurredAt.rehydrate(this.clock.now());
    if (input.status === "success") {
      const authorization = await this.completeAuthorizationAttempt(context, snapshot, input);
      if (authorization?.isErr()) {
        return err(authorization.error);
      }
      const authorizationReadback = authorization?._unsafeUnwrap();
      const connected = connection.connect(occurredAt, {
        ...(authorizationReadback?.credentialGrant.storage
          ? { storage: authorizationReadback.credentialGrant.storage }
          : {}),
        ...(authorizationReadback?.credentialGrant.secretRef
          ? { secretRef: authorizationReadback.credentialGrant.secretRef }
          : input.secretRef
            ? { secretRef: input.secretRef }
            : {}),
        ...(input.externalAccountId ? { externalAccountId: input.externalAccountId } : {}),
        ...(authorizationReadback?.externalAccountId
          ? { externalAccountId: authorizationReadback.externalAccountId }
          : {}),
        ...(input.externalInstallationId
          ? { externalInstallationId: input.externalInstallationId }
          : {}),
        ...(authorizationReadback?.externalInstallationId
          ? { externalInstallationId: authorizationReadback.externalInstallationId }
          : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(authorizationReadback?.expiresAt ? { expiresAt: authorizationReadback.expiresAt } : {}),
        ...(authorizationReadback?.providerResources
          ? { providerResources: authorizationReadback.providerResources }
          : {}),
      });
      if (connected.isErr()) {
        return err(connected.error);
      }
    } else {
      connection.fail(occurredAt, {
        code: input.errorCode ?? `connection.callback.${input.status}`,
        severity: input.status === "cancel" ? "warning" : "error",
        message:
          input.errorMessage ??
          (input.status === "cancel"
            ? "Connection authorization was cancelled."
            : "Connection authorization failed."),
      });
      await this.failAuthorizationAttempt(snapshot, input);
    }
    const connectionSnapshot = connection.toJSON();
    await this.connectionStore.save(connectionSnapshot);
    return ok({ connection: connectionSnapshot });
  }

  private async failAuthorizationAttempt(
    connectionSnapshot: ReturnType<Connection["toJSON"]>,
    input: CompleteConnectionCallbackCommandInput,
  ): Promise<void> {
    if (!input.authorizationAttemptId || !this.authorizationAttemptStore) {
      return;
    }
    const attempt = await this.authorizationAttemptStore.findById(input.authorizationAttemptId);
    if (
      !attempt ||
      attempt.connectionId !== connectionSnapshot.id ||
      attempt.connectorKey !== connectionSnapshot.connectorKey ||
      attempt.status !== "pending"
    ) {
      return;
    }
    await this.authorizationAttemptStore.save({
      ...attempt,
      status: "failed",
      diagnostics: [
        ...attempt.diagnostics,
        {
          code: input.errorCode ?? `connection.callback.${input.status}`,
          severity: input.status === "cancel" ? "warning" : "error",
          message:
            input.errorMessage ??
            (input.status === "cancel"
              ? "Connection authorization was cancelled."
              : "Connection authorization failed."),
        },
      ],
    });
  }

  private async completeAuthorizationAttempt(
    context: ExecutionContext | undefined,
    connectionSnapshot: ReturnType<Connection["toJSON"]>,
    input: CompleteConnectionCallbackCommandInput,
  ) {
    if (!input.authorizationAttemptId) {
      return null;
    }
    if (!this.authorizationAdapterRegistry || !this.authorizationAttemptStore) {
      return err(domainError.conflict("Connection authorization lifecycle is not configured"));
    }
    const attempt = await this.authorizationAttemptStore.findById(input.authorizationAttemptId);
    if (
      !attempt ||
      attempt.connectionId !== connectionSnapshot.id ||
      attempt.connectorKey !== connectionSnapshot.connectorKey
    ) {
      return err(
        domainError.notFound("ConnectionAuthorizationAttempt", input.authorizationAttemptId),
      );
    }
    if (attempt.status !== "pending") {
      return err(
        domainError.conflict("Connection authorization attempt is no longer pending", {
          status: attempt.status,
        }),
      );
    }
    const now = this.clock.now();
    if (Date.parse(attempt.expiresAt) <= Date.parse(now)) {
      await this.authorizationAttemptStore.save({
        ...attempt,
        status: "expired",
        diagnostics: [
          {
            code: "connection.authorization.expired",
            severity: "warning",
            message: "Connection authorization attempt expired.",
          },
        ],
      });
      return err(domainError.conflict("Connection authorization attempt expired"));
    }
    const connector = {
      key: connectionSnapshot.connectorKey,
      title: connectionSnapshot.displayName,
      category: connectionSnapshot.category,
      providerKey: connectionSnapshot.providerKey,
      capabilities: connectionSnapshot.capabilities.map((capability) => ({
        key: capability,
        title: capability,
        implemented: true,
      })),
      grantKinds: [
        {
          kind: connectionSnapshot.credentialGrant.kind,
          title: connectionSnapshot.credentialGrant.kind,
          storesLongLivedSecret: connectionSnapshot.credentialGrant.storage === "secret-ref",
        },
      ],
      availability: {
        status: "available" as const,
        diagnostics: [],
      },
      visibility: "catalog" as const,
    };
    const adapter = this.authorizationAdapterRegistry.findForConnector(
      connectionSnapshot.connectorKey,
    );
    if (!adapter) {
      return err(
        domainError.conflict("Connection authorization adapter is not configured", {
          connectorKey: connectionSnapshot.connectorKey,
        }),
      );
    }
    const completed = await adapter.completeAuthorization(
      context ?? createExecutionContext({ entrypoint: "system" }),
      {
        connector,
        connection: connectionSnapshot,
        attempt,
        ...(input.callbackParameters ? { callbackParameters: input.callbackParameters } : {}),
      },
    );
    if (completed.isOk()) {
      await this.authorizationAttemptStore.save({
        ...attempt,
        status: "completed",
        completedAt: now,
      });
    }
    return completed;
  }
}
