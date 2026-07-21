import {
  findOperationCatalogEntryByKey,
  type OperationCatalogEntry,
} from "@appaloft/application/operation-catalog";
import {
  type DomainError,
  type DomainErrorDetails,
  type DomainErrorDetailValue,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import {
  type AppaloftSdkFacadeInput,
  type AppaloftSdkFacadeMethod,
  type AppaloftSdkFetch,
  type AppaloftSdkOperationResult,
  createAppaloftClient,
} from "@appaloft/sdk";
import {
  type CliControlPlaneAuth,
  type CliControlPlaneHandshake,
  type CliControlPlaneOrganizationContext,
  type CliControlPlaneProfile,
} from "./control-plane-profile.js";

const cliUserAgent = "appaloft-cli";
const webhookSignatureOnlyOperationKeys = new Set(["source-events.ingest"]);
const transientGatewayStatuses = new Set([502, 503, 504]);

export type CliRemoteProjectOperationKey = "projects.list" | "projects.show";

export interface CliControlPlaneOperation {
  readonly operationKey: string;
  readonly kind: OperationCatalogEntry["kind"];
  readonly route: {
    readonly method: "GET" | "POST" | "DELETE";
    readonly path: string;
  };
  readonly authPolicy: "product-session" | "webhook-signature";
  readonly streaming: boolean;
}

export interface CliControlPlaneHandshakeResult {
  readonly handshake: CliControlPlaneHandshake;
  readonly currentOrganization?: CliControlPlaneOrganizationContext;
}

export type CliAuthSessionStatus = "pending" | "authorized" | "denied" | "expired";

export interface CliAuthSession {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete: string;
  readonly expiresIn: number;
  readonly interval: number;
}

export interface CliAuthSessionPollResult {
  readonly status: CliAuthSessionStatus;
  readonly interval?: number;
}

export interface CliAuthSessionExchangeResult {
  readonly auth: CliControlPlaneAuth;
}

export type CliAuthSessionRequestedCredential = "product-session" | "bearer";

type JsonApiReadError = {
  readonly code: string;
  readonly category: DomainError["category"];
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, DomainErrorDetailValue>>;
};

function cliControlPlaneError(
  code: string,
  category: DomainError["category"],
  message: string,
  retryable: boolean,
  details?: DomainErrorDetails,
): DomainError {
  return {
    code,
    category,
    message,
    retryable,
    ...(details ? { details } : {}),
  };
}

function detailValue(value: unknown): DomainErrorDetailValue | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
    return value;
  }
  return undefined;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorFromSdkResult(
  result: Extract<AppaloftSdkOperationResult<unknown>, { ok: false }>,
  phase: string,
): DomainError {
  const details: DomainErrorDetails = {
    phase,
    status: result.status,
  };

  for (const [key, value] of Object.entries(result.error.details ?? {})) {
    const safeValue = detailValue(value);
    if (safeValue !== undefined) {
      details[key] = safeValue;
    }
  }

  return cliControlPlaneError(
    result.error.code,
    result.error.category,
    result.error.message,
    result.error.retryable,
    details,
  );
}

function errorFromJsonApiResponse(error: JsonApiReadError, phase: string): DomainError {
  const details: DomainErrorDetails = {
    phase,
  };

  for (const [key, value] of Object.entries(error.details ?? {})) {
    const safeValue = detailValue(value);
    if (safeValue !== undefined) {
      details[key] = safeValue;
    }
  }

  return cliControlPlaneError(error.code, error.category, error.message, error.retryable, details);
}

function errorFromUnknown(error: unknown, phase: string): DomainError {
  return cliControlPlaneError(
    "control_plane_unavailable",
    "infra",
    "Control plane request failed",
    true,
    {
      phase,
      message: error instanceof Error ? error.message : String(error),
    },
  );
}

export async function defaultControlPlaneFetch(request: Request): Promise<Response> {
  return fetch(request);
}

