import { type Command as AppCommand, type Query as AppQuery } from "@appaloft/application";
import {
  findOperationCatalogEntryByKey,
  findOperationCatalogEntryByMessageName,
  type OperationCatalogEntry,
} from "@appaloft/application/operation-catalog";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFacadeInput, type AppaloftSdkFetch } from "@appaloft/sdk";
import { Command as EffectCommand } from "@effect/cli";
import { NodeContext } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { mainCommand } from "./commands/index.js";
import {
  type CliControlPlaneOperation,
  findControlPlaneOperation,
  performControlPlaneHandshake,
  requestControlPlaneOperation,
  requestControlPlaneStreamOperation,
} from "./control-plane-client.js";
import { type CliControlPlaneProfile } from "./control-plane-profile.js";
import {
  type CliProgram,
  CliRuntime,
  type CliTerminalIO,
  cliArgvRequestsStdinText,
  printCliError,
  readProcessStdinText,
} from "./runtime.js";

export interface RemoteCliProgramInput {
  readonly version: string;
  readonly profile: CliControlPlaneProfile;
  readonly fetch?: AppaloftSdkFetch;
  readonly now?: () => string;
  readonly terminalIO?: CliTerminalIO;
  readonly readStdinText?: () => Promise<string>;
}

type RemoteOperationMessage = AppCommand<unknown> | AppQuery<unknown>;

const webhookSignatureOnlyOperations = new Set(["source-events.ingest"]);
const remoteFollowOperationKeys = new Set([
  "deployments.timeline.stream",
  "operator-work.stream-events",
]);
const unsupportedRemoteFollowOperationKeys = new Set(["resources.runtime-logs"]);

function remoteOperationError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "remote-operation-dispatch",
      ...(details ?? {}),
    },
  };
}

function infraRemoteOperationError(
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code: "control_plane_operation_missing",
    category: "infra",
    message,
    retryable: false,
    details: {
      phase: "remote-operation-dispatch",
      ...(details ?? {}),
    },
  };
}

function readMessagePayload(message: RemoteOperationMessage): Record<string, unknown> {
  const payload = Object.fromEntries(
    Object.entries(message as Record<string, unknown>).filter(([, value]) => value !== undefined),
  );

  if (isRecord(payload.input)) {
    const { input, ...outer } = payload;
    return { ...input, ...outer };
  }

  if (isRecord(payload.request)) {
    const { request, ...outer } = payload;
    return { ...request, ...outer };
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenQueryValue(
  output: Record<string, string | number | boolean>,
  prefix: string,
  value: unknown,
): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    output[prefix] = value;
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    flattenQueryValue(output, `${prefix}.${key}`, child);
  }
}

function flattenQueryPayload(
  payload: Record<string, unknown>,
  pathKeys: ReadonlySet<string>,
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key === "limit" && value === 100) {
      continue;
    }
    if (!pathKeys.has(key)) {
      flattenQueryValue(query, key, value);
    }
  }

  return query;
}

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] as string);
}

function requestForOperation(input: {
  readonly message: RemoteOperationMessage;
  readonly operation: CliControlPlaneOperation;
}): Result<AppaloftSdkFacadeInput> {
  const payload = readMessagePayload(input.message);
  const pathParams: Record<string, string> = {};
  const pathKeys = new Set(pathParamNames(input.operation.route.path));

  for (const key of pathKeys) {
    const value = payload[key];
    if (typeof value !== "string" || value.length === 0) {
      return err(
        remoteOperationError(
          "validation_error",
          `Remote operation ${input.operation.operationKey} is missing path parameter ${key}`,
          {
            operationKey: input.operation.operationKey,
            pathParam: key,
          },
        ),
      );
    }
    pathParams[key] = value;
  }

  if (input.operation.route.method === "GET") {
    const query = flattenQueryPayload(payload, pathKeys);

    return ok({
      ...(Object.keys(pathParams).length > 0 ? { pathParams } : {}),
      ...(Object.keys(query).length > 0 ? { query } : {}),
    });
  }

  return ok({
    ...(Object.keys(pathParams).length > 0 ? { pathParams } : {}),
    body: payload,
  });
}

