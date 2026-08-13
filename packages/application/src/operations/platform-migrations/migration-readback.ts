import { domainError, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

import { type Query } from "../../cqrs";
import { ListDependencyResourceBackupsQuery } from "../dependency-resources/list-dependency-resource-backups.query";
import { ShowDependencyResourceQuery } from "../dependency-resources/show-dependency-resource.query";
import { DeploymentProofQuery } from "../deployments/deployment-proof.query";
import { ShowDeploymentQuery } from "../deployments/show-deployment.query";
import { ShowDomainBindingQuery } from "../domain-bindings/show-domain-binding.query";
import { EnvironmentEffectivePrecedenceQuery } from "../environments/environment-effective-precedence.query";
import { ShowEnvironmentQuery } from "../environments/show-environment.query";
import { ShowProjectQuery } from "../projects/show-project.query";
import { ResourceEffectiveConfigQuery } from "../resources/resource-effective-config.query";
import { ResourceHealthQuery } from "../resources/resource-health.query";
import { ShowResourceQuery } from "../resources/show-resource.query";
import { ShowResourceDependencyBindingQuery } from "../resources/show-resource-dependency-binding.query";
import { ListStorageVolumeBackupsQuery } from "../storage-volumes/list-storage-volume-backups.query";
import { ShowStorageVolumeQuery } from "../storage-volumes/show-storage-volume.query";
import { type MigrationStepReceipt, validateMigrationReceipts } from "./migration-apply";
import { type MigrationQueryDispatcher } from "./migration-cleanup";
import { type MigrationPlan, type MigrationPlanStep } from "./migration-plan";

export interface MigrationReadbackInput {
  readonly plan: MigrationPlan;
  readonly receipts: readonly MigrationStepReceipt[];
  readonly queryDispatcher: MigrationQueryDispatcher;
}

export interface MigrationEvidence {
  readonly stepId: string;
  readonly operationKey: string;
  readonly queryName: string;
  readonly state: "available" | "absent" | "unavailable";
  readonly evaluation: "passed" | "attention" | "observed" | "unavailable";
  readonly summary: Readonly<Record<string, string | number | boolean>>;
  readonly errorCode?: string | undefined;
}

export interface MigrationStatusResult {
  readonly protocol: "platform-migration/v1";
  readonly planDigest: string;
  readonly state: "complete" | "partial" | "unavailable";
  readonly completedStepIds: readonly string[];
  readonly pendingStepIds: readonly string[];
  readonly evidence: readonly MigrationEvidence[];
}

export interface MigrationVerificationResult {
  readonly protocol: "platform-migration/v1";
  readonly planDigest: string;
  readonly state: "passed" | "attention" | "incomplete";
  readonly evidence: readonly MigrationEvidence[];
}

export const migrationEvidenceSchema = z
  .object({
    stepId: z.string().trim().min(1),
    operationKey: z.string().trim().min(1),
    queryName: z.string().trim().min(1),
    state: z.enum(["available", "absent", "unavailable"]),
    evaluation: z.enum(["passed", "attention", "observed", "unavailable"]),
    summary: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    errorCode: z.string().trim().min(1).optional(),
  })
  .strict();

export const migrationStatusResultSchema = z
  .object({
    protocol: z.literal("platform-migration/v1"),
    planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    state: z.enum(["complete", "partial", "unavailable"]),
    completedStepIds: z.array(z.string().trim().min(1)).readonly(),
    pendingStepIds: z.array(z.string().trim().min(1)).readonly(),
    evidence: z.array(migrationEvidenceSchema).readonly(),
  })
  .strict();

export const migrationVerificationResultSchema = z
  .object({
    protocol: z.literal("platform-migration/v1"),
    planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    state: z.enum(["passed", "attention", "incomplete"]),
    evidence: z.array(migrationEvidenceSchema).readonly(),
  })
  .strict();

interface PlannedQuery {
  readonly query: Query<unknown>;
  readonly step: MigrationPlanStep;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveIdentity(
  value: unknown,
  outputs: ReadonlyMap<string, Readonly<Record<string, string | number | boolean>>>,
  label: string,
): Result<string> {
  if (typeof value === "string" && value.length > 0) return ok(value);
  if (isRecord(value) && typeof value.$ref === "string") {
    const matched = /^steps\.(.+)\.output\.([^.]+)$/.exec(value.$ref);
    const resolved = matched?.[1] && matched[2] ? outputs.get(matched[1])?.[matched[2]] : undefined;
    if (typeof resolved === "string" && resolved.length > 0) return ok(resolved);
  }
  return err(
    domainError.validation("Migration readback identity is unavailable", {
      phase: "migration-readback-identity",
      label,
    }),
  );
}

function outputIdentity(receipt: MigrationStepReceipt, key: string): Result<string> {
  const value = receipt.output[key];
  return typeof value === "string" && value.length > 0
    ? ok(value)
    : err(
        domainError.validation("Migration readback receipt identity is unavailable", {
          phase: "migration-readback-receipt",
          stepId: receipt.stepId,
          outputName: key,
        }),
      );
}

function queryResult<TQuery extends Query<unknown>>(
  result: Result<TQuery>,
): Result<Query<unknown>> {
  return result.map((query) => query as Query<unknown>);
}

function statusQueryFor(
  step: MigrationPlanStep,
  receipt: MigrationStepReceipt,
  outputs: ReadonlyMap<string, Readonly<Record<string, string | number | boolean>>>,
): Result<Query<unknown>> {
  const inputString = (key: string) => resolveIdentity(step.input[key], outputs, key);
  switch (step.operationKey) {
    case "projects.create": {
      const id = outputIdentity(receipt, "projectId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowProjectQuery.create({ projectId: id.value }));
    }
    case "environments.create": {
      const id = outputIdentity(receipt, "environmentId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowEnvironmentQuery.create({ environmentId: id.value }));
    }
    case "environments.set-variable": {
      const id = inputString("environmentId");
      return id.isErr()
        ? err(id.error)
        : queryResult(EnvironmentEffectivePrecedenceQuery.create({ environmentId: id.value }));
    }
    case "dependency-resources.provision":
    case "dependency-resources.import": {
      const id = outputIdentity(receipt, "dependencyResourceId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowDependencyResourceQuery.create({ dependencyResourceId: id.value }));
    }
    case "storage-volumes.create": {
      const id = outputIdentity(receipt, "storageVolumeId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowStorageVolumeQuery.create({ storageVolumeId: id.value }));
    }
    case "resources.create":
    case "resources.set-variable":
    case "resources.attach-storage": {
      const id =
        step.operationKey === "resources.create"
          ? outputIdentity(receipt, "resourceId")
          : inputString("resourceId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowResourceQuery.create({ resourceId: id.value }));
    }
    case "resources.bind-dependency": {
      const resourceId = inputString("resourceId");
      const bindingId = outputIdentity(receipt, "bindingId");
      if (resourceId.isErr()) return err(resourceId.error);
      if (bindingId.isErr()) return err(bindingId.error);
      return queryResult(
        ShowResourceDependencyBindingQuery.create({
          resourceId: resourceId.value,
          bindingId: bindingId.value,
        }),
      );
    }
    case "domain-bindings.create": {
      const id = outputIdentity(receipt, "domainBindingId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowDomainBindingQuery.create({ domainBindingId: id.value }));
    }
    case "deployments.create": {
      const id = outputIdentity(receipt, "deploymentId");
      return id.isErr()
        ? err(id.error)
        : queryResult(ShowDeploymentQuery.create({ deploymentId: id.value }));
    }
    default:
      return err(
        domainError.validation("Migration readback operation is unsupported", {
          phase: "migration-readback-query",
          operationKey: step.operationKey,
        }),
      );
  }
}

function verificationQueriesFor(
  step: MigrationPlanStep,
  receipt: MigrationStepReceipt,
  outputs: ReadonlyMap<string, Readonly<Record<string, string | number | boolean>>>,
): Result<readonly Query<unknown>[]> {
  const inputString = (key: string) => resolveIdentity(step.input[key], outputs, key);
  const queries: Result<Query<unknown>>[] = [];
  if (step.operationKey === "resources.create") {
    const id = outputIdentity(receipt, "resourceId");
    if (id.isErr()) return err(id.error);
    queries.push(
      queryResult(
        ResourceHealthQuery.create({
          resourceId: id.value,
          mode: "live",
          includeChecks: true,
          includePublicAccessProbe: true,
          includeRuntimeProbe: true,
        }),
      ),
      queryResult(ResourceEffectiveConfigQuery.create({ resourceId: id.value })),
    );
  } else if (step.operationKey === "deployments.create") {
    const deploymentId = outputIdentity(receipt, "deploymentId");
    const resourceId = inputString("resourceId");
    if (deploymentId.isErr()) return err(deploymentId.error);
    if (resourceId.isErr()) return err(resourceId.error);
    queries.push(
      queryResult(
        DeploymentProofQuery.create({
          deploymentId: deploymentId.value,
          resourceId: resourceId.value,
        }),
      ),
    );
  } else if (step.operationKey === "domain-bindings.create") {
    const id = outputIdentity(receipt, "domainBindingId");
    if (id.isErr()) return err(id.error);
    queries.push(queryResult(ShowDomainBindingQuery.create({ domainBindingId: id.value })));
  } else if (
    step.operationKey === "dependency-resources.provision" ||
    step.operationKey === "dependency-resources.import"
  ) {
    const id = outputIdentity(receipt, "dependencyResourceId");
    if (id.isErr()) return err(id.error);
    queries.push(
      queryResult(ShowDependencyResourceQuery.create({ dependencyResourceId: id.value })),
      queryResult(ListDependencyResourceBackupsQuery.create({ dependencyResourceId: id.value })),
    );
  } else if (step.operationKey === "storage-volumes.create") {
    const id = outputIdentity(receipt, "storageVolumeId");
    if (id.isErr()) return err(id.error);
    queries.push(
      queryResult(ShowStorageVolumeQuery.create({ storageVolumeId: id.value })),
      queryResult(ListStorageVolumeBackupsQuery.create({ storageVolumeId: id.value })),
    );
  } else if (step.operationKey === "environments.create") {
    const id = outputIdentity(receipt, "environmentId");
    if (id.isErr()) return err(id.error);
    queries.push(
      queryResult(EnvironmentEffectivePrecedenceQuery.create({ environmentId: id.value })),
    );
  }

  const values: Query<unknown>[] = [];
  for (const query of queries) {
    if (query.isErr()) return err(query.error);
    values.push(query.value);
  }
  return ok(values);
}

const safeScalarKeys = new Set([
  "id",
  "status",
  "state",
  "current",
  "phase",
  "ready",
  "healthy",
  "slug",
  "name",
  "domainName",
  "hostname",
  "lifecycleStatus",
  "archivedAt",
  "createdAt",
  "finishedAt",
]);

function safeSummary(value: unknown): Readonly<Record<string, string | number | boolean>> {
  if (!isRecord(value)) return { observed: true };
  const summary: Record<string, string | number | boolean> = {};
  for (const key of safeScalarKeys) {
    const candidate = value[key];
    if (
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean"
    ) {
      summary[key] = candidate;
    }
  }
  if (Array.isArray(value.items)) {
    summary.itemCount = value.items.length;
    const statuses = value.items
      .filter(isRecord)
      .map((item) => item.status)
      .filter((status): status is string => typeof status === "string");
    if (statuses.length > 0) summary.itemStatuses = [...new Set(statuses)].sort().join(",");
  }
  return Object.keys(summary).length > 0 ? summary : { observed: true };
}

function evaluate(queryName: string, value: unknown): MigrationEvidence["evaluation"] {
  const summary = safeSummary(value);
  if (queryName.includes("Backup") && summary.itemCount === 0) return "attention";
  const values = Object.entries(summary)
    .filter(([key]) =>
      ["status", "state", "current", "ready", "healthy", "itemStatuses"].includes(key),
    )
    .map(([, candidate]) => candidate);
  if (values.some((candidate) => candidate === false)) return "attention";
  const statuses = values.flatMap((candidate) =>
    typeof candidate === "string" ? candidate.split(",") : [],
  );
  if (
    statuses.some((status) =>
      ["failed", "error", "unhealthy", "not-ready", "degraded", "cancelled"].includes(
        status.toLowerCase(),
      ),
    )
  ) {
    return "attention";
  }
  if (values.length > 0) return "passed";
  return "observed";
}

async function collectEvidence(
  plannedQueries: readonly PlannedQuery[],
  dispatcher: MigrationQueryDispatcher,
): Promise<MigrationEvidence[]> {
  const evidence: MigrationEvidence[] = [];
  for (const planned of plannedQueries) {
    const result = await dispatcher.execute(planned.query);
    if (result.isErr()) {
      const absent = result.error.code === "not_found";
      evidence.push({
        stepId: planned.step.id,
        operationKey: planned.step.operationKey,
        queryName: planned.query.constructor.name,
        state: absent ? "absent" : "unavailable",
        evaluation: absent ? "attention" : "unavailable",
        summary: {},
        errorCode: result.error.code,
      });
      continue;
    }
    evidence.push({
      stepId: planned.step.id,
      operationKey: planned.step.operationKey,
      queryName: planned.query.constructor.name,
      state: "available",
      evaluation: evaluate(planned.query.constructor.name, result.value),
      summary: safeSummary(result.value),
    });
  }
  return evidence;
}

function validateReadback(input: MigrationReadbackInput): Result<void> {
  if (input.receipts.length === 0) {
    return err(
      domainError.validation("Migration readback requires at least one receipt", {
        phase: "migration-readback-validation",
      }),
    );
  }
  return validateMigrationReceipts(input.plan, input.receipts);
}

export async function readMigrationStatus(
  input: MigrationReadbackInput,
): Promise<Result<MigrationStatusResult>> {
  const valid = validateReadback(input);
  if (valid.isErr()) return err(valid.error);
  const outputs = new Map(input.receipts.map((receipt) => [receipt.stepId, receipt.output]));
  const plannedQueries: PlannedQuery[] = [];
  for (const receipt of input.receipts) {
    const step = input.plan.steps.find((candidate) => candidate.id === receipt.stepId);
    if (!step) continue;
    const query = statusQueryFor(step, receipt, outputs);
    if (query.isErr()) return err(query.error);
    plannedQueries.push({ query: query.value, step });
  }
  const evidence = await collectEvidence(plannedQueries, input.queryDispatcher);
  const completed = new Set(input.receipts.map((receipt) => receipt.stepId));
  const pendingStepIds = input.plan.steps
    .filter((step) => !completed.has(step.id))
    .map((step) => step.id);
  const unavailable = evidence.some((item) => item.state === "unavailable");
  return ok({
    protocol: "platform-migration/v1",
    planDigest: input.plan.planDigest,
    state: unavailable ? "unavailable" : pendingStepIds.length === 0 ? "complete" : "partial",
    completedStepIds: [...completed],
    pendingStepIds,
    evidence,
  });
}

export async function verifyMigrationOutcome(
  input: MigrationReadbackInput,
): Promise<Result<MigrationVerificationResult>> {
  const valid = validateReadback(input);
  if (valid.isErr()) return err(valid.error);
  const outputs = new Map(input.receipts.map((receipt) => [receipt.stepId, receipt.output]));
  const plannedQueries: PlannedQuery[] = [];
  for (const receipt of input.receipts) {
    const step = input.plan.steps.find((candidate) => candidate.id === receipt.stepId);
    if (!step) continue;
    const queries = verificationQueriesFor(step, receipt, outputs);
    if (queries.isErr()) return err(queries.error);
    plannedQueries.push(...queries.value.map((query) => ({ query, step })));
  }
  const evidence = await collectEvidence(plannedQueries, input.queryDispatcher);
  const unavailable = evidence.some((item) => item.evaluation === "unavailable");
  const attention = evidence.some((item) => item.evaluation === "attention");
  return ok({
    protocol: "platform-migration/v1",
    planDigest: input.plan.planDigest,
    state: evidence.length === 0 || unavailable ? "incomplete" : attention ? "attention" : "passed",
    evidence,
  });
}