function authForProfile(auth: CliControlPlaneAuth) {
  if (auth.kind === "product-session") {
    return {
      kind: "product-session" as const,
      cookie: auth.cookie,
    };
  }

  return {
    kind: "deploy-token" as const,
    token: auth.token,
  };
}

export function findControlPlaneOperation(operationKey: string): Result<CliControlPlaneOperation> {
  const entry = findOperationCatalogEntryByKey(operationKey);
  const route = entry ? defaultRemoteRoute(entry) : undefined;

  const operation =
    entry && route
      ? ({
          operationKey: entry.key,
          kind: entry.kind,
          route,
          authPolicy: webhookSignatureOnlyOperationKeys.has(entry.key)
            ? "webhook-signature"
            : "product-session",
          streaming: route === entry.transports.orpcStream,
        } satisfies CliControlPlaneOperation)
      : undefined;

  if (!operation) {
    return err(
      cliControlPlaneError(
        "control_plane_operation_missing",
        "infra",
        `SDK operation ${operationKey} is not available`,
        false,
        {
          phase: "remote-operation-dispatch",
          operationKey,
        },
      ),
    );
  }
  return ok(operation);
}

function defaultRemoteRoute(
  entry: OperationCatalogEntry,
): CliControlPlaneOperation["route"] | undefined {
  const route = entry.transports.orpc ?? entry.transports.orpcStream;

  if (!route) {
    return undefined;
  }

  return {
    method: route.method,
    path: route.path.replace(/^\/api(?=\/)/, ""),
  };
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOrganizationContext(value: unknown): CliControlPlaneOrganizationContext | undefined {
  const record = readJsonObject(value);
  const currentOrganization = readJsonObject(record?.currentOrganization);
  const organizationId = currentOrganization
    ? readOptionalString(currentOrganization, "organizationId")
    : undefined;

  if (!currentOrganization || !organizationId) {
    return undefined;
  }

  const name = readOptionalString(currentOrganization, "name");
  const slug = readOptionalString(currentOrganization, "slug");
  const role = readOptionalString(currentOrganization, "role");

  return {
    organizationId,
    ...(name ? { name } : {}),
    ...(slug ? { slug } : {}),
    ...(role ? { role } : {}),
  };
}

function authContractError(phase: string, field?: string): DomainError {
  return cliControlPlaneError(
    "control_plane_auth_exchange_failed",
    "infra",
    "CLI auth exchange response did not match the expected contract",
    true,
    {
      phase,
      ...(field ? { field } : {}),
    },
  );
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  phase: string,
): Result<string> {
  const value = readOptionalString(record, key);
  if (value) {
    return ok(value);
  }

  return err(authContractError(phase, key));
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  phase: string,
): Result<number> {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return ok(value);
  }

  return err(authContractError(phase, key));
}

function readAuth(value: unknown, phase: string): Result<CliControlPlaneAuth> {
  const record = readJsonObject(value);
  const kind = readOptionalString(record ?? {}, "kind");
  if (kind === "bearer") {
    const token = readOptionalString(record ?? {}, "token");
    if (token) {
      return ok({ kind, token });
    }
  }
  if (kind === "product-session") {
    const cookie = readOptionalString(record ?? {}, "cookie");
    if (cookie) {
      return ok({ kind, cookie });
    }
  }

  return err(
    cliControlPlaneError(
      "control_plane_auth_exchange_failed",
      "infra",
      "CLI auth exchange response did not include supported credential material",
      true,
      {
        phase,
      },
    ),
  );
}

async function readResponseJson(
  response: Response,
  phase: string,
  request: Request,
): Promise<Result<unknown>> {
  const result = await readJsonApiResponse(response, request);

  if (!result.ok) {
    return err(errorFromJsonApiResponse(result.error, phase));
  }

  return ok(result.data);
}

async function readJsonApiResponse(
  response: Response,
  request: Request,
): Promise<
  | {
      readonly ok: true;
      readonly data: unknown;
    }
  | {
      readonly ok: false;
      readonly error: JsonApiReadError;
    }
> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (text.length === 0) {
    return { ok: true, data: null };
  }

  if (contentType.toLowerCase().includes("text/html")) {
    return {
      ok: false,
      error: unexpectedJsonResponseError({
        code: "control_plane_unexpected_html_response",
        message:
          "Control plane returned HTML instead of JSON. Check the control-plane base URL and API route.",
        response,
        request,
        contentType,
        bodyKind: "html",
      }),
    };
  }

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    const hasJsonContentType = contentType.toLowerCase().includes("json");
    return {
      ok: false,
      error: unexpectedJsonResponseError({
        code: hasJsonContentType
          ? "control_plane_invalid_json_response"
          : "control_plane_unexpected_non_json_response",
        message: hasJsonContentType
          ? "Control plane returned invalid JSON."
          : "Control plane returned a non-JSON response.",
        response,
        request,
        contentType,
        bodyKind: "non-json",
      }),
    };
  }
}

function unexpectedJsonResponseError(input: {
  readonly code: string;
  readonly message: string;
  readonly response: Response;
  readonly request: Request;
  readonly contentType: string;
  readonly bodyKind: string;
}): JsonApiReadError {
  return {
    code: input.code,
    category: "infra",
    message: input.message,
    retryable: transientGatewayStatuses.has(input.response.status),
    details: {
      method: input.request.method,
      url: input.request.url,
      status: input.response.status,
      contentType: input.contentType,
      bodyKind: input.bodyKind,
    },
  };
}

function safeAuthErrorDetails(value: unknown, phase: string, status: number): DomainErrorDetails {
  const details: DomainErrorDetails = {
    phase,
    status,
  };
  const record = readJsonObject(value);
  const rawDetails = readJsonObject(record?.details);
  for (const [key, detail] of Object.entries(rawDetails ?? {})) {
    if (/token|cookie|secret|credential|authorization|auth|raw/i.test(key)) {
      continue;
    }
    const safeValue = detailValue(detail);
    if (safeValue !== undefined) {
      details[key] = safeValue;
    }
  }
  return details;
}

function errorFromAuthResponse(response: Response, value: unknown, phase: string): DomainError {
  const record = readJsonObject(value);
  const code = readOptionalString(record ?? {}, "code");
  const category = readOptionalString(record ?? {}, "category");
  const message = readOptionalString(record ?? {}, "message");
  const retryable = readJsonObject(value)?.retryable;

  if (
    response.status === 404 ||
    response.status === 405 ||
    response.status === 501 ||
    code === "not_found" ||
    code === "method_not_allowed"
  ) {
    return cliControlPlaneError(
      "control_plane_auth_unsupported",
      "user",
      "Selected control plane does not support CLI browser auth exchange",
      false,
      safeAuthErrorDetails(value, phase, response.status),
    );
  }

  const safeCategory =
    category === "user" ||
    category === "infra" ||
    category === "provider" ||
    category === "retryable" ||
    category === "timeout"
      ? category
      : "infra";

  return cliControlPlaneError(
    code ?? "control_plane_auth_exchange_failed",
    safeCategory,
    message ?? "CLI browser auth exchange failed",
    typeof retryable === "boolean" ? retryable : true,
    safeAuthErrorDetails(value, phase, response.status),
  );
}

function handshakeFromVersion(
  baseUrl: string,
  value: unknown,
  checkedAt: string,
): Result<CliControlPlaneHandshake> {
  const record = readJsonObject(value);
  const apiVersion = readOptionalString(record ?? {}, "apiVersion");

  if (!record || !apiVersion) {
    return err(
      cliControlPlaneError(
        "control_plane_handshake_failed",
        "infra",
        "Control plane version response did not match the expected contract",
        true,
        {
          phase: "control-plane-handshake",
          baseUrl,
        },
      ),
    );
  }

  const name = readOptionalString(record, "name");
  const version = readOptionalString(record, "version");
  const mode = readOptionalString(record, "mode");

  return ok({
    checkedAt,
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
    apiVersion,
    ...(mode ? { mode } : {}),
  });
}

