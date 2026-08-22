export interface SafeCliErrorEvidence {
  schemaVersion: "appaloft.cli-error/v1";
  code: string;
  category: string;
  phase: string | null;
  reason: string | null;
  stateBackend: string | null;
  sourcePostgresMajor: string | null;
  requiredPostgresMajor: string | null;
  workspaceId: string | null;
  sandboxId: string | null;
  exitCode: number | null;
  retryable: boolean;
  causeCode: string | null;
  detailCode: string | null;
  repositoryIdentity: string | null;
}

const safeCliErrorEvidenceFieldRecord = {
  schemaVersion: true,
  code: true,
  category: true,
  phase: true,
  reason: true,
  stateBackend: true,
  sourcePostgresMajor: true,
  requiredPostgresMajor: true,
  workspaceId: true,
  sandboxId: true,
  exitCode: true,
  retryable: true,
  causeCode: true,
  detailCode: true,
  repositoryIdentity: true,
} as const satisfies Record<keyof SafeCliErrorEvidence, true>;

export const SAFE_CLI_ERROR_EVIDENCE_FIELDS = Object.freeze(
  Object.keys(safeCliErrorEvidenceFieldRecord) as Array<keyof SafeCliErrorEvidence>,
);

const SAFE_ERROR_CODE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const SAFE_REPOSITORY_IDENTITY =
  /^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

interface SafeCliErrorInput {
  readonly code: string;
  readonly category: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

function isSafeCliErrorInput(value: unknown): value is SafeCliErrorInput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.category === "string" &&
    typeof record.message === "string" &&
    typeof record.retryable === "boolean"
  );
}

function emptySafeCliErrorEvidence(
  overrides: Partial<SafeCliErrorEvidence> = {},
): SafeCliErrorEvidence {
  return {
    schemaVersion: "appaloft.cli-error/v1",
    code: "cli_error_unclassified",
    category: "infra",
    phase: null,
    reason: null,
    stateBackend: null,
    sourcePostgresMajor: null,
    requiredPostgresMajor: null,
    workspaceId: null,
    sandboxId: null,
    exitCode: null,
    retryable: false,
    causeCode: null,
    detailCode: null,
    repositoryIdentity: null,
    ...overrides,
  };
}

function safeErrorDetail(error: SafeCliErrorInput, key: string): string | null {
  const value = error.details?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function safeTokenDetail(error: SafeCliErrorInput, key: string, pattern: RegExp): string | null {
  const value = error.details?.[key];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function safePostgresMajorDetail(error: SafeCliErrorInput, key: string): string | null {
  const value = error.details?.[key];
  return typeof value === "string" && /^\d{1,3}$/.test(value) ? value : null;
}

export function safeCliErrorEvidence(error: unknown): SafeCliErrorEvidence {
  if (!isSafeCliErrorInput(error)) return emptySafeCliErrorEvidence();

  const exitCode = error.details?.exitCode;
  return emptySafeCliErrorEvidence({
    code: error.code,
    category: error.category,
    phase: safeErrorDetail(error, "phase"),
    reason: safeErrorDetail(error, "reason"),
    stateBackend: safeErrorDetail(error, "stateBackend"),
    sourcePostgresMajor: safePostgresMajorDetail(error, "sourcePostgresMajor"),
    requiredPostgresMajor: safePostgresMajorDetail(error, "requiredPostgresMajor"),
    workspaceId: safeErrorDetail(error, "workspaceId"),
    sandboxId: safeErrorDetail(error, "sandboxId"),
    exitCode: typeof exitCode === "number" && Number.isInteger(exitCode) ? exitCode : null,
    retryable: error.retryable,
    causeCode: safeTokenDetail(error, "causeCode", SAFE_ERROR_CODE),
    detailCode: safeTokenDetail(error, "code", SAFE_ERROR_CODE),
    repositoryIdentity: safeTokenDetail(error, "repositoryIdentity", SAFE_REPOSITORY_IDENTITY),
  });
}

export function formatSafeCliError(error: unknown): string {
  return `${JSON.stringify(safeCliErrorEvidence(error))}\n`;
}
