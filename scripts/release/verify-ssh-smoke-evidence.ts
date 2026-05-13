import { resolve } from "node:path";

import { parseCliArgs, stringArg } from "./lib/release-utils";

type SshSmokeSuite = "smoke:ssh:remote-state" | "smoke:ssh:quick-deploy";
type SshSmokeSuiteMode = "all" | "quick-deploy" | "remote-state";

interface SshSmokeEvidence {
  command?: unknown;
  durationMs?: unknown;
  environment?: unknown;
  generatedAt?: unknown;
  matrixId?: unknown;
  releaseTarget?: unknown;
  result?: unknown;
  schemaVersion?: unknown;
  suiteMode?: unknown;
  suites?: unknown;
}

interface SshSmokeEvidenceEnvironment {
  hostConfigured?: unknown;
  portConfigured?: unknown;
  privateKeyConfigured?: unknown;
  publicRouteHostConfigured?: unknown;
  usernameConfigured?: unknown;
}

const expectedSuitesByMode: Record<SshSmokeSuiteMode, SshSmokeSuite[]> = {
  all: ["smoke:ssh:remote-state", "smoke:ssh:quick-deploy"],
  "quick-deploy": ["smoke:ssh:quick-deploy"],
  "remote-state": ["smoke:ssh:remote-state"],
};

function parseSuiteMode(value: string | undefined): SshSmokeSuiteMode {
  if (!value) {
    return "all";
  }
  if (value === "all" || value === "remote-state" || value === "quick-deploy") {
    return value;
  }
  throw new Error("--suite must be one of: all, remote-state, quick-deploy.");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${field} must be a non-empty string.`);
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  assert(typeof value === "boolean", `${field} must be a boolean.`);
}

function assertSuites(value: unknown, mode: SshSmokeSuiteMode): void {
  assert(Array.isArray(value), "suites must be an array.");
  const expected = expectedSuitesByMode[mode];
  assert(value.length === expected.length, `suites must contain ${expected.length} item(s).`);
  for (const suite of expected) {
    assert(value.includes(suite), `suites must include ${suite}.`);
  }
}

function assertEvidenceDoesNotLeakSecretValues(raw: string): void {
  const forbiddenValues = [
    process.env.APPALOFT_E2E_SSH_HOST,
    process.env.APPALOFT_E2E_SSH_PRIVATE_KEY,
    process.env.APPALOFT_E2E_SSH_USERNAME,
    process.env.APPALOFT_E2E_PUBLIC_ROUTE_HOST,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const value of forbiddenValues) {
    assert(
      !raw.includes(value),
      "SSH evidence must not contain configured SSH secret-like values.",
    );
  }
}

async function readEvidence(path: string): Promise<{ evidence: SshSmokeEvidence; raw: string }> {
  const raw = await Bun.file(path).text();
  return {
    raw,
    evidence: JSON.parse(raw) as SshSmokeEvidence,
  };
}

const args = parseCliArgs(Bun.argv.slice(2));
const evidencePath = resolve(stringArg(args, "path") ?? "dist/release/ssh-smoke-evidence.json");
const expectedReleaseTarget =
  stringArg(args, "release-target") ?? process.env.APPALOFT_RELEASE_TARGET ?? "0.11.0";
const suiteMode = parseSuiteMode(stringArg(args, "suite"));
const { evidence, raw } = await readEvidence(evidencePath);

assert(evidence.schemaVersion === "appaloft.ssh-smoke-evidence/v1", "schemaVersion is invalid.");
assert(evidence.matrixId === "RELEASE-HARDENING-006", "matrixId is invalid.");
assert(evidence.releaseTarget === expectedReleaseTarget, "releaseTarget is invalid.");
assert(evidence.result === "passed", "result must be passed.");
assert(evidence.suiteMode === suiteMode, "suiteMode is invalid.");
assertString(evidence.command, "command");
assertString(evidence.generatedAt, "generatedAt");
assert(!Number.isNaN(Date.parse(evidence.generatedAt)), "generatedAt must be an ISO timestamp.");
assert(
  typeof evidence.durationMs === "number" && evidence.durationMs >= 0,
  "durationMs is invalid.",
);
assertSuites(evidence.suites, suiteMode);

assert(isRecord(evidence.environment), "environment must be an object.");
const environment = evidence.environment as SshSmokeEvidenceEnvironment;
assertBoolean(environment.hostConfigured, "environment.hostConfigured");
assertBoolean(environment.privateKeyConfigured, "environment.privateKeyConfigured");
assertBoolean(environment.portConfigured, "environment.portConfigured");
assertBoolean(environment.usernameConfigured, "environment.usernameConfigured");
assertBoolean(environment.publicRouteHostConfigured, "environment.publicRouteHostConfigured");
assert(environment.hostConfigured, "environment.hostConfigured must be true.");
assert(environment.privateKeyConfigured, "environment.privateKeyConfigured must be true.");
assertEvidenceDoesNotLeakSecretValues(raw);

console.log(`SSH release-readiness evidence verified: ${evidencePath}`);