function operationForMessage(input: {
  readonly kind: "command" | "query";
  readonly message: RemoteOperationMessage;
  readonly payload: Record<string, unknown>;
}): Result<OperationCatalogEntry> {
  const messageName = input.message.constructor.name;
  const keyedEntry =
    messageName === "TestServerConnectivityCommand" && typeof input.payload.serverId === "string"
      ? findOperationCatalogEntryByKey("servers.test-connectivity")
      : undefined;
  if (keyedEntry && keyedEntry.kind === input.kind) {
    return ok(keyedEntry);
  }

  const entry = findOperationCatalogEntryByMessageName(messageName);
  if (!entry || entry.kind !== input.kind) {
    return err(
      infraRemoteOperationError(`Operation catalog entry for ${messageName} is not available`, {
        messageName,
      }),
    );
  }

  return ok(entry);
}

function assertRemoteCapable(
  operation: CliControlPlaneOperation,
  payload: Record<string, unknown>,
): Result<void> {
  if (operation.streaming) {
    return err(
      remoteOperationError(
        "control_plane_unsupported",
        "Streaming remote CLI operation is not supported by the current remote runtime",
        {
          operationKey: operation.operationKey,
        },
      ),
    );
  }

  if (
    operation.authPolicy === "webhook-signature" ||
    webhookSignatureOnlyOperations.has(operation.operationKey)
  ) {
    return err(
      remoteOperationError(
        "control_plane_unsupported",
        "Webhook-signed operations cannot be dispatched from a logged-in CLI profile",
        {
          operationKey: operation.operationKey,
        },
      ),
    );
  }

  if (unsupportedRemoteFollowOperationKeys.has(operation.operationKey) && payload.follow === true) {
    return err(
      remoteOperationError(
        "control_plane_unsupported",
        "Streaming remote CLI operation is not supported by the current remote runtime",
        {
          operationKey: operation.operationKey,
        },
      ),
    );
  }

  return ok(undefined);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function adaptBoundedStreamResult(operationKey: string, value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (operationKey === "deployments.timeline.stream" && Array.isArray(value.envelopes)) {
    return {
      mode: "bounded",
      deploymentId: readOptionalString(value, "deploymentId") ?? "",
      envelopes: value.envelopes,
    };
  }

  if (operationKey === "operator-work.stream-events" && Array.isArray(value.envelopes)) {
    return {
      mode: "bounded",
      workId: readOptionalString(value, "workId") ?? "",
      envelopes: value.envelopes,
    };
  }

  if (operationKey === "resources.runtime-logs" && Array.isArray(value.logs)) {
    return {
      mode: "bounded",
      resourceId: readOptionalString(value, "resourceId") ?? "",
      ...(readOptionalString(value, "deploymentId")
        ? { deploymentId: readOptionalString(value, "deploymentId") }
        : {}),
      logs: value.logs,
    };
  }

  return value;
}

async function dispatchRemoteFollowMessage<TResult>(input: {
  readonly operation: CliControlPlaneOperation;
  readonly request: AppaloftSdkFacadeInput;
  readonly payload: Record<string, unknown>;
  readonly profile: CliControlPlaneProfile;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<TResult>> {
  const result = await requestControlPlaneStreamOperation({
    profile: input.profile,
    operationKey: input.operation.operationKey,
    ...(input.request.pathParams ? { pathParams: input.request.pathParams } : {}),
    ...(input.request.query ? { query: input.request.query } : {}),
    ...(input.request.body === undefined ? {} : { body: input.request.body }),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    phase: "remote-operation-dispatch",
  });
  if (result.isErr()) {
    return err(result.error);
  }

  if (input.operation.operationKey === "deployments.timeline.stream") {
    return ok({
      mode: "stream",
      deploymentId: readOptionalString(input.request.pathParams ?? {}, "deploymentId") ?? "",
      stream: result.value,
    } as TResult);
  }

  if (input.operation.operationKey === "operator-work.stream-events") {
    return ok({
      mode: "stream",
      workId: readOptionalString(input.request.pathParams ?? {}, "workId") ?? "",
      stream: result.value,
    } as TResult);
  }

  return ok(result.value as TResult);
}

async function dispatchRemoteMessage<TResult>(input: {
  readonly kind: "command" | "query";
  readonly message: RemoteOperationMessage;
  readonly profile: CliControlPlaneProfile;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<TResult>> {
  const payload = readMessagePayload(input.message);
  const catalogEntry = operationForMessage({
    kind: input.kind,
    message: input.message,
    payload,
  });
  if (catalogEntry.isErr()) {
    return err(catalogEntry.error);
  }

  const operation = findControlPlaneOperation(catalogEntry.value.key);
  if (operation.isErr()) {
    return err(operation.error);
  }

  const capable = assertRemoteCapable(operation.value, payload);
  if (capable.isErr()) {
    return err(capable.error);
  }

  const request = requestForOperation({
    message: input.message,
    operation: operation.value,
  });
  if (request.isErr()) {
    return err(request.error);
  }

  if (remoteFollowOperationKeys.has(operation.value.operationKey) && payload.follow === true) {
    return dispatchRemoteFollowMessage<TResult>({
      operation: operation.value,
      request: request.value,
      payload,
      profile: input.profile,
      ...(input.fetch ? { fetch: input.fetch } : {}),
    });
  }

  const result = await requestControlPlaneOperation({
    profile: input.profile,
    operationKey: operation.value.operationKey,
    ...(request.value.pathParams ? { pathParams: request.value.pathParams } : {}),
    ...(request.value.query ? { query: request.value.query } : {}),
    ...(request.value.body === undefined ? {} : { body: request.value.body }),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    phase: "remote-operation-dispatch",
  });

  return result.map(
    (value) => adaptBoundedStreamResult(operation.value.operationKey, value) as TResult,
  );
}

function unsupportedLocalRemoteError(message: string): DomainError {
  return remoteOperationError("control_plane_unsupported", message);
}

export function createRemoteCliProgram(input: RemoteCliProgramInput): CliProgram {
  const sourceStdinReader = input.readStdinText ?? readProcessStdinText;
  let capturedStdinText: Promise<string> | undefined;
  let handshake: Promise<Result<void>> | undefined;
  const ensureHandshake = async (): Promise<Result<void>> => {
    handshake ??= performControlPlaneHandshake({
      baseUrl: input.profile.baseUrl,
      auth: input.profile.auth,
      checkedAt: input.now?.() ?? new Date().toISOString(),
      ...(input.fetch ? { fetch: input.fetch } : {}),
    }).then((result) => result.map(() => undefined));

    return handshake;
  };
  const terminalIO = input.terminalIO ?? {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
  const live = Layer.mergeAll(
    NodeContext.layer,
    Layer.succeed(CliRuntime, {
      version: input.version,
      executionTarget: "remote",
      startServer: async () => {
        throw unsupportedLocalRemoteError("Serving the local Appaloft backend is local-only");
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        const compatible = await ensureHandshake();
        if (compatible.isErr()) {
          return err(compatible.error);
        }

        return dispatchRemoteMessage<T>({
          kind: "command",
          message: message as RemoteOperationMessage,
          profile: input.profile,
          ...(input.fetch ? { fetch: input.fetch } : {}),
        });
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        const compatible = await ensureHandshake();
        if (compatible.isErr()) {
          return err(compatible.error);
        }

        return dispatchRemoteMessage<T>({
          kind: "query",
          message: message as RemoteOperationMessage,
          profile: input.profile,
          ...(input.fetch ? { fetch: input.fetch } : {}),
        });
      },
      terminalIO,
      readStdinText: () => capturedStdinText ?? sourceStdinReader(),
    }),
  );

  return {
    parseAsync: async (argv = process.argv) => {
      capturedStdinText = cliArgvRequestsStdinText(argv) ? sourceStdinReader() : undefined;
      if (capturedStdinText) {
        await capturedStdinText;
      }
      try {
        await EffectCommand.run(mainCommand, {
          name: "appaloft",
          version: input.version,
        })(argv).pipe(
          Effect.provide(live),
          Effect.catchAll((error) =>
            printCliError(error).pipe(Effect.zipRight(Effect.fail(error))),
          ),
          Effect.runPromise,
        );
      } finally {
        capturedStdinText = undefined;
      }
    },
  };
}
