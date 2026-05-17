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
  type SdkOperationDescriptor,
} from "@appaloft/sdk";
import {
  type CliControlPlaneAuth,
  type CliControlPlaneHandshake,
  type CliControlPlaneOrganizationContext,
  type CliControlPlaneProfile,
} from "./control-plane-profile.js";

export type CliRemoteProjectOperationKey = "projects.list" | "projects.show";

export interface CliControlPlaneHandshakeResult {
  readonly handshake: CliControlPlaneHandshake;
  readonly currentOrganization?: CliControlPlaneOrganizationContext;
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

function findOperation(operationKey: string): Result<SdkOperationDescriptor> {
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

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
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
  const fetchImplementation = input.fetch ?? ((request: Request) => fetch(request));
  let versionResponse: Response;

  try {
    versionResponse = await fetchImplementation(new Request(`${input.baseUrl}/api/version`));
  } catch (error) {
    return err(errorFromUnknown(error, "control-plane-handshake"));
  }

  const versionJson = await readResponseJson(versionResponse);
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

  const handshake = handshakeFromVersion(input.baseUrl, versionJson, input.checkedAt);
  if (handshake.isErr()) {
    return err(handshake.error);
  }

  const currentContextOperation = findOperation("organizations.current-context");
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

async function requestControlPlaneOperation(input: {
  readonly profile: CliControlPlaneProfile;
  readonly operation: SdkOperationDescriptor;
  readonly pathParams?: Readonly<Record<string, string>>;
  readonly fetch?: AppaloftSdkFetch;
  readonly phase: string;
}): Promise<Result<unknown>> {
  const client = createAppaloftSdkClient({
    baseUrl: `${input.profile.baseUrl}/api`,
    auth: authForProfile(input.profile.auth),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });

  const request: AppaloftSdkOperationRequest = {
    operation: input.operation,
    ...(input.pathParams ? { pathParams: input.pathParams } : {}),
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
  const operation = findOperation(input.operationKey);
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