export async function performControlPlaneHandshake(input: {
  readonly baseUrl: string;
  readonly auth: CliControlPlaneAuth;
  readonly checkedAt: string;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<CliControlPlaneHandshakeResult>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  const versionRequest = new Request(`${input.baseUrl}/api/version`);
  let versionResponse: Response;

  try {
    versionResponse = await fetchImplementation(versionRequest);
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-handshake"));
  }

  const versionJson = await readResponseJson(
    versionResponse,
    "control-plane-handshake",
    versionRequest,
  );
  if (versionJson.isErr()) {
    return err(versionJson.error);
  }
  if (!versionResponse.ok) {
    return err(
      cliControlPlaneError(
        "control_plane_handshake_failed",
        "infra",
        "Control plane version handshake failed",
        true,
        {
          phase: "control-plane-handshake",
          status: versionResponse.status,
        },
      ),
    );
  }

  const handshake = handshakeFromVersion(input.baseUrl, versionJson.value, input.checkedAt);
  if (handshake.isErr()) {
    return err(handshake.error);
  }

  const currentContext = await requestControlPlaneOperation({
    profile: {
      name: "handshake",
      mode: "self-hosted",
      baseUrl: input.baseUrl,
      auth: input.auth,
      createdAt: input.checkedAt,
      updatedAt: input.checkedAt,
    },
    operationKey: "organizations.current-context",
    fetch: fetchImplementation,
    phase: "control-plane-auth",
  });
  if (currentContext.isErr()) {
    return err(currentContext.error);
  }

  const currentOrganization = readOrganizationContext(currentContext.value);

  return ok({
    handshake: handshake.value,
    ...(currentOrganization ? { currentOrganization } : {}),
  });
}

export async function createCliAuthSession(input: {
  readonly baseUrl: string;
  readonly fetch?: AppaloftSdkFetch;
  readonly requestedCredential?: CliAuthSessionRequestedCredential;
}): Promise<Result<CliAuthSession>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  let request: Request;
  let response: Response;

  try {
    request = new Request(`${input.baseUrl}/api/cli-auth/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client: "appaloft-cli",
        ...(input.requestedCredential ? { requestedCredential: input.requestedCredential } : {}),
      }),
    });
    response = await fetchImplementation(request);
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-auth"));
  }

  const json = await readResponseJson(response, "control-plane-auth", request);
  if (json.isErr()) {
    return err(json.error);
  }
  if (!response.ok) {
    return err(errorFromAuthResponse(response, json.value, "control-plane-auth"));
  }

  const record = readJsonObject(json.value);
  if (!record) {
    return err(authContractError("control-plane-auth"));
  }

  const deviceCode = readRequiredString(record, "deviceCode", "control-plane-auth");
  if (deviceCode.isErr()) {
    return err(deviceCode.error);
  }
  const userCode = readRequiredString(record, "userCode", "control-plane-auth");
  if (userCode.isErr()) {
    return err(userCode.error);
  }
  const verificationUri = readRequiredString(record, "verificationUri", "control-plane-auth");
  if (verificationUri.isErr()) {
    return err(verificationUri.error);
  }
  const verificationUriComplete = readRequiredString(
    record,
    "verificationUriComplete",
    "control-plane-auth",
  );
  if (verificationUriComplete.isErr()) {
    return err(verificationUriComplete.error);
  }
  const expiresIn = readRequiredNumber(record, "expiresIn", "control-plane-auth");
  if (expiresIn.isErr()) {
    return err(expiresIn.error);
  }
  const interval = readRequiredNumber(record, "interval", "control-plane-auth");
  if (interval.isErr()) {
    return err(interval.error);
  }

  return ok({
    deviceCode: deviceCode.value,
    userCode: userCode.value,
    verificationUri: verificationUri.value,
    verificationUriComplete: verificationUriComplete.value,
    expiresIn: expiresIn.value,
    interval: interval.value,
  });
}

export async function pollCliAuthSession(input: {
  readonly baseUrl: string;
  readonly deviceCode: string;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<CliAuthSessionPollResult>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  let request: Request;
  let response: Response;

  try {
    request = new Request(
      `${input.baseUrl}/api/cli-auth/sessions/${encodeURIComponent(input.deviceCode)}`,
    );
    response = await fetchImplementation(request);
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-auth"));
  }

  const json = await readResponseJson(response, "control-plane-auth", request);
  if (json.isErr()) {
    return err(json.error);
  }
  if (!response.ok) {
    return err(errorFromAuthResponse(response, json.value, "control-plane-auth"));
  }

  const record = readJsonObject(json.value);
  const status = readOptionalString(record ?? {}, "status");
  if (
    status !== "pending" &&
    status !== "authorized" &&
    status !== "denied" &&
    status !== "expired"
  ) {
    return err(
      cliControlPlaneError(
        "control_plane_auth_exchange_failed",
        "infra",
        "CLI auth session status did not match the expected contract",
        true,
        {
          phase: "control-plane-auth",
        },
      ),
    );
  }

  const interval = record && typeof record.interval === "number" ? record.interval : undefined;
  return ok({
    status,
    ...(interval !== undefined ? { interval } : {}),
  });
}

export async function exchangeCliAuthSession(input: {
  readonly baseUrl: string;
  readonly deviceCode: string;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<CliAuthSessionExchangeResult>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  let request: Request;
  let response: Response;

  try {
    request = new Request(
      `${input.baseUrl}/api/cli-auth/sessions/${encodeURIComponent(input.deviceCode)}/exchange`,
      {
        method: "POST",
      },
    );
    response = await fetchImplementation(request);
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-auth"));
  }

  const json = await readResponseJson(response, "control-plane-auth", request);
  if (json.isErr()) {
    return err(json.error);
  }
  if (!response.ok) {
    return err(errorFromAuthResponse(response, json.value, "control-plane-auth"));
  }

  const record = readJsonObject(json.value);
  const auth = readAuth(record?.auth, "control-plane-auth");
  if (auth.isErr()) {
    return err(auth.error);
  }

  return ok({ auth: auth.value });
}

export async function cancelCliAuthSession(input: {
  readonly baseUrl: string;
  readonly deviceCode: string;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<void>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  try {
    await fetchImplementation(
      new Request(
        `${input.baseUrl}/api/cli-auth/sessions/${encodeURIComponent(input.deviceCode)}/cancel`,
        {
          method: "POST",
        },
      ),
    );
    return ok(undefined);
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-auth"));
  }
}

export async function requestControlPlaneOperation(input: {
  readonly profile: CliControlPlaneProfile;
  readonly operationKey: string;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly fetch?: AppaloftSdkFetch;
  readonly phase: string;
}): Promise<Result<unknown>> {
  const fetchImplementation = queryGatewayRetryFetch(
    input.operationKey,
    input.fetch ?? defaultControlPlaneFetch,
  );
  const boundedRoute = boundedJsonRouteForOperation(input.operationKey);
  if (boundedRoute) {
    return requestControlPlaneCatalogRoute({
      ...input,
      route: boundedRoute,
      fetch: fetchImplementation,
    });
  }

  const client = createAppaloftClient({
    baseUrl: `${input.profile.baseUrl}/api`,
    auth: authForProfile(input.profile.auth),
    fetch: fetchImplementation,
    userAgent: cliUserAgent,
  });

  const request: AppaloftSdkFacadeInput = {
    ...(input.pathParams ? { pathParams: input.pathParams } : {}),
    ...(input.query ? { query: input.query } : {}),
    ...(input.body === undefined ? {} : { body: input.body }),
  };

  try {
    const result = await requestFacadeOperation(client, input.operationKey, request);
    if (isAsyncIterable(result)) {
      return err(
        cliControlPlaneError(
          "control_plane_unsupported",
          "user",
          "Streaming control plane operations are not supported by this request helper",
          false,
          {
            phase: input.phase,
            operationKey: input.operationKey,
          },
        ),
      );
    }
    if (!result.ok) {
      return err(errorFromSdkResult(result, input.phase));
    }
    return ok(result.data);
  } catch (error) {
    return err(errorFromUnknown(error, input.phase));
  }
}

function queryGatewayRetryFetch(
  operationKey: string,
  fetchImplementation: AppaloftSdkFetch,
): AppaloftSdkFetch {
  const operation = findOperationCatalogEntryByKey(operationKey);
  if (operation?.kind !== "query") {
    return fetchImplementation;
  }

  return async (request) => {
    const retryRequest = request.clone();
    const response = await fetchImplementation(request);
    if (await isTransientHtmlGatewayResponse(response)) {
      return fetchImplementation(retryRequest);
    }
    return response;
  };
}

async function isTransientHtmlGatewayResponse(response: Response): Promise<boolean> {
  if (!transientGatewayStatuses.has(response.status)) {
    return false;
  }

  if ((response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    return true;
  }

  try {
    const prefix = (await response.clone().text()).slice(0, 512).trimStart().toLowerCase();
    return (
      prefix.startsWith("<!doctype html") ||
      prefix.startsWith("<html") ||
      prefix.startsWith("<head") ||
      prefix.startsWith("<body")
    );
  } catch {
    return false;
  }
}

export async function requestControlPlaneStreamOperation(input: {
  readonly profile: CliControlPlaneProfile;
  readonly operationKey: string;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly fetch?: AppaloftSdkFetch;
  readonly phase: string;
}): Promise<Result<AsyncIterable<unknown>>> {
  const client = createAppaloftClient({
    baseUrl: `${input.profile.baseUrl}/api`,
    auth: authForProfile(input.profile.auth),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    userAgent: cliUserAgent,
  });

  const request: AppaloftSdkFacadeInput = {
    ...(input.pathParams ? { pathParams: input.pathParams } : {}),
    ...(input.query ? { query: input.query } : {}),
    ...(input.body === undefined ? {} : { body: input.body }),
  };

  try {
    const result = requestFacadeOperation(client, input.operationKey, request);
    if (!isAsyncIterable(result)) {
      return err(
        cliControlPlaneError(
          "control_plane_unsupported",
          "user",
          "Streaming control plane operation did not return a stream",
          false,
          {
            phase: input.phase,
            operationKey: input.operationKey,
          },
        ),
      );
    }

    return ok(result);
  } catch (error) {
    return err(errorFromUnknown(error, input.phase));
  }
}

function boundedJsonRouteForOperation(
  operationKey: string,
): CliControlPlaneOperation["route"] | undefined {
  const entry = findOperationCatalogEntryByKey(operationKey);
  if (!entry?.transports.orpc || !entry.transports.orpcStream) {
    return undefined;
  }

  return {
    method: entry.transports.orpc.method,
    path: entry.transports.orpc.path.replace(/^\/api(?=\/)/, ""),
  };
}

async function requestControlPlaneCatalogRoute(input: {
  readonly profile: CliControlPlaneProfile;
  readonly route: CliControlPlaneOperation["route"];
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly fetch?: AppaloftSdkFetch;
  readonly phase: string;
}): Promise<Result<unknown>> {
  const fetchImplementation = input.fetch ?? defaultControlPlaneFetch;
  const request = buildCatalogRouteRequest(input);

  try {
    const response = await fetchImplementation(request);
    const data = await readResponseJson(response, input.phase, request);

    if (data.isErr()) {
      return err(data.error);
    }

    if (!response.ok) {
      return err(
        errorFromSdkResult(
          {
            ok: false,
            status: response.status,
            error: domainErrorFromJsonPayload(data.value),
          },
          input.phase,
        ),
      );
    }

    return ok(data.value);
  } catch (error) {
    return err(errorFromUnknown(error, input.phase));
  }
}

function buildCatalogRouteRequest(input: {
  readonly profile: CliControlPlaneProfile;
  readonly route: CliControlPlaneOperation["route"];
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
}): Request {
  const url = new URL(
    interpolateCatalogRoutePath(input.route.path, input.pathParams ?? {}).replace(/^\//, ""),
    `${input.profile.baseUrl}/api/`,
  );

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers();
  const auth = authForProfile(input.profile.auth);
  if (auth.kind === "product-session") {
    headers.set("cookie", auth.cookie);
  } else {
    headers.set("authorization", `Bearer ${auth.token}`);
  }
  headers.set("user-agent", cliUserAgent);
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, {
    method: input.route.method,
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
}

function interpolateCatalogRoutePath(
  path: string,
  params: Readonly<Record<string, string>>,
): string {
  return path.replaceAll(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing control-plane route path parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
}

function domainErrorFromJsonPayload(value: unknown): {
  readonly code: string;
  readonly category: DomainError["category"];
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, DomainErrorDetailValue>>;
} {
  const candidate = isRecord(value) && isRecord(value.error) ? value.error : value;

  if (isRecord(candidate)) {
    const code = typeof candidate.code === "string" ? candidate.code : undefined;
    const category = isDomainErrorCategory(candidate.category) ? candidate.category : undefined;
    const message = typeof candidate.message === "string" ? candidate.message : undefined;
    const retryable = typeof candidate.retryable === "boolean" ? candidate.retryable : undefined;

    if (code && category && message && retryable !== undefined) {
      return {
        code,
        category,
        message,
        retryable,
        ...(isDomainErrorDetails(candidate.details) ? { details: candidate.details } : {}),
      };
    }
  }

  return {
    code: "control_plane_unstructured_error",
    category: "infra",
    message: "Control plane returned an error that did not match the Appaloft error contract.",
    retryable: false,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDomainErrorCategory(value: unknown): value is DomainError["category"] {
  return (
    value === "user" ||
    value === "infra" ||
    value === "provider" ||
    value === "retryable" ||
    value === "timeout"
  );
}

function isDomainErrorDetails(
  value: unknown,
): value is Readonly<Record<string, DomainErrorDetailValue>> {
  return isRecord(value) && Object.values(value).every(isDomainErrorDetailValue);
}

function isDomainErrorDetailValue(value: unknown): value is DomainErrorDetailValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}

function requestFacadeOperation<T = unknown>(
  client: unknown,
  operationKey: string,
  input?: AppaloftSdkFacadeInput,
): ReturnType<AppaloftSdkFacadeMethod> {
  const method = facadeMethodForOperationKey(client, operationKey);

  return method<T>(input);
}

function facadeMethodForOperationKey(
  client: unknown,
  operationKey: string,
): AppaloftSdkFacadeMethod {
  let current = client;

  for (const segment of operationKeyToFacadePath(operationKey)) {
    if ((typeof current !== "object" && typeof current !== "function") || current === null) {
      throw new Error(`SDK facade operation ${operationKey} is not available`);
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (typeof current !== "function") {
    throw new Error(`SDK facade operation ${operationKey} is not callable`);
  }

  return current as AppaloftSdkFacadeMethod;
}

function operationKeyToFacadePath(operationKey: string): string[] {
  return operationKey.split(".").filter(Boolean).map(operationKeyPartToIdentifier);
}

function operationKeyPartToIdentifier(part: string): string {
  const normalized = part
    .split("-")
    .filter((value) => value.length > 0)
    .map((value, index) => (index === 0 ? value : capitalize(value)))
    .join("");

  return normalized.replaceAll(/[^a-zA-Z0-9_$]/g, "");
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export async function requestRemoteProjectOperation(input: {
  readonly profile: CliControlPlaneProfile;
  readonly operationKey: CliRemoteProjectOperationKey;
  readonly projectId?: string;
  readonly fetch?: AppaloftSdkFetch;
}): Promise<Result<unknown>> {
  const operation = findControlPlaneOperation(input.operationKey);
  if (operation.isErr()) {
    return err(operation.error);
  }

  return requestControlPlaneOperation({
    profile: input.profile,
    operationKey: operation.value.operationKey,
    ...(input.projectId ? { pathParams: { projectId: input.projectId } } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    phase: "remote-operation-dispatch",
  });
}
