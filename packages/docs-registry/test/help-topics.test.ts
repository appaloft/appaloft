import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findPublicDocsErrorGuide,
  publicDocsErrorGuides,
  publicDocsHelpTopics,
  publicDocsLocales,
  resolvePublicDocsErrorAgentGuideHref,
  resolvePublicDocsErrorKnowledge,
  resolvePublicDocsHelpHref,
} from "../src";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const docsContentRoot = resolve(repositoryRoot, "apps/docs/src/content/docs");

function docsSourcePath(page: string): string {
  return resolve(docsContentRoot, `${page.replace(/^\/+|\/+$/g, "")}.md`);
}

describe("public docs help registry", () => {
  const scheduledWorkerConfigKeys = [
    "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED",
    "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_INTERVAL_SECONDS",
    "APPALOFT_CERTIFICATE_RETRY_DEFAULT_DELAY_SECONDS",
    "APPALOFT_CERTIFICATE_RETRY_SCHEDULER_BATCH_SIZE",
    "APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED",
    "APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS",
    "APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE",
    "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED",
    "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS",
    "APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE",
    "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED",
    "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS",
    "APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_BATCH_SIZE",
    "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED",
    "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_INTERVAL_SECONDS",
    "APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_BATCH_SIZE",
    "APPALOFT_RUNTIME_MONITORING_RAW_RETENTION_HOURS",
    "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED",
    "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_INTERVAL_SECONDS",
    "APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_BATCH_SIZE",
    "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED",
    "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_INTERVAL_SECONDS",
    "APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_BATCH_SIZE",
  ];

  test("[PUB-DOCS-003] help topics use explicit stable public docs anchors", () => {
    const ids = new Set<string>();

    for (const topic of Object.values(publicDocsHelpTopics)) {
      expect(topic.id).toMatch(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
      expect(ids.has(topic.id)).toBe(false);
      ids.add(topic.id);
      expect(topic.anchor).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/);
      expect(topic.anchor).not.toContain(" ");
      expect(topic.surfaces.length).toBeGreaterThan(0);
      expect(topic.aliases.length).toBeGreaterThan(0);
    }
  });

  test("[PUB-DOCS-005] registered help topics resolve to locale docs source and anchors", () => {
    for (const topic of Object.values(publicDocsHelpTopics)) {
      for (const locale of publicDocsLocales) {
        const sourcePath = docsSourcePath(topic.page[locale]);

        expect(existsSync(sourcePath), `${topic.id} ${locale} page exists`).toBe(true);
        expect(readFileSync(sourcePath, "utf8")).toContain(`id="${topic.anchor}"`);
      }
    }
  });

  test("[PUB-DOCS-005] help hrefs stay under /docs and preserve locale routing", () => {
    expect(resolvePublicDocsHelpHref("deployment.source")).toBe(
      "/docs/deploy/sources/#deployment-source",
    );
    expect(resolvePublicDocsHelpHref("default-access.policy")).toBe(
      "/docs/access/generated-routes/#default-access-policy",
    );
    expect(resolvePublicDocsHelpHref("deployment.source", { locale: "en-US" })).toBe(
      "/docs/en/deploy/sources/#deployment-source",
    );
    expect(resolvePublicDocsHelpHref("deployment.source", { basePath: "help" })).toBe(
      "/help/deploy/sources/#deployment-source",
    );
  });

  test("[TS-SDK-DOCS-001] TypeScript SDK help resolves to the SDK reference", () => {
    const topic = publicDocsHelpTopics["typescript-sdk.operation-client"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/reference/typescript-sdk/#typescript-sdk-operation-client",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/reference/typescript-sdk/#typescript-sdk-operation-client",
    );
    expect(topic.surfaces).toEqual(expect.arrayContaining(["http-api", "mcp"]));
    expect(topic.aliases).toEqual(expect.arrayContaining(["typescript sdk", "typed errors"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-046-typescript-sdk-interface-parity.md",
        "docs/specs/052-typescript-sdk-interface-parity/spec.md",
        "docs/testing/typescript-sdk-interface-parity-test-matrix.md",
      ]),
    );
  });

  test("[AGENT-DEPLOY-SKILL-003] agent deploy skill resolves to public docs and governing source", () => {
    const topic = publicDocsHelpTopics["agent.deploy-skill"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/agent/deploy-skill/#agent-deploy-skill",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/agent/deploy-skill/#agent-deploy-skill",
    );
    expect(topic.relatedOperation).toBe("deployments.create");
    expect(topic.surfaces).toEqual(
      expect.arrayContaining(["cli", "http-api", "repository-config", "mcp"]),
    );
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/071-url-first-deployment-entry-experience/spec.md",
        "docs/specs/072-appaloft-agent-deploy-skill/spec.md",
        "docs/agent/appaloft-deploy-skill.md",
        "packages/skills/package.json",
      ]),
    );
  });

  test("[PUB-DOCS-016] traceable topics point to spec files and product surfaces", () => {
    const defaultAccessTopic = publicDocsHelpTopics["default-access.policy"];

    expect(defaultAccessTopic.relatedOperation).toBe("default-access-domain-policies.configure");
    expect(defaultAccessTopic.webSurfaces?.join("\n")).toContain(
      "apps/web/src/routes/servers/+page.svelte",
    );

    for (const topic of Object.values(publicDocsHelpTopics)) {
      for (const specReference of topic.specReferences ?? []) {
        expect(existsSync(resolve(repositoryRoot, specReference)), specReference).toBe(true);
      }

      for (const webSurface of topic.webSurfaces ?? []) {
        expect(webSurface.trim().length, topic.id).toBeGreaterThan(0);
      }
    }
  });

  test("[RUNTIME-CTRL-DOCS-001] runtime-control help topics resolve to stable anchors", () => {
    const runtimeControlsTopic = publicDocsHelpTopics["resource.runtime-controls"];
    const restartVsRedeployTopic = publicDocsHelpTopics["resource.runtime-restart-vs-redeploy"];
    const blockedStartTopic = publicDocsHelpTopics["resource.runtime-control-blocked-start"];
    const testMatrix = readFileSync(
      resolve(repositoryRoot, "docs/testing/resource-runtime-controls-test-matrix.md"),
      "utf8",
    );

    expect(resolvePublicDocsHelpHref(runtimeControlsTopic.id)).toBe(
      "/docs/observe/logs-health/#resource-runtime-controls",
    );
    expect(resolvePublicDocsHelpHref(restartVsRedeployTopic.id, { locale: "en-US" })).toBe(
      "/docs/en/observe/logs-health/#runtime-restart-vs-redeploy",
    );
    expect(resolvePublicDocsHelpHref(blockedStartTopic.id)).toBe(
      "/docs/observe/logs-health/#runtime-control-blocked-start",
    );
    expect(runtimeControlsTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/resources.runtime.stop.md",
        "docs/commands/resources.runtime.start.md",
        "docs/commands/resources.runtime.restart.md",
        "docs/errors/resource-runtime-controls.md",
      ]),
    );
    expect(testMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(testMatrix).toContain("local-shell/generic-SSH Docker adapter mapping");
    expect(testMatrix).not.toContain("real adapter deferred");
    expect(testMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
  });

  test("[RES-PROFILE-DRIFT-005] profile drift help topic resolves to public troubleshooting docs", () => {
    const topic = publicDocsHelpTopics["resource.profile-drift"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/resources/profiles/source-runtime/#resource-profile-drift",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/resources/profiles/source-runtime/#resource-profile-drift",
    );
    expect(topic.relatedOperation).toBe("resources.show");
    expect(topic.surfaces).toEqual(
      expect.arrayContaining(["web", "cli", "http-api", "repository-config", "mcp"]),
    );
    expect(topic.aliases).toEqual(expect.arrayContaining(["resource_profile_drift"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/011-resource-profile-drift-visibility/spec.md",
        "docs/testing/resource-profile-lifecycle-test-matrix.md",
        "docs/testing/deployment-config-file-test-matrix.md",
      ]),
    );
  });

  test("[DEP-BIND-RUNTIME-INJECT-003] dependency runtime injection help resolves to stable anchors", () => {
    const lifecycleTopic = publicDocsHelpTopics["dependency.resource-lifecycle"];
    const backupTopic = publicDocsHelpTopics["dependency.backup-restore"];
    const runtimeTopic = publicDocsHelpTopics["dependency.runtime-injection"];

    expect(resolvePublicDocsHelpHref(lifecycleTopic.id)).toBe(
      "/docs/resources/dependencies/#dependency-resource-lifecycle",
    );
    expect(resolvePublicDocsHelpHref(runtimeTopic.id)).toBe(
      "/docs/resources/dependencies/#dependency-runtime-injection",
    );
    expect(resolvePublicDocsHelpHref(runtimeTopic.id, { locale: "en-US" })).toBe(
      "/docs/en/resources/dependencies/#dependency-runtime-injection",
    );
    expect(resolvePublicDocsHelpHref(backupTopic.id)).toBe(
      "/docs/resources/dependencies/#dependency-backup-restore",
    );
    expect(resolvePublicDocsHelpHref(backupTopic.id, { locale: "en-US" })).toBe(
      "/docs/en/resources/dependencies/#dependency-backup-restore",
    );
    expect(backupTopic.relatedOperation).toBe("dependency-resources.create-backup");
    expect(backupTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/039-dependency-resource-backup-restore/spec.md",
        "docs/decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md",
        "docs/commands/dependency-resources.create-backup.md",
        "docs/commands/dependency-resources.restore-backup.md",
      ]),
    );
    expect(runtimeTopic.surfaces).toEqual(
      expect.arrayContaining(["web", "cli", "http-api", "mcp"]),
    );
    expect(runtimeTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/047-dependency-binding-runtime-injection/spec.md",
        "docs/decisions/ADR-040-dependency-binding-runtime-injection-boundary.md",
        "docs/queries/deployments.plan.md",
        "docs/queries/deployments.show.md",
      ]),
    );
  });

  test("[SWARM-TARGET-DOCS-001] Swarm runtime target help resolves to server docs", () => {
    const topic = publicDocsHelpTopics["server.docker-swarm-target"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/servers/register-connect/#docker-swarm-runtime-target",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/servers/register-connect/#docker-swarm-runtime-target",
    );
    expect(topic.surfaces).toEqual(
      expect.arrayContaining(["web", "cli", "http-api", "repository-config", "mcp"]),
    );
    expect(topic.aliases).toEqual(
      expect.arrayContaining([
        "docker swarm",
        "orchestrator cluster",
        "runtime_target_unsupported",
      ]),
    );
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/045-docker-swarm-runtime-target/spec.md",
        "docs/testing/docker-swarm-runtime-target-test-matrix.md",
      ]),
    );
  });

  test("[SWARM-TARGET-DOCS-001] deployment source-of-truth docs treat Swarm as active", () => {
    const source = [
      "docs/commands/deployments.create.md",
      "docs/workflows/deployments.create.md",
      "docs/DOMAIN_MODEL.md",
    ]
      .map((path) => readFileSync(resolve(repositoryRoot, path), "utf8"))
      .join("\n");

    expect(source).toContain("Docker Swarm is the active");
    expect(source).not.toContain("Docker Swarm and Kubernetes are future");
    expect(source).not.toContain("| Docker Swarm cluster | Future backend");
    expect(source).not.toContain("future: Docker Swarm backend");
    expect(source).not.toContain("selection remains single-server");
  });

  test("[SCHED-TASK-DOCS-001] scheduled task help resolves to resource docs", () => {
    const topic = publicDocsHelpTopics["scheduled-task.resource-lifecycle"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/resources/scheduled-tasks/#scheduled-task-resource-lifecycle",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/resources/scheduled-tasks/#scheduled-task-resource-lifecycle",
    );
    expect(topic.surfaces).toEqual(expect.arrayContaining(["cli", "http-api", "mcp"]));
    expect(topic.aliases).toEqual(expect.arrayContaining(["scheduled task", "cron"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-039-scheduled-task-resource-ownership.md",
        "docs/specs/044-scheduled-task-resource-shape/spec.md",
        "docs/testing/scheduled-task-resource-test-matrix.md",
      ]),
    );
  });

  test("[PREVIEW-DOCS-001] preview deployment help resolves to preview docs", () => {
    const actionTopic = publicDocsHelpTopics["deployment.pr-preview-action"];
    const productGradeTopic = publicDocsHelpTopics["deployment.product-grade-previews"];

    expect(resolvePublicDocsHelpHref(actionTopic.id)).toBe(
      "/docs/deploy/previews/#deployment-pr-preview-action-workflow",
    );
    expect(resolvePublicDocsHelpHref(actionTopic.id, { locale: "en-US" })).toBe(
      "/docs/en/deploy/previews/#deployment-pr-preview-action-workflow",
    );
    expect(resolvePublicDocsHelpHref(productGradeTopic.id)).toBe(
      "/docs/deploy/previews/#product-grade-preview-deployments",
    );
    expect(productGradeTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/046-product-grade-preview-deployments/spec.md",
        "docs/testing/product-grade-preview-deployments-test-matrix.md",
      ]),
    );
    expect(actionTopic.aliases).toEqual(expect.arrayContaining(["deploy-action", "preview-url"]));
  });

  test("[ERROR-KNOWLEDGE-002] public error guides resolve docs, agent guide, and remedies", () => {
    const guide = findPublicDocsErrorGuide({
      code: "infra_error",
      phase: "remote-state-lock",
    });

    expect(guide?.id).toBe("infra_error.remote-state-lock");
    expect(guide?.responsibility).toBe("operator");
    expect(guide?.actionability).toBe("run-diagnostic");

    const knowledge = resolvePublicDocsErrorKnowledge("infra_error.remote-state-lock");

    expect(knowledge.links?.some((link) => link.rel === "human-doc")).toBe(true);
    expect(knowledge.links?.some((link) => link.rel === "llm-guide")).toBe(true);
    expect(knowledge.remedies?.some((remedy) => remedy.safeByDefault)).toBe(true);
    expect(knowledge.remedies?.some((remedy) => remedy.kind === "command")).toBe(true);
    expect(
      existsSync(resolve(repositoryRoot, ".github/workflows/remote-state-maintenance.yml")),
    ).toBe(true);
  });

  test("[RUNTIME-CAPACITY-INSPECT-001] capacity exhaustion errors point to read-only inspect", () => {
    const guide = findPublicDocsErrorGuide({
      code: "runtime_target_resource_exhausted",
    });
    const capacityMatrix = readFileSync(
      resolve(repositoryRoot, "docs/testing/runtime-target-capacity-test-matrix.md"),
      "utf8",
    );
    const createMatrix = readFileSync(
      resolve(repositoryRoot, "docs/testing/deployments.create-test-matrix.md"),
      "utf8",
    );
    const createCommandSpec = readFileSync(
      resolve(repositoryRoot, "docs/commands/deployments.create.md"),
      "utf8",
    );
    const createWorkflow = readFileSync(
      resolve(repositoryRoot, "docs/workflows/deployments.create.md"),
      "utf8",
    );
    const createErrorSpec = readFileSync(
      resolve(repositoryRoot, "docs/errors/deployments.create.md"),
      "utf8",
    );
    const recoveryReadinessPlan = readFileSync(
      resolve(repositoryRoot, "docs/specs/012-deployment-recovery-readiness/plan.md"),
      "utf8",
    );
    const capacityPruneSpec = readFileSync(
      resolve(repositoryRoot, "docs/commands/servers.capacity.prune.md"),
      "utf8",
    );
    const roadmap = readFileSync(resolve(repositoryRoot, "docs/PRODUCT_ROADMAP.md"), "utf8");

    expect(guide?.topicId).toBe("diagnostics.runtime-target-capacity");

    const knowledge = resolvePublicDocsErrorKnowledge("runtime_target_resource_exhausted");

    expect(knowledge.actionability).toBe("run-diagnostic");
    expect(knowledge.remedies?.some((remedy) => remedy.kind === "diagnostic")).toBe(true);
    expect(
      knowledge.remedies?.some((remedy) =>
        remedy.command?.join(" ").includes("server capacity inspect"),
      ),
    ).toBe(true);
    expect(
      knowledge.remedies?.some((remedy) => remedy.command?.join(" ").includes("work list")),
    ).toBe(true);
    expect(capacityMatrix).toContain("GitHub Actions + local explicit real local target prune");
    expect(capacityMatrix).toContain(
      "GitHub Actions secret-gated + local explicit real generic-SSH target prune",
    );
    expect(capacityMatrix).toContain(".github/workflows/capacity-prune-e2e.yml");
    expect(capacityMatrix).toContain("Release dispatch can require SSH evidence");
    expect(capacityMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(capacityMatrix).not.toContain("## Current Gaps");
    expect(capacityMatrix).not.toContain("publication remains deferred");
    expect(createMatrix).toContain("runtime_target_resource_exhausted");
    expect(createMatrix).toContain(".github/workflows/capacity-prune-e2e.yml");
    expect(createMatrix).toContain("GitHub Actions + local explicit Docker e2e");
    expect(createMatrix).toContain("GitHub Actions secret-gated + local explicit SSH e2e");
    expect(createCommandSpec.replace(/\s+/g, " ")).toContain(
      "GitHub Actions Docker/SSH smoke gates",
    );
    expect(createErrorSpec).toContain("synthetic capacity-signal classification");
    expect(createErrorSpec).toContain("GitHub Actions/local explicit");
    expect(createErrorSpec).toContain("capacity-prune gate");
    expect(createCommandSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(createWorkflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(createErrorSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(createMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(capacityPruneSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(roadmap).toContain(
      "[x] Runtime artifact/instance: capacity diagnostics, cleanup/prune, preview artifact cleanup, and",
    );
    expect(roadmap).not.toContain(
      "[ ] Runtime artifact/instance: capacity diagnostics, cleanup/prune, preview artifact cleanup, and",
    );
    expect(recoveryReadinessPlan).toContain("Risks And Governed Follow-Ups");
    expect(recoveryReadinessPlan).toContain(
      "`deployments.create` acceptance-first hardening is governed",
    );
    expect(createMatrix).not.toContain("Real target exhaustion remains an opt-in");
    expect(createMatrix).not.toContain("DEP-CREATE-ASYNC-019 | integration, opt-in");
    expect(createMatrix).not.toContain("GitHub Actions + local opt-in");
    expect(createMatrix).not.toContain("GitHub Actions secret-gated + local opt-in");
    expect(createMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(createCommandSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(createWorkflow).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(createCommandSpec).not.toContain("accepted candidates:");
    expect(createCommandSpec).not.toContain("opt-in Docker/SSH smoke gates");
    expect(createErrorSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(capacityPruneSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(createErrorSpec).not.toContain("Real target exhaustion remains an opt-in");
    expect(createErrorSpec).not.toContain("opt-in Docker/SSH smoke gate");
    expect(recoveryReadinessPlan).not.toContain("Risks And Migration Gaps");
    expect(recoveryReadinessPlan).not.toContain("acceptance-first migration gaps");
  });

  test("[RT-CAP-SCHED-007][PUB-DOCS-005] scheduled runtime prune policy help resolves to diagnostics docs", () => {
    const topic = publicDocsHelpTopics["diagnostics.scheduled-runtime-prune-policy"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/observe/diagnostics/#scheduled-runtime-prune-policy",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/observe/diagnostics/#scheduled-runtime-prune-policy",
    );
    expect(topic.relatedOperation).toBe("scheduled-runtime-prune-policies.configure");
    expect(topic.surfaces).toEqual(expect.arrayContaining(["cli", "http-api", "mcp"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-055-scheduled-runtime-prune-automation.md",
        "docs/specs/061-scheduled-runtime-prune-automation/spec.md",
        "docs/testing/runtime-target-capacity-test-matrix.md",
      ]),
    );
  });

  test("[SYSTEM-DIAG-004][PUB-DOCS-005] maintenance worker activation help resolves to self-hosting docs", () => {
    const topic = publicDocsHelpTopics["advanced.maintenance-workers"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/self-hosting/advanced/#maintenance-worker-activation",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/self-hosting/advanced/#maintenance-worker-activation",
    );
    expect(topic.relatedOperation).toBe("system.doctor");
    expect(topic.surfaces).toEqual(expect.arrayContaining(["web", "cli", "http-api", "mcp"]));
    expect(topic.aliases).toEqual(expect.arrayContaining(["disabled by default"]));
    expect(topic.webSurfaces?.join("\n")).toContain("apps/web/src/routes/instance/+page.svelte");
    expect(topic.specReferences).toEqual(
      expect.arrayContaining(["docs/testing/system-diagnostics-test-matrix.md"]),
    );

    for (const page of ["reference/configuration", "en/reference/configuration"]) {
      const source = readFileSync(docsSourcePath(page), "utf8");
      for (const key of scheduledWorkerConfigKeys) {
        expect(source).toContain(key);
      }
      expect(source).toContain("| `APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED` | `true` |");
      expect(source).toContain("| `APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false` |");
      expect(source).toContain(
        "| `APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED` | `false` |",
      );
      expect(source).toContain("| `APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED` | `false` |");
      expect(source).toContain("| `APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED` | `false` |");
      expect(source.includes("without starting") || source.includes("不会启动")).toBe(true);
    }

    for (const page of ["self-hosting/advanced", "en/self-hosting/advanced"]) {
      const source = readFileSync(docsSourcePath(page), "utf8");
      const normalizedSource = source.toLowerCase().replace(/\s+/g, " ");
      for (const term of [
        "certificate retry scheduler",
        "preview cleanup",
        "preview expiry cleanup",
        "scheduled task runner",
        "scheduled runtime prune",
        "scheduled history retention",
        "runtime monitoring collector",
      ]) {
        expect(normalizedSource).toContain(term);
      }
      expect(source.includes("without starting") || source.includes("不会启动")).toBe(true);
      expect(normalizedSource.includes("disabled by default") || source.includes("默认禁用")).toBe(
        true,
      );
    }

    const durableProcessSpec = readFileSync(
      resolve(repositoryRoot, "docs/specs/060-durable-process-delivery-baseline/spec.md"),
      "utf8",
    );
    const coreOperations = readFileSync(resolve(repositoryRoot, "docs/CORE_OPERATIONS.md"), "utf8");
    const roadmap = readFileSync(resolve(repositoryRoot, "docs/PRODUCT_ROADMAP.md"), "utf8");
    const operationMap = readFileSync(
      resolve(repositoryRoot, "docs/BUSINESS_OPERATION_MAP.md"),
      "utf8",
    );
    for (const source of [durableProcessSpec, coreOperations, operationMap, roadmap]) {
      expect(source).toContain("governed");
      expect(source).toMatch(/explicitly-enabled worker slices|explicit worker enablement/);
      expect(source).not.toContain("future opt-in");
      expect(source).not.toContain("must still opt in");
      expect(source).not.toContain("incremental opt-ins");
    }
  });

  test("[RT-MON-010][PUB-DOCS-005] runtime monitoring docs keep external observability handoff explicit", () => {
    const topic = publicDocsHelpTopics["diagnostics.runtime-monitoring"];

    expect(resolvePublicDocsHelpHref(topic.id)).toBe(
      "/docs/observe/diagnostics/#runtime-monitoring-samples-and-rollups",
    );
    expect(resolvePublicDocsHelpHref(topic.id, { locale: "en-US" })).toBe(
      "/docs/en/observe/diagnostics/#runtime-monitoring-samples-and-rollups",
    );
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-063-runtime-monitoring-observation-boundary.md",
        "docs/testing/runtime-monitoring-observation-test-matrix.md",
      ]),
    );

    for (const page of [topic.page["zh-CN"], topic.page["en-US"]]) {
      const source = readFileSync(docsSourcePath(page), "utf8");
      expect(source).toContain('id="external-observability-handoff"');
      expect(source).toMatch(/Prometheus|PromQL/);
      expect(source).toMatch(/APM|tracing|trace/);
      expect(source).toMatch(/custom metric|custom metrics|自定义指标/);
    }

    const monitoringSpec = readFileSync(
      resolve(repositoryRoot, "docs/specs/069-runtime-monitoring-observation-boundary/spec.md"),
      "utf8",
    );
    const monitoringPlan = readFileSync(
      resolve(repositoryRoot, "docs/specs/069-runtime-monitoring-observation-boundary/plan.md"),
      "utf8",
    );
    expect(monitoringSpec).toContain("Web Monitor composes them into the current observation loop");
    expect(monitoringSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(monitoringSpec).not.toContain("not yet composed into one monitoring loop");
    expect(monitoringSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(monitoringPlan).toContain("External observability handoff is implemented");
    expect(monitoringPlan).not.toContain("External observability handoff is not implemented");
  });

  test("[ERROR-KNOWLEDGE-004] public error guides point to existing agent-readable assets", () => {
    for (const guide of Object.values(publicDocsErrorGuides)) {
      const agentHref = resolvePublicDocsErrorAgentGuideHref(guide.id);
      const assetPath = resolve(
        repositoryRoot,
        "apps/docs/public",
        agentHref.replace(/^\/docs\//, ""),
      );

      expect(existsSync(assetPath), `${guide.id} agent guide exists`).toBe(true);

      for (const specReference of guide.specReferences) {
        expect(existsSync(resolve(repositoryRoot, specReference)), specReference).toBe(true);
      }
    }
  });
});
