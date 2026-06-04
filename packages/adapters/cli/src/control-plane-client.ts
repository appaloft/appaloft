import {
  type DomainError,
  type DomainErrorDetails,
  type DomainErrorDetailValue,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import {
  type AppaloftSdkFetch,
  type AppaloftSdkOperationRequest,
  type AppaloftSdkOperationResult,
  createAppaloftSdkClient,
  generatedSdkOperations,
  readAppaloftJsonApiResponse,
  type SdkOperationDescriptor,
} from "@appaloft/sdk";
import {
  type CliControlPlaneAuth,
  type CliControlPlaneHandshake,
  type CliControlPlaneOrganizationContext,
  type CliControlPlaneProfile,
} from "./control-plane-profile.js";

const cliUserAgent = "appaloft-cli";

export type CliRemoteProjectOperationKey = "projects.list" | "projects.show";

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

function errorFromJsonApiResponse(
  error: Extract<Awaited<ReturnType<typeof readAppaloftJsonApiResponse>>, { ok: false }>["error"],
  phase: string,
): DomainError {
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

export function findControlPlaneOperation(operationKey: string): Result<SdkOperationDescriptor> {
  const operation = generatedSdkOperations.find((entry) => entry.operationKey === operationKey);
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
  const result = await readAppaloftJsonApiResponse(response, {
    method: request.method,
    url: request.url,
  });

  if (!result.ok) {
    return err(errorFromJsonApiResponse(result.error, phase));
  }

  return ok(result.data);
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

  const currentContextOperation = findControlPlaneOperation("organizations.current-context");
  if (currentContextOperation.isErr()) {
    return err(currentContextOperation.error);
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
    operation: currentContextOperation.value,
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
  readonly operation: SdkOperationDescriptor;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number | boolean | null | undefined>>;
  readonly body?: unknown;
  readonly fetch?: AppaloftSdkFetch;
  readonly phase: string;
}): Promise<Result<unknown>> {
  const client = createAppaloftSdkClient({
    baseUrl: `${input.profile.baseUrl}/api`,
    auth: authForProfile(input.profile.auth),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    userAgent: cliUserAgent,
  });

  const request: AppaloftSdkOperationRequest = {
    operation: input.operation,
    ...(input.pathParams ? { pathParams: input.pathParams } : {}),
    ...(input.query ? { query: input.query } : {}),
    ...(input.body === undefined ? {} : { body: input.body }),
  };

  try {
    const result = await client.request(request);
    if (!result.ok) {
      return err(errorFromSdkResult(result, input.phase));
    }
    return ok(result.data);
  } catch (error) {
    return err(errorFromUnknown(error, input.phase));
  }
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
    operation: operation.value,
    ...(input.projectId ? { pathParams: { projectId: input.projectId } } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    phase: "remote-operation-dispatch",
  });
}
