import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { operationCatalog } from "../packages/application/src/operation-catalog";

type SkillEval = {
  id: string;
  family: string;
  prompt: string;
  expected_output: string;
  expected_operations: string[];
  source_documents: string[];
  assertions: string[];
};

type SkillEvalSuite = {
  skill_name: string;
  purpose: string;
  coverage_families: string[];
  evals: SkillEval[];
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operationKeys: ReadonlySet<string> = new Set(
  operationCatalog.map((operation) => operation.key),
);
const operationDomains: ReadonlySet<string> = new Set(
  operationCatalog.map((operation) => operation.domain),
);

const requiredCoverageFamilies = [
  "project-lifecycle",
  "server-registration-and-lifecycle",
  "ssh-credential-management",
  "environment-lifecycle-and-precedence",
  "resource-profile-configuration",
  "first-deploy-and-outcome",
  "deployment-observation-and-recovery",
  "domain-and-tls",
  "dependency-resources-and-backups",
  "storage-volumes",
  "scheduled-tasks",
  "runtime-usage-and-monitoring",
  "runtime-controls-and-terminal-sessions",
  "source-links-and-preview",
  "static-artifact-publishing",
  "audit-retention-and-operator-work",
  "organization-auth-and-deploy-tokens",
  "mcp-transport",
  "negative-secret-and-bypass-boundary",
] as const;

const requiredOperationDomains = [
  "projects",
  "servers",
  "credentials",
  "environments",
  "resources",
  "deployments",
  "domain-bindings",
  "certificates",
  "dependency-resources",
  "storage-volumes",
  "scheduled-tasks",
  "scheduled-task-runs",
  "runtime-usage",
  "runtime-monitoring",
  "terminal-sessions",
  "source-links",
  "preview-policies",
  "preview-environments",
  "static-artifacts",
  "audit-events",
  "retention-defaults",
  "operator-work",
  "auth",
  "organizations",
  "deploy-tokens",
  "system",
] as const;

const requiredOperations = [
  "projects.create",
  "projects.show",
  "projects.delete-check",
  "servers.register",
  "servers.configure-credential",
  "servers.rename",
  "servers.deactivate",
  "credentials.create-ssh",
  "credentials.rotate-ssh",
  "environments.create",
  "environments.effective-precedence",
  "resources.create",
  "resources.configure-source",
  "resources.configure-runtime",
  "resources.configure-network",
  "resources.configure-health",
  "resources.configure-access",
  "resources.configure-auto-deploy",
  "resources.effective-config",
  "deployments.plan",
  "deployments.create",
  "deployments.show",
  "deployments.logs",
  "deployments.stream-events",
  "deployments.recovery-readiness",
  "deployments.retry",
  "deployments.redeploy",
  "deployments.rollback",
  "domain-bindings.create",
  "certificates.issue-or-renew",
  "dependency-resources.provision",
  "dependency-resources.create-backup",
  "dependency-resources.restore-backup",
  "resources.bind-dependency",
  "resources.rotate-dependency-binding-secret",
  "storage-volumes.create",
  "resources.attach-storage",
  "scheduled-tasks.create",
  "scheduled-task-runs.logs",
  "runtime-usage.inspect",
  "runtime-monitoring.samples.list",
  "resources.health",
  "resources.runtime-logs",
  "resources.runtime.restart",
  "terminal-sessions.open",
  "source-links.show",
  "preview-policies.configure",
  "preview-environments.delete",
  "static-artifacts.publish",
  "static-artifacts.publications.list",
  "audit-events.export",
  "audit-events.legal-holds.configure",
  "retention-defaults.configure",
  "operator-work.retry",
  "auth.bootstrap-first-admin",
  "organizations.invite-member",
  "deploy-tokens.create",
  "deploy-tokens.rotate",
  "deploy-tokens.revoke",
  "system.doctor",
] as const;

const requiredSourceDocuments = [
  "docs/agent/appaloft-skill.md",
  "docs/agent/appaloft-deploy-skill.md",
  "docs/agent/appaloft-mcp-server.md",
  "docs/workflows/deployment-target-lifecycle.md",
  "docs/workflows/resource-profile-lifecycle.md",
  "docs/workflows/deployments.create.md",
  "docs/workflows/deployment-detail-and-observation.md",
  "docs/workflows/dependency-resource-lifecycle.md",
  "docs/workflows/storage-volume-lifecycle.md",
  "docs/testing/project-lifecycle-test-matrix.md",
  "docs/testing/deployment-target-lifecycle-test-matrix.md",
  "docs/testing/deployment-recovery-readiness-test-matrix.md",
  "docs/testing/resource-profile-lifecycle-test-matrix.md",
  "docs/testing/routing-domain-and-tls-test-matrix.md",
  "docs/testing/runtime-monitoring-observation-test-matrix.md",
  "docs/specs/090-appaloft-as-mcp-transport/spec.md",
  "skills/appaloft/SKILL.md",
  "skills/appaloft/references/cli-entrypoints.md",
  "skills/appaloft/references/deploy-protocol.md",
  "skills/appaloft/references/mcp-tools.md",
] as const;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseSuite(value: unknown): SkillEvalSuite {
  assert(isRecord(value), "eval suite must be an object");
  const rawSkillName = value.skill_name;
  const rawPurpose = value.purpose;
  const rawCoverageFamilies = value.coverage_families;
  const rawEvals = value.evals;

  assert(rawSkillName === "appaloft", "skill_name must be appaloft");
  assert(typeof rawPurpose === "string" && rawPurpose.length > 0, "purpose is required");
  assert(isStringArray(rawCoverageFamilies), "coverage_families must be strings");
  assert(Array.isArray(rawEvals), "evals must be an array");

  const evals = rawEvals.map((entry: unknown, index: number) => {
    assert(isRecord(entry), `eval ${index} must be an object`);
    assert(typeof entry.id === "string" && entry.id.length > 0, `eval ${index} id is required`);
    assert(
      typeof entry.family === "string" && entry.family.length > 0,
      `eval ${entry.id} family is required`,
    );
    assert(
      typeof entry.prompt === "string" && entry.prompt.length > 40,
      `eval ${entry.id} prompt must be realistic`,
    );
    assert(
      typeof entry.expected_output === "string" && entry.expected_output.length > 40,
      `eval ${entry.id} expected_output must be descriptive`,
    );
    assert(
      isStringArray(entry.expected_operations) && entry.expected_operations.length > 0,
      `eval ${entry.id} expected_operations must be non-empty strings`,
    );
    assert(
      isStringArray(entry.source_documents) && entry.source_documents.length > 0,
      `eval ${entry.id} source_documents must be non-empty strings`,
    );
    assert(
      isStringArray(entry.assertions) && entry.assertions.length >= 3,
      `eval ${entry.id} must include at least three assertions`,
    );
    return entry as SkillEval;
  });

  return {
    skill_name: rawSkillName,
    purpose: rawPurpose,
    coverage_families: rawCoverageFamilies,
    evals,
  };
}

function hasOperationDomain(operationKey: string, domain: string): boolean {
  return operationKey === domain || operationKey.startsWith(`${domain}.`);
}

const evalsPath = resolve(repositoryRoot, "skills/appaloft/evals/evals.json");
const suite = parseSuite(JSON.parse(await Bun.file(evalsPath).text()));
const evalIds = new Set<string>();
const coveredFamilies = new Set(suite.evals.map((entry) => entry.family));
const coveredOperations = new Set(suite.evals.flatMap((entry) => entry.expected_operations));
const coveredSourceDocuments = new Set(suite.evals.flatMap((entry) => entry.source_documents));

for (const family of requiredCoverageFamilies) {
  assert(
    suite.coverage_families.includes(family),
    `coverage_families is missing required family ${family}`,
  );
  assert(coveredFamilies.has(family), `no eval covers required family ${family}`);
}

for (const entry of suite.evals) {
  assert(!evalIds.has(entry.id), `duplicate eval id ${entry.id}`);
  evalIds.add(entry.id);
  assert(
    suite.coverage_families.includes(entry.family),
    `eval ${entry.id} family ${entry.family} is not listed in coverage_families`,
  );

  for (const operationKey of entry.expected_operations) {
    assert(operationKeys.has(operationKey), `eval ${entry.id} unknown operation ${operationKey}`);
  }
  assert(
    new Set(entry.expected_operations).size === entry.expected_operations.length,
    `eval ${entry.id} contains duplicate expected_operations`,
  );

  for (const sourceDocument of entry.source_documents) {
    assert(
      existsSync(resolve(repositoryRoot, sourceDocument)),
      `eval ${entry.id} source document does not exist: ${sourceDocument}`,
    );
  }

  for (const assertion of entry.assertions) {
    assert(assertion.endsWith("."), `eval ${entry.id} assertion must be a full sentence`);
  }
}

for (const domain of requiredOperationDomains) {
  assert(operationDomains.has(domain), `operation catalog does not contain domain ${domain}`);
  assert(
    [...coveredOperations].some((operationKey) => hasOperationDomain(operationKey, domain)),
    `evals do not cover operation domain ${domain}`,
  );
}

for (const operationKey of requiredOperations) {
  assert(coveredOperations.has(operationKey), `evals do not cover operation ${operationKey}`);
}

for (const sourceDocument of requiredSourceDocuments) {
  assert(coveredSourceDocuments.has(sourceDocument), `evals do not cite ${sourceDocument}`);
}

const evalText = await Bun.file(evalsPath).text();
for (const requiredText of [
  "server",
  "saved SSH credential",
  "deployment",
  "diagnostic",
  "recovery",
  "MCP",
  "operation catalog",
  ".env",
  "private keys",
  "quick-deploy.create",
]) {
  assert(evalText.includes(requiredText), `eval suite is missing required text: ${requiredText}`);
}

console.log(
  `Validated ${suite.evals.length} Appaloft skill evals across ${suite.coverage_families.length} families and ${coveredOperations.size} operation keys.`,
);
