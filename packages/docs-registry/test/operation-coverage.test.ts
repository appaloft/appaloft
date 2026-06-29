import { describe, expect, test } from "bun:test";

import { operationCatalog } from "../../application/src/operation-catalog";
import {
  getPublicDocsOperationCoverage,
  publicDocsHelpTopics,
  publicDocsOperationCoverage,
} from "../src";

describe("public docs operation coverage", () => {
  function requireCatalogOperation(operationKey: string) {
    const operation = operationCatalog.find((entry) => entry.key === operationKey);
    expect(operation, operationKey).toBeDefined();
    return operation;
  }

  test("[PUB-DOCS-002] every operation catalog entry has exactly one public docs coverage decision", () => {
    const catalogKeys = operationCatalog.map((operation) => operation.key);
    const coverageKeys = publicDocsOperationCoverage.map((coverage) => coverage.operationKey);

    expect(new Set(catalogKeys).size, "operation catalog keys are unique").toBe(catalogKeys.length);
    expect(new Set(coverageKeys).size, "public docs coverage keys are unique").toBe(
      coverageKeys.length,
    );
    expect(coverageKeys.toSorted()).toEqual(catalogKeys.toSorted());

    for (const operationKey of catalogKeys) {
      expect(getPublicDocsOperationCoverage(operationKey), operationKey).toBeDefined();
    }
  });

  test("[PUB-DOCS-002] documented operations point at registered help topics", () => {
    for (const coverage of publicDocsOperationCoverage) {
      expect(coverage.operationKey).toMatch(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);

      if (coverage.status === "documented") {
        expect(publicDocsHelpTopics[coverage.topicId], coverage.operationKey).toBeDefined();
        continue;
      }

      if (coverage.status === "migration-gap") {
        expect(coverage.reason.trim().length, coverage.operationKey).toBeGreaterThan(0);
        expect(Boolean(coverage.targetTopicId || coverage.targetPage), coverage.operationKey).toBe(
          true,
        );

        if (coverage.targetTopicId) {
          expect(publicDocsHelpTopics[coverage.targetTopicId], coverage.operationKey).toBeDefined();
        }
        continue;
      }

      expect(coverage.reason.trim().length, coverage.operationKey).toBeGreaterThan(0);
    }
  });

  test("[PROJ-LIFE-ENTRY-004] project lifecycle operations record docs coverage", () => {
    const topic = publicDocsHelpTopics["project.lifecycle"];

    expect(getPublicDocsOperationCoverage("projects.show")).toMatchObject({
      operationKey: "projects.show",
      status: "documented",
      topicId: "project.lifecycle",
    });
    expect(getPublicDocsOperationCoverage("projects.rename")).toMatchObject({
      operationKey: "projects.rename",
      status: "documented",
      topicId: "project.lifecycle",
    });
    expect(getPublicDocsOperationCoverage("projects.reorder")).toMatchObject({
      operationKey: "projects.reorder",
      status: "documented",
      topicId: "project.lifecycle",
    });
    expect(getPublicDocsOperationCoverage("projects.archive")).toMatchObject({
      operationKey: "projects.archive",
      status: "documented",
      topicId: "project.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/project-lifecycle.md",
        "docs/queries/projects.show.md",
        "docs/commands/projects.rename.md",
        "docs/commands/projects.reorder.md",
        "docs/commands/projects.archive.md",
        "docs/testing/project-lifecycle-test-matrix.md",
        "docs/specs/008-project-lifecycle-settings-closure/spec.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("project detail/settings");
  });

  test("[SSH-CRED-ENTRY-005] reusable SSH credential detail maps to the SSH credential help topic", () => {
    const topic = publicDocsHelpTopics["server.ssh-credential"];

    expect(topic).toBeDefined();
    expect(topic.surfaces).toEqual(expect.arrayContaining(["web", "cli", "http-api", "mcp"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/ssh-credential-lifecycle.md",
        "docs/queries/credentials.show.md",
        "docs/commands/credentials.delete-ssh.md",
        "docs/commands/credentials.rotate-ssh.md",
        "docs/errors/credentials.lifecycle.md",
        "docs/testing/ssh-credential-lifecycle-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces).toEqual(
      expect.arrayContaining([
        "apps/web server registration, Quick Deploy credential step, credential detail surfaces, saved credential destructive delete dialog, and saved credential rotation dialog",
      ]),
    );
  });

  test("[SRV-LIFE-ENTRY-012-WEB] server detail lifecycle actions record Web docs coverage", async () => {
    const topic = publicDocsHelpTopics["server.deployment-target"];
    const proxyTopic = publicDocsHelpTopics["server.proxy-readiness"];
    const workflow = await Bun.file("docs/workflows/deployment-target-lifecycle.md").text();
    const implementationPlan = await Bun.file(
      "docs/implementation/deployment-target-lifecycle-plan.md",
    ).text();

    expect(getPublicDocsOperationCoverage("servers.configure-edge-proxy")).toMatchObject({
      operationKey: "servers.configure-edge-proxy",
      status: "documented",
      topicId: "server.proxy-readiness",
    });
    expect(getPublicDocsOperationCoverage("servers.rename")).toMatchObject({
      operationKey: "servers.rename",
      status: "documented",
      topicId: "server.deployment-target",
    });
    expect(getPublicDocsOperationCoverage("servers.reorder")).toMatchObject({
      operationKey: "servers.reorder",
      status: "documented",
      topicId: "server.deployment-target",
    });
    expect(getPublicDocsOperationCoverage("servers.deactivate")).toMatchObject({
      operationKey: "servers.deactivate",
      status: "documented",
      topicId: "server.deployment-target",
    });
    expect(getPublicDocsOperationCoverage("servers.delete-check")).toMatchObject({
      operationKey: "servers.delete-check",
      status: "documented",
      topicId: "server.deployment-target",
    });
    expect(getPublicDocsOperationCoverage("servers.delete")).toMatchObject({
      operationKey: "servers.delete",
      status: "documented",
      topicId: "server.deployment-target",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/servers.rename.md",
        "docs/commands/servers.reorder.md",
        "docs/commands/servers.deactivate.md",
        "docs/commands/servers.configure-edge-proxy.md",
        "docs/queries/servers.delete-check.md",
        "docs/commands/servers.delete.md",
        "docs/testing/deployment-target-lifecycle-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("server list card reorder");
    expect(topic.webSurfaces?.join("\n")).toContain("server detail rename");
    expect(topic.webSurfaces?.join("\n")).toContain("edge proxy configuration");
    expect(topic.webSurfaces?.join("\n")).toContain("typed deactivate");
    expect(topic.webSurfaces?.join("\n")).toContain("delete safety, and typed delete confirmation");
    expect(proxyTopic.webSurfaces?.join("\n")).toContain("server edge proxy intent selector");
    expect(workflow).toContain("typed destructive delete over the shared command/query");
    expect(workflow).toContain("deactivation");
    expect(implementationPlan).toContain("Server detail Web exposes");
    expect(implementationPlan).toContain("typed deactivation");
    expect(implementationPlan).toContain("typed delete\nconfirmation");
    expect(workflow).not.toContain("Web destructive delete controls remain future work");
    expect(workflow).not.toContain("Web deactivate action UI remain future work");
    expect(workflow).not.toContain("Destructive delete action UI is deferred");
    expect(implementationPlan).not.toContain("records a named Web action migration gap");
    expect(implementationPlan).not.toContain("button as a migration gap");
    expect(implementationPlan).not.toContain("Web\ndeactivate/delete action controls");
  });

  test("[ROUTE-TLS-ENTRY-002][ROUTE-TLS-ENTRY-007] resource-scoped domain binding Web coverage is traceable", async () => {
    const bindingTopic = publicDocsHelpTopics["domain.custom-domain-binding"];
    const ownershipTopic = publicDocsHelpTopics["domain.ownership-check"];
    const testMatrix = await Bun.file("docs/testing/routing-domain-and-tls-test-matrix.md").text();
    const implementationPlan = await Bun.file(
      "docs/implementation/domain-bindings.create-plan.md",
    ).text();

    expect(getPublicDocsOperationCoverage("domain-bindings.create")).toMatchObject({
      operationKey: "domain-bindings.create",
      status: "documented",
      topicId: "domain.custom-domain-binding",
    });
    expect(getPublicDocsOperationCoverage("domain-bindings.confirm-ownership")).toMatchObject({
      operationKey: "domain-bindings.confirm-ownership",
      status: "documented",
      topicId: "domain.ownership-check",
    });
    expect(bindingTopic.webSurfaces?.join("\n")).toContain(
      "resource-scoped domain binding create form",
    );
    expect(ownershipTopic.webSurfaces?.join("\n")).toContain(
      "resource-scoped ownership confirmation action",
    );
    expect(testMatrix).toContain(
      "Resource-scoped WebView coverage now exercises `ROUTE-TLS-ENTRY-002` and `ROUTE-TLS-ENTRY-007`",
    );
    expect(implementationPlan).toContain("Resource-scoped WebView coverage now exercises");
    expect(implementationPlan).toContain("ROUTE-TLS-ENTRY-002");
    expect(implementationPlan).toContain("ROUTE-TLS-ENTRY-007");
    expect(testMatrix).not.toContain("resource-scoped browser/e2e coverage is not implemented yet");
    expect(implementationPlan).not.toContain(
      "Resource-scoped browser/e2e coverage is not implemented yet",
    );
  });

  test("[RES-DIAG-ENTRY-001] resource diagnostic copy Web coverage is traceable", async () => {
    const topic = publicDocsHelpTopics["diagnostics.safe-support-payload"];
    const testMatrix = await Bun.file(
      "docs/testing/resource-diagnostic-summary-test-matrix.md",
    ).text();
    const workflow = await Bun.file("docs/workflows/resource-diagnostic-summary.md").text();
    const plan = await Bun.file("docs/implementation/resource-diagnostic-summary-plan.md").text();

    expect(getPublicDocsOperationCoverage("resources.diagnostic-summary")).toMatchObject({
      operationKey: "resources.diagnostic-summary",
      status: "documented",
      topicId: "diagnostics.safe-support-payload",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/resource-diagnostic-summary.md",
        "docs/queries/resources.diagnostic-summary.md",
        "docs/testing/resource-diagnostic-summary-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("resource detail diagnostic copy action");
    expect(topic.webSurfaces?.join("\n")).toContain("deployment detail diagnostic copy action");
    expect(topic.webSurfaces?.join("\n")).toContain(
      "Quick Deploy completion diagnostic copy action",
    );
    expect(testMatrix).toContain("`RES-DIAG-ENTRY-001` resource-detail WebView coverage");
    expect(testMatrix).toContain("`RES-DIAG-ENTRY-002` Quick Deploy WebView coverage");
    expect(testMatrix).toContain("`RES-DIAG-ENTRY-007` deployment-detail WebView coverage");
    expect(testMatrix).toContain("`RES-DIAG-ENTRY-005` CLI summary coverage");
    expect(testMatrix).toContain("`WEB-CLI-API-ACCESS-007` browser rendering coverage");
    expect(testMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(workflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(plan).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(plan).toContain("Edge access failure diagnostics are composed into the summary");
    expect(testMatrix).not.toContain(
      "Web clipboard/e2e coverage for the resource detail affordance",
    );
    expect(testMatrix).not.toContain(
      "Full browser clipboard/e2e coverage for `WEB-CLI-API-ACCESS-006` remains deferred",
    );
    expect(testMatrix).not.toContain("Full browser route-metadata rendering remains deferred");
    expect(testMatrix).not.toContain("future Quick Deploy completion affordance");
    expect(testMatrix).not.toContain("broader Quick Deploy completion coverage remains deferred");
    expect(testMatrix).not.toContain("CLI human-readable summary mode is not implemented");
    for (const source of [testMatrix, workflow, plan]) {
      expect(source).not.toContain("Current Implementation Notes And Migration Gaps");
      expect(source).not.toContain("Remaining gaps:");
    }
    expect(plan).not.toContain("Edge access failure diagnostics are not yet composed");
  });

  test("[AGENT-DEPLOY-SKILL-001][AGENT-DEPLOY-SKILL-002] deploy skill is safe and operation-backed", async () => {
    const skill = await Bun.file("docs/agent/appaloft-deploy-skill.md").text();
    const fullSkill = await Bun.file("docs/agent/appaloft-skill.md").text();
    const packagedSkill = await Bun.file("skills/appaloft/SKILL.md").text();
    const surfaces = await Bun.file("skills/appaloft/references/surfaces.md").text();
    const cliEntrypoints = await Bun.file("skills/appaloft/references/cli-entrypoints.md").text();
    const mcpTools = await Bun.file("skills/appaloft/references/mcp-tools.md").text();
    const operationKeys = new Set(operationCatalog.map((operation) => operation.key));

    for (const operationKey of [
      "projects.create",
      "servers.register",
      "environments.create",
      "resources.create",
      "deployments.create",
    ]) {
      expect(operationKeys.has(operationKey), operationKey).toBe(true);
      expect(skill).toContain(operationKey);
    }

    expect(skill).toContain("appaloft deploy ./dist --as static-site");
    expect(fullSkill).toContain("npx skills add appaloft/appaloft");
    expect(packagedSkill).toContain("AI-facing Appaloft entrypoint");
    expect(packagedSkill).toContain("references/surfaces.md");
    expect(surfaces).toContain("CLI");
    expect(surfaces).toContain("HTTP/API");
    expect(surfaces).toContain("Web");
    expect(surfaces).toContain("MCP/tools");
    expect(surfaces).toContain("Do not suggest an Appaloft-owned npm");
    expect(mcpTools).toContain("appaloft mcp stdio");
    expect(mcpTools).toContain("appaloft mcp serve --host 127.0.0.1 --port 3939");
    expect(mcpTools).toContain("npx @appaloft/mcp");
    expect(mcpTools).toContain("operation catalog");
    expect(packagedSkill).toContain("references/mcp-tools.md");
    for (const operation of operationCatalog) {
      if (operation.transports.cli) {
        expect(cliEntrypoints).toContain(operation.transports.cli);
      }
    }
    expect(skill).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    expect(packagedSkill).not.toMatch(/-----BEGIN [A-Z ]+PRIVATE KEY-----/);
    expect(skill).not.toMatch(/(?:password|token|secret|privateKey)\s*=/i);
    expect(skill).not.toContain("Run quick-deploy.create");
    expect(packagedSkill).not.toContain("Run quick-deploy.create");
  });

  test("[OP-WORK-DOCS-001] operator work queries record read-only docs coverage", async () => {
    const listCoverage = getPublicDocsOperationCoverage("operator-work.list");
    const showCoverage = getPublicDocsOperationCoverage("operator-work.show");
    const streamCoverage = getPublicDocsOperationCoverage("operator-work.stream-events");
    const pruneCoverage = getPublicDocsOperationCoverage("operator-work.prune");
    const topic = publicDocsHelpTopics["operator.work-ledger"];

    expect(listCoverage).toMatchObject({
      operationKey: "operator-work.list",
      status: "documented",
      topicId: "operator.work-ledger",
    });
    expect(showCoverage).toMatchObject({
      operationKey: "operator-work.show",
      status: "documented",
      topicId: "operator.work-ledger",
    });
    expect(streamCoverage).toMatchObject({
      operationKey: "operator-work.stream-events",
      status: "documented",
      topicId: "operator.work-ledger",
    });
    expect(pruneCoverage).toMatchObject({
      operationKey: "operator-work.prune",
      status: "documented",
      topicId: "operator.work-ledger",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/operator-work.prune.md",
        "docs/decisions/ADR-054-durable-process-delivery-baseline.md",
        "docs/queries/operator-work.list.md",
        "docs/queries/operator-work.show.md",
        "docs/queries/operator-work.stream-events.md",
        "docs/testing/durable-process-delivery-test-matrix.md",
        "docs/testing/operator-work-ledger-test-matrix.md",
      ]),
    );
    expect(topic.description).toContain("without recovery mutations");

    const durableAdr = await Bun.file(
      "docs/decisions/ADR-054-durable-process-delivery-baseline.md",
    ).text();
    const durableSpec = await Bun.file(
      "docs/specs/060-durable-process-delivery-baseline/spec.md",
    ).text();
    const durablePlan = await Bun.file(
      "docs/specs/060-durable-process-delivery-baseline/plan.md",
    ).text();
    const durableMatrix = await Bun.file(
      "docs/testing/durable-process-delivery-test-matrix.md",
    ).text();

    for (const source of [durableAdr, durableSpec, durablePlan, durableMatrix]) {
      expect(source).toContain("process-attempt");
      expect(source).toContain("Preview cleanup");
      expect(source).toContain("claim/completion");
      expect(source).not.toContain("preview cleanup attempt store and preview-lifecycle");
      expect(source).not.toContain("candidate store and preview-lifecycle");
    }
  });

  test("[DEP-RES-DOCS-001] dependency resource and backup operations record public docs coverage", async () => {
    const lifecycleOperations = [
      "dependency-resources.provision",
      "dependency-resources.import",
      "dependency-resources.list",
      "dependency-resources.show",
      "dependency-resources.rename",
      "dependency-resources.delete",
      "resources.bind-dependency",
      "resources.unbind-dependency",
      "resources.rotate-dependency-binding-secret",
      "resources.list-dependency-bindings",
      "resources.show-dependency-binding",
    ];
    const backupOperations = [
      "dependency-resources.create-backup",
      "dependency-resources.list-backups",
      "dependency-resources.show-backup",
      "dependency-resources.restore-backup",
    ];

    for (const operationKey of lifecycleOperations) {
      requireCatalogOperation(operationKey);
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "dependency.resource-lifecycle",
      });
    }

    for (const operationKey of backupOperations) {
      requireCatalogOperation(operationKey);
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "dependency.backup-restore",
      });
    }

    expect(publicDocsHelpTopics["dependency.resource-lifecycle"].localeCoverage).toEqual({
      "zh-CN": "complete",
      "en-US": "complete",
    });
    expect(publicDocsHelpTopics["dependency.backup-restore"].localeCoverage).toEqual({
      "zh-CN": "complete",
      "en-US": "complete",
    });
    expect(publicDocsHelpTopics["dependency.resource-lifecycle"].webSurfaces?.join("\n")).toContain(
      "Resource detail dependency controls",
    );
    expect(publicDocsHelpTopics["dependency.backup-restore"].webSurfaces?.join("\n")).toContain(
      "Resource detail dependency backup/restore controls",
    );

    const sourceOfTruth = (
      await Promise.all(
        [
          "docs/CORE_OPERATIONS.md",
          "docs/workflows/dependency-resource-lifecycle.md",
          "docs/testing/dependency-resource-test-matrix.md",
          "docs/specs/038-postgres-provider-native-realization/spec.md",
          "docs/specs/038-postgres-provider-native-realization/plan.md",
          "docs/specs/039-dependency-resource-backup-restore/spec.md",
          "docs/specs/039-dependency-resource-backup-restore/plan.md",
          "docs/specs/049-redis-provider-native-realization/spec.md",
          "docs/specs/049-redis-provider-native-realization/plan.md",
          "docs/RESOURCES.md",
          "docs/PRODUCT_ROADMAP.md",
        ].map((path) => Bun.file(path).text()),
      )
    ).join("\n");
    const apiDescriptions = await Bun.file("packages/orpc/src/index.ts").text();
    const resourcesOverview = await Bun.file("docs/RESOURCES.md").text();
    const normalizedSourceOfTruth = sourceOfTruth.replace(/\s+/g, " ");
    expect(sourceOfTruth).toContain("injected provider capability");
    expect(sourceOfTruth).toContain("shell-local artifact materialization");
    expect(sourceOfTruth).toContain("shell-local realization/delete artifact materialization");
    expect(resourcesOverview).toContain("Appaloft-managed dependency provisioning");
    expect(resourcesOverview).toContain(
      "dependency backup create/list/show and acknowledged in-place restore",
    );
    expect(resourcesOverview).toContain("Governed Extensions");
    expect(resourcesOverview).not.toContain("Planned but not yet implemented");
    expect(resourcesOverview).not.toContain(
      "provider-backed resource provisioning context is implemented",
    );
    expect(resourcesOverview).not.toContain("Expected future commands");
    expect(normalizedSourceOfTruth).toContain("separate governed extensions");
    expect(normalizedSourceOfTruth).toContain("separate governed worker slice");
    expect(sourceOfTruth).not.toContain("hermetic provider capability");
    expect(sourceOfTruth).not.toContain("hermetic provider capabilities");
    expect(sourceOfTruth).not.toContain("hermetic managed Redis provider capability");
    expect(sourceOfTruth).not.toContain("hermetic managed Postgres provider capability");
    expect(sourceOfTruth).not.toContain("hermetic backup/restore provider capability");
    expect(sourceOfTruth).not.toContain("hermetic fake provider");
    expect(sourceOfTruth).not.toContain("synchronous hermetic provider");
    expect(apiDescriptions).toContain(
      "Provisions an Appaloft-managed dependency resource of the requested kind through the configured provider capability.",
    );
    expect(apiDescriptions).not.toContain(
      "without creating provider-native database infrastructure",
    );
    expect(apiDescriptions).not.toContain("without creating provider-native Redis infrastructure");
    expect(sourceOfTruth).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(sourceOfTruth).not.toContain("governed future work");
    expect(sourceOfTruth).not.toContain("governed future worker slice");
  });

  test("[STOR-WEB-001][STOR-WEB-002][STOR-WEB-003] storage volume docs record runtime cleanup and Web closure", async () => {
    for (const operationKey of [
      "storage-volumes.create",
      "storage-volumes.list",
      "storage-volumes.show",
      "storage-volumes.rename",
      "storage-volumes.delete",
      "storage-volumes.cleanup-runtime",
      "resources.attach-storage",
      "resources.detach-storage",
    ] as const) {
      requireCatalogOperation(operationKey);
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "storage.volume-lifecycle",
      });
    }

    const topic = publicDocsHelpTopics["storage.volume-lifecycle"];
    const coreOperations = await Bun.file("docs/CORE_OPERATIONS.md").text();
    const matrix = await Bun.file("docs/testing/storage-volume-test-matrix.md").text();
    const runtimeSpec = await Bun.file(
      "docs/specs/070-storage-volume-runtime-realization-and-cleanup/spec.md",
    ).text();
    const lifecycleSpec = await Bun.file(
      "docs/specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md",
    ).text();
    const lifecyclePlan = await Bun.file(
      "docs/specs/032-storage-volume-lifecycle-and-resource-attachment/plan.md",
    ).text();
    const runtimePlan = await Bun.file(
      "docs/specs/070-storage-volume-runtime-realization-and-cleanup/plan.md",
    ).text();
    const runtimeAdr = await Bun.file(
      "docs/decisions/ADR-064-storage-volume-runtime-realization-and-cleanup.md",
    ).text();
    const workflow = await Bun.file("docs/workflows/storage-volume-lifecycle.md").text();
    const cleanupSpec = await Bun.file("docs/commands/storage-volumes.cleanup-runtime.md").text();
    const publicDocs = await Bun.file(
      "apps/docs/src/content/docs/en/resources/storage-volumes.md",
    ).text();
    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();

    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/testing/storage-volume-test-matrix.md",
        "docs/specs/070-storage-volume-runtime-realization-and-cleanup/spec.md",
        "docs/commands/storage-volumes.cleanup-runtime.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("dry-run-first scoped runtime cleanup");
    expect(topic.webSurfaces?.join("\n")).toContain("Docker Swarm Compose stack realization");
    expect(coreOperations).toContain("`storage-volumes.cleanup-runtime` is dry-run-first");
    expect(coreOperations).toContain("Resource detail Web controls");
    expect(matrix).toContain("STOR-CLEANUP-006");
    expect(matrix).toContain("STOR-CLEANUP-007");
    expect(matrix).toContain("GitHub Actions + local explicit real local Docker cleanup");
    expect(matrix).toContain(
      "GitHub Actions secret-gated + local explicit real generic-SSH Docker cleanup",
    );
    expect(matrix).toContain(".github/workflows/storage-cleanup-e2e.yml");
    expect(matrix).toContain("STOR-WEB-003");
    expect(matrix).toContain("Docker Swarm");
    expect(matrix).toContain("Compose stack apply plans now render bounded");
    expect(runtimeSpec).toContain("implemented for Docker runtime mount realization");
    expect(runtimeSpec).toContain("dry-run-first local/generic-SSH Docker named-volume cleanup");
    expect(runtimeSpec).toContain("Destructive cleanup requires explicit confirmation");
    expect(runtimeSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(runtimeSpec).toContain(".github/workflows/storage-cleanup-e2e.yml");
    expect(lifecyclePlan).toContain("Risks And Governed Follow-Ups");
    expect(lifecyclePlan).toContain("Storage-volume backup/restore remains a separate governed");
    expect(lifecycleSpec).toContain("governed Docs Round follow-up");
    expect(lifecycleSpec).toContain("record a governed follow-up");
    expect(runtimePlan).toContain("Risks And Governed Follow-Ups");
    expect(runtimeAdr).toContain(
      "GitHub Actions/local explicit\n  Swarm and storage-cleanup gates",
    );
    expect(runtimeAdr).toContain(
      "not part of the v1 `storage-volumes.create` provisioning boundary",
    );
    expect(workflow).toContain("GitHub Actions/local explicit Swarm and storage-cleanup gates");
    expect(workflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(workflow).toContain("not implicit\n`storage-volumes.create` behavior");
    expect(cleanupSpec).toContain("Current status: implemented for local-shell and generic-SSH");
    expect(cleanupSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(cleanupSpec).toContain("GitHub Actions/local\nexplicit Swarm and storage-cleanup gates");
    expect(publicDocs).toContain("Web can also run dry-run-first runtime cleanup");
    expect(roadmap).toContain(
      "[x] Storage volume: create/list/show/rename/delete, attach/detach, backup relationship metadata",
    );
    expect(roadmap).toContain(
      "[x] Persistent storage and databases with service binding, backup/restore, and deletion behavior.",
    );
    expect(roadmap).not.toContain(
      "[ ] Storage volume: create/list/show/update/delete, attach/detach, backup relationship.",
    );
    expect(roadmap).not.toContain(
      "[ ] Persistent storage and databases with service binding, backup/restore, and deletion behavior.",
    );
    expect(publicDocs).not.toContain("runtime cleanup is deferred");
    expect(matrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(matrix).not.toContain("provider provisioning, snapshot materialization/runtime cleanup");
    expect(matrix).not.toContain("STOR-CLEANUP-006 | opt-in real");
    expect(matrix).not.toContain("STOR-CLEANUP-007 | opt-in real");
    expect(matrix).not.toContain("Opt-in real cleanup smoke coverage");
    expect(runtimeSpec).not.toContain("Opt-in real cleanup smoke commands");
    expect(runtimeSpec).not.toContain("Destructive cleanup requires explicit opt-in");
    expect(runtimeSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(runtimePlan).not.toContain("Risks And Migration Gaps");
    expect(lifecyclePlan).not.toContain("Risks And Migration Gaps");
    expect(lifecyclePlan).not.toContain("record explicit migration gaps");
    expect(lifecyclePlan).not.toContain("actual backup execution remains Phase 7 future work");
    expect(lifecycleSpec).not.toContain("Docs Round migration gap");
    expect(lifecycleSpec).not.toContain("record a migration gap");
    expect(runtimeSpec).not.toContain("snapshot materialization/runtime cleanup deferred");
    expect(runtimeSpec).not.toContain("remain future work");
    expect(runtimeAdr).not.toContain("fixture-by-fixture Swarm Compose smoke remains opt-in");
    expect(runtimeAdr).not.toContain(
      "Provider-native storage handles beyond Docker/Compose/Swarm runtime mounts are not implemented yet",
    );
    expect(workflow).not.toContain("Opt-in real Swarm Compose storage smoke exists");
    expect(workflow).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(cleanupSpec).not.toContain(
      "real fixture-by-fixture Swarm Compose smoke is still opt-in",
    );
    expect(cleanupSpec).not.toContain(
      "storage-volume backup/restore operations are not implemented yet",
    );
    expect(cleanupSpec).not.toContain("Current Implementation Notes And Migration Gaps");
  });

  test("[DEP-BIND-SECRET-RESOLVE-007] dependency runtime injection operation map records active secret resolution", async () => {
    const operationMap = await Bun.file("docs/BUSINESS_OPERATION_MAP.md").text();
    const domainModel = await Bun.file("docs/DOMAIN_MODEL.md").text();
    const adr = await Bun.file(
      "docs/decisions/ADR-041-dependency-runtime-secret-value-resolution.md",
    ).text();
    const spec = await Bun.file(
      "docs/specs/048-dependency-runtime-secret-value-resolution/spec.md",
    ).text();
    const redisRealizationPlan = await Bun.file(
      "docs/specs/049-redis-provider-native-realization/plan.md",
    ).text();
    const tasks = await Bun.file(
      "docs/specs/048-dependency-runtime-secret-value-resolution/tasks.md",
    ).text();
    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();
    const runtimeInjectionRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Materialize dependency binding runtime environment |"));

    expect(runtimeInjectionRow).toContain("Active internal capability");
    expect(runtimeInjectionRow).toContain("Store-backed secret value resolution is implemented");
    expect(runtimeInjectionRow).toContain("imported Postgres");
    expect(runtimeInjectionRow).toContain("imported Redis");
    expect(runtimeInjectionRow).toContain("managed Postgres Appaloft-owned refs");
    expect(runtimeInjectionRow).toContain("managed Redis refs");
    expect(runtimeInjectionRow).toContain("single-server local-shell/generic-SSH runtimes");
    expect(runtimeInjectionRow).toContain("Docker Swarm");
    expect(runtimeInjectionRow).toContain("retained rotated binding refs");
    expect(runtimeInjectionRow).not.toContain("Accepted candidate");
    expect(runtimeInjectionRow).not.toContain("next Code Round");
    expect(domainModel).toContain(
      "provider-native Postgres and Redis realization/delete, backup/restore, runtime secret injection",
    );
    expect(domainModel).toContain("Postgres/Redis closed-loop verification are implemented");
    expect(domainModel).toContain(
      "provider-backed provisioning orchestration is active for Appaloft-managed Postgres and Redis",
    );
    expect(domainModel).not.toContain(
      "provider-backed provisioning orchestration is still future work",
    );
    expect(domainModel).not.toContain("final closed-loop verification are future work");
    expect(adr).toContain("Redis closed-loop verification is now covered");
    expect(adr).not.toContain("closed-loop release criteria remain open until");
    expect(spec).toContain("Round: Code Round implemented");
    expect(spec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(spec).not.toContain("Test-First and Code Rounds remain open");
    expect(spec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(redisRealizationPlan).toContain("Risks And Governed Follow-Ups");
    expect(redisRealizationPlan).not.toContain("Risks And Migration Gaps");
    expect(tasks).toContain(
      "- [x] Update `docs/PRODUCT_ROADMAP.md` after Postgres and Redis closed loops are verified.",
    );
    expect(roadmap).toContain(
      "[x] Dependency resources and bindings have Postgres/Redis provision/import, binding, backup/restore",
    );
    expect(roadmap).not.toContain(
      "[ ] Dependency resources and bindings exist in core but lack provisioning, binding, backup, and",
    );
    expect(roadmap).not.toContain("store-backed runtime secret value resolution remain open");
    expect(roadmap).not.toContain("Postgres/Redis closed-loop exit criteria remain open");
    expect(roadmap).not.toContain("Postgres closed-loop exit criterion remains open");
    expect(roadmap).not.toContain("runtime target value materialization remain open");
    expect(roadmap).not.toContain("Final Redis observe and closed-loop verification remains open");
  });

  test("[AUDIT-EVENT-EXPORT-001] audit event export records docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("audit-events.export");
    const globalCoverage = getPublicDocsOperationCoverage("audit-events.export-global");
    const holdCoverage = getPublicDocsOperationCoverage("audit-events.legal-holds.configure");
    const archiveCoverage = getPublicDocsOperationCoverage("audit-events.archives.create");
    const topic = publicDocsHelpTopics["operator.audit-events"];

    expect(coverage).toMatchObject({
      operationKey: "audit-events.export",
      status: "documented",
      topicId: "operator.audit-events",
    });
    expect(globalCoverage).toMatchObject({
      operationKey: "audit-events.export-global",
      status: "documented",
      topicId: "operator.audit-events",
    });
    expect(holdCoverage).toMatchObject({
      operationKey: "audit-events.legal-holds.configure",
      status: "documented",
      topicId: "operator.audit-events",
    });
    expect(archiveCoverage).toMatchObject({
      operationKey: "audit-events.archives.create",
      status: "documented",
      topicId: "operator.audit-events",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-056-global-audit-event-export-boundary.md",
        "docs/decisions/ADR-057-audit-event-legal-hold-boundary.md",
        "docs/decisions/ADR-058-audit-event-immutable-archive-boundary.md",
        "docs/commands/audit-events.archives.create.md",
        "docs/commands/audit-events.archives.prune.md",
        "docs/queries/audit-events.export.md",
        "docs/queries/audit-events.export-global.md",
        "docs/queries/audit-events.archives.list.md",
        "docs/queries/audit-events.archives.show.md",
        "docs/commands/audit-events.legal-holds.configure.md",
        "docs/commands/audit-events.legal-holds.release.md",
        "docs/queries/audit-events.legal-holds.list.md",
        "docs/queries/audit-events.legal-holds.show.md",
        "docs/specs/062-global-audit-event-export/spec.md",
        "docs/specs/063-audit-event-legal-hold/spec.md",
        "docs/specs/064-audit-event-immutable-archive/spec.md",
        "docs/testing/audit-event-read-surface-test-matrix.md",
      ]),
    );
    expect(topic.description).toContain("export");
  });

  test("[PROV-JOB-LOG-PRUNE-004] provider job log retention records docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("provider-job-logs.prune");
    const topic = publicDocsHelpTopics["operator.provider-job-logs"];

    expect(coverage).toMatchObject({
      operationKey: "provider-job-logs.prune",
      status: "documented",
      topicId: "operator.provider-job-logs",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/provider-job-logs.prune.md",
        "docs/testing/provider-job-log-retention-test-matrix.md",
        "docs/specs/057-provider-job-log-retention/spec.md",
        "docs/decisions/ADR-049-provider-job-log-retention-policy.md",
      ]),
    );
    expect(topic.description).toContain("without deleting deployment rows");
  });

  test("[DOMAIN-EVENT-RETENTION-004] domain event retention records docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("domain-events.prune");
    const topic = publicDocsHelpTopics["operator.domain-events"];

    expect(coverage).toMatchObject({
      operationKey: "domain-events.prune",
      status: "documented",
      topicId: "operator.domain-events",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/domain-events.prune.md",
        "docs/testing/domain-event-stream-retention-test-matrix.md",
        "docs/specs/065-domain-event-stream-retention/spec.md",
        "docs/decisions/ADR-059-domain-event-stream-retention-boundary.md",
      ]),
    );
    expect(topic.description).toContain("without deleting deployments");
  });

  test("[DEP-TIMELINE-006] deployment timeline records docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("deployments.timeline");
    const topic = publicDocsHelpTopics["deployment.lifecycle"];

    expect(coverage).toMatchObject({
      operationKey: "deployments.timeline",
      status: "documented",
      topicId: "deployment.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/queries/deployments.timeline.md",
        "docs/testing/deployment-timeline-journal-test-matrix.md",
        "docs/specs/095-deployment-timeline-journal/spec.md",
        "docs/decisions/ADR-084-deployment-timeline-journal-boundary.md",
      ]),
    );
    expect(topic.description).toContain("Detect, plan, execute, verify, and rollback");
  });

  test("[SYSTEM-DIAG-DOCS-001] system diagnostics operations record safe docs coverage", async () => {
    const providerCoverage = getPublicDocsOperationCoverage("system.providers.list");
    const pluginCoverage = getPublicDocsOperationCoverage("system.plugins.list");
    const integrationCoverage = getPublicDocsOperationCoverage("system.integrations.list");
    const providerTopic = publicDocsHelpTopics["advanced.provider-boundary"];
    const pluginTopic = publicDocsHelpTopics["advanced.plugin-boundary"];

    expect(providerCoverage).toMatchObject({
      operationKey: "system.providers.list",
      status: "documented",
      topicId: "advanced.provider-boundary",
    });
    expect(pluginCoverage).toMatchObject({
      operationKey: "system.plugins.list",
      status: "documented",
      topicId: "advanced.plugin-boundary",
    });
    expect(integrationCoverage).toMatchObject({
      operationKey: "system.integrations.list",
      status: "documented",
      topicId: "deployment.source",
    });
    expect(providerTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/PROVIDERS.md",
        "docs/testing/system-diagnostics-test-matrix.md",
      ]),
    );
    expect(pluginTopic.specReferences).toEqual(
      expect.arrayContaining(["docs/PLUGINS.md", "docs/testing/system-diagnostics-test-matrix.md"]),
    );
    expect(providerTopic.description).toContain("configuration diagnostics");
    expect(pluginTopic.aliases).toEqual(expect.arrayContaining(["configuration diagnostics"]));
    expect(getPublicDocsOperationCoverage("system.doctor")).toMatchObject({
      operationKey: "system.doctor",
      status: "documented",
      topicId: "advanced.maintenance-workers",
    });
    const maintenanceTopic = publicDocsHelpTopics["advanced.maintenance-workers"];
    const diagnosticsMatrix = await Bun.file(
      "docs/testing/system-diagnostics-test-matrix.md",
    ).text();
    const advancedDocs = await Bun.file(
      "apps/docs/src/content/docs/en/self-hosting/advanced.md",
    ).text();
    const configDocs = await Bun.file(
      "apps/docs/src/content/docs/en/reference/configuration.md",
    ).text();
    const zhConfigDocs = await Bun.file(
      "apps/docs/src/content/docs/reference/configuration.md",
    ).text();
    const maintenanceWorkerStatusReader = await Bun.file(
      "apps/shell/src/maintenance-worker-status-reader.ts",
    ).text();
    const domainModel = await Bun.file("docs/DOMAIN_MODEL.md").text();
    const scheduledRuntimePrunePlan = await Bun.file(
      "docs/specs/061-scheduled-runtime-prune-automation/plan.md",
    ).text();
    const scheduledRuntimePruneSpec = await Bun.file(
      "docs/specs/061-scheduled-runtime-prune-automation/spec.md",
    ).text();
    const scheduledRuntimePruneTasks = await Bun.file(
      "docs/specs/061-scheduled-runtime-prune-automation/tasks.md",
    ).text();
    const scheduledHistoryRetentionPlan = await Bun.file(
      "docs/specs/067-scheduled-history-retention-automation/plan.md",
    ).text();
    const scheduledHistoryRetentionSpec = await Bun.file(
      "docs/specs/067-scheduled-history-retention-automation/spec.md",
    ).text();
    const scheduledHistoryRetentionTasks = await Bun.file(
      "docs/specs/067-scheduled-history-retention-automation/tasks.md",
    ).text();
    const scheduledHistoryRetentionMatrix = await Bun.file(
      "docs/testing/scheduled-history-retention-test-matrix.md",
    ).text();
    const normalizedScheduledRuntimePruneTasks = scheduledRuntimePruneTasks.replace(/\s+/g, " ");
    const normalizedScheduledHistoryRetentionSpec = scheduledHistoryRetentionSpec.replace(
      /\s+/g,
      " ",
    );
    const normalizedScheduledHistoryRetentionTasks = scheduledHistoryRetentionTasks.replace(
      /\s+/g,
      " ",
    );

    expect(maintenanceTopic.description).toContain("certificate retry exception");
    expect(maintenanceTopic.description).toContain("without starting or ticking them");
    expect(maintenanceTopic.description).toContain("disabled by default");
    expect(maintenanceTopic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/testing/system-diagnostics-test-matrix.md",
        "apps/docs/src/content/docs/en/reference/configuration.md",
        "apps/docs/src/content/docs/reference/configuration.md",
      ]),
    );
    expect(diagnosticsMatrix).toContain("without starting or ticking workers");
    expect(diagnosticsMatrix).toContain("without exposing worker controls");
    const normalizedAdvancedDocs = advancedDocs.replace(/\s+/g, " ");
    expect(normalizedAdvancedDocs).toContain(
      "certificate retry scheduler starts with the backend service",
    );
    expect(normalizedAdvancedDocs).toContain("disabled by default");
    expect(normalizedAdvancedDocs).toContain(
      "they do not start workers, tick schedulers, or run maintenance work",
    );
    expect(configDocs).toContain(
      "Scheduled workers are disabled by default unless noted otherwise",
    );
    expect(domainModel).toContain(
      "workflow-specific durable workers remain disabled by default unless their local spec/test matrix",
    );
    expect(domainModel).toContain(
      "certificate retry scheduler is the default-on maintenance exception",
    );
    expect(domainModel).not.toContain("workflow-specific durable workers remain opt-in");
    expect(configDocs).toContain("`APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED` | `true`");
    expect(configDocs).toContain("`APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false`");
    expect(configDocs).toContain("`APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED` | `false`");
    expect(configDocs).toContain("`APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED` | `false`");
    expect(configDocs).toContain(
      "`APPALOFT_RUNTIME_MONITORING_COLLECTOR_RUNNER_ENABLED` | `false`",
    );
    expect(configDocs).toContain("`APPALOFT_PREVIEW_EXPIRY_CLEANUP_SCHEDULER_ENABLED` | `false`");
    expect(configDocs).toContain("`APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED` | `false`");
    expect(maintenanceWorkerStatusReader).toContain(
      'operationKeys: ["certificates.issue-or-renew"]',
    );
    expect(maintenanceWorkerStatusReader).not.toContain('operationKeys: ["certificates.retry"]');
    expect(scheduledRuntimePrunePlan).toContain("Risks And Governed Follow-Ups");
    expect(scheduledRuntimePruneSpec).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(normalizedScheduledRuntimePruneTasks).toContain(
      "expose configured maintenance status only through governed diagnostics/status surfaces",
    );
    expect(scheduledHistoryRetentionPlan).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(scheduledHistoryRetentionSpec).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(normalizedScheduledHistoryRetentionSpec).toContain(
      "Read-only worker activation status is handled by the governed system diagnostics surface",
    );
    expect(normalizedScheduledHistoryRetentionSpec).toContain(
      "configured worker status is visible through governed diagnostics/status surfaces",
    );
    expect(normalizedScheduledHistoryRetentionTasks).toContain(
      "expose configured worker status only through governed diagnostics/status surfaces",
    );
    expect(scheduledHistoryRetentionMatrix).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(zhConfigDocs).toContain("除非另有说明，scheduled worker 默认关闭");
    expect(zhConfigDocs).toContain("`APPALOFT_CERTIFICATE_RETRY_SCHEDULER_ENABLED` | `true`");
    expect(zhConfigDocs).toContain("`APPALOFT_PREVIEW_CLEANUP_RETRY_SCHEDULER_ENABLED` | `false`");
    for (const source of [advancedDocs, configDocs, zhConfigDocs]) {
      expect(source).not.toContain("workers start by default");
      expect(source).not.toContain("doctor starts workers");
      expect(source).not.toContain("doctor ticks workers");
    }
    for (const source of [
      scheduledRuntimePrunePlan,
      scheduledRuntimePruneSpec,
      scheduledRuntimePruneTasks,
      scheduledHistoryRetentionPlan,
      scheduledHistoryRetentionSpec,
      scheduledHistoryRetentionTasks,
      scheduledHistoryRetentionMatrix,
    ]) {
      expect(source).not.toContain("Current Implementation Notes And Migration Gaps");
      expect(source).not.toContain("Risks And Migration Gaps");
      expect(source).not.toContain("## Current Gaps");
      expect(source).not.toContain("remaining migration gaps");
      expect(source).not.toContain("Web as future");
      expect(source).not.toContain("future operator maintenance surface");
    }
    expect(maintenanceTopic.webSurfaces?.join("\n")).toContain(
      "read-only maintenance worker activation status",
    );
  });

  test("[TERM-SESSION-ENTRY-007] [TERM-SESSION-ENTRY-008] terminal lifecycle operations record docs coverage", async () => {
    const topic = publicDocsHelpTopics["server.terminal-session"];
    const openSpec = await Bun.file("docs/commands/terminal-sessions.open.md").text();
    const lifecycleCommandSpec = await Bun.file(
      "docs/commands/terminal-sessions.lifecycle.md",
    ).text();
    const lifecycleSpec = await Bun.file("docs/queries/terminal-sessions.lifecycle.md").text();
    const errorSpec = await Bun.file("docs/errors/terminal-sessions.md").text();
    const workflow = await Bun.file("docs/workflows/operator-terminal-session.md").text();
    const matrix = await Bun.file("docs/testing/operator-terminal-session-test-matrix.md").text();
    const adr = await Bun.file(
      "docs/decisions/ADR-022-operator-terminal-session-boundary.md",
    ).text();
    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();
    const plan = await Bun.file("docs/implementation/operator-terminal-session-plan.md").text();

    for (const operationKey of [
      "terminal-sessions.open",
      "terminal-sessions.list",
      "terminal-sessions.show",
      "terminal-sessions.close",
      "terminal-sessions.expire",
    ]) {
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "server.terminal-session",
      });
    }

    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/terminal-sessions.lifecycle.md",
        "docs/queries/terminal-sessions.lifecycle.md",
        "docs/testing/operator-terminal-session-test-matrix.md",
      ]),
    );
    expect(topic.description).toContain("list, show, close, and expire");
    expect(topic.aliases).toEqual(expect.arrayContaining(["terminal session lifecycle"]));
    expect(topic.webSurfaces?.join("\n")).toContain("apps/web/src/routes/instance/+page.svelte");
    expect(topic.webSurfaces?.join("\n")).toContain("active terminal session lifecycle");
    expect(openSpec).toContain("deployment attempt supplied through `scope.deploymentId`");
    expect(openSpec).toContain("terminal-session-opened` and `terminal-session-closed` audit");
    expect(openSpec).toContain("No open questions remain for the first terminal session slice");
    expect(openSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(openSpec).toContain("explicit interactive attach");
    expect(openSpec).toContain("explicit CLI `--attach`");
    expect(lifecycleCommandSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(lifecycleSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(errorSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(errorSpec).toContain("governed terminal/provider follow-ups");
    expect(openSpec).not.toContain(
      "Should resource terminal allow selecting an older deployment attempt",
    );
    expect(workflow).toContain(
      "Bun.WebView coverage exercises Instance lifecycle list/expire/close",
    );
    expect(workflow).toContain("resource and server terminal open/attach flows");
    expect(workflow).toContain("resource-owned operational tab");
    expect(workflow).toContain("tab=terminal&deploymentId=<id>");
    expect(workflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(workflow).not.toContain(
      "Should Web expose terminal as a top-level resource tab or an action inside an operations tab",
    );
    expect(matrix).toContain("TERM-SESSION-ENTRY-010");
    expect(matrix).toContain("TERM-SESSION-WEB-001");
    expect(matrix).toContain("TERM-SESSION-LIFE-006");
    expect(matrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(adr).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(plan).toContain("Baseline coverage:");
    expect(plan).toContain("Governed follow-ups:");
    expect(plan).toContain("Active attach transports replay");
    expect(plan).toContain("explicit `--attach` local TTY bridging");
    expect(roadmap).toContain("WebView attach coverage");
    expect(roadmap).toContain("explicit interactive CLI TTY attach");
    expect(roadmap).toContain("[x] Terminal session: interactive attach hardening.");
    expect(roadmap).not.toContain("[ ] Terminal session: interactive attach hardening.");
    expect(plan).not.toContain("Known gaps:");
    expect(plan).not.toContain("## Open Questions");
    expect(plan).not.toContain("timeout policy, provider-native terminals");
    expect(openSpec).not.toContain("opt-in interactive attach");
    expect(openSpec).not.toContain("opt-in CLI `--attach`");
    expect(workflow).not.toContain("opt-in CLI `--attach`");
    expect(plan).not.toContain("opt-in `--attach`");
    expect(roadmap).not.toContain("direct interactive CLI TTY attach remain open");
    expect(roadmap).not.toContain("Web E2E coverage remain open");
    for (const source of [
      openSpec,
      lifecycleCommandSpec,
      lifecycleSpec,
      errorSpec,
      workflow,
      matrix,
      adr,
      plan,
    ]) {
      expect(source).not.toContain("Current Implementation Notes And Migration Gaps");
    }
    expect(matrix).not.toContain("HTTP/WebSocket and Web E2E coverage remain follow-up");
  });

  test("[SSH-CRED-ENTRY-009] [SSH-CRED-ENTRY-010] reusable SSH credential delete records docs coverage and Web surface", () => {
    const coverage = getPublicDocsOperationCoverage("credentials.delete-ssh");
    const topic = publicDocsHelpTopics["server.ssh-credential"];

    expect(coverage).toMatchObject({
      operationKey: "credentials.delete-ssh",
      status: "documented",
      topicId: "server.ssh-credential",
    });
    expect(topic.webSurfaces).toEqual(
      expect.arrayContaining([
        "apps/web server registration, Quick Deploy credential step, credential detail surfaces, saved credential destructive delete dialog, and saved credential rotation dialog",
      ]),
    );
  });

  test("[SSH-CRED-ENTRY-011] [SSH-CRED-ENTRY-015] reusable SSH credential rotate records docs coverage and Web surface", () => {
    const coverage = getPublicDocsOperationCoverage("credentials.rotate-ssh");
    const topic = publicDocsHelpTopics["server.ssh-credential"];

    expect(coverage).toMatchObject({
      operationKey: "credentials.rotate-ssh",
      status: "documented",
      topicId: "server.ssh-credential",
    });
    expect(topic.webSurfaces?.join("\n")).toContain("saved credential rotation dialog");
  });

  test("[ENV-PRECEDENCE-ENTRY-001] environment effective precedence records docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("environments.effective-precedence");
    const topic = publicDocsHelpTopics["environment.variable-precedence"];

    expect(coverage).toMatchObject({
      operationKey: "environments.effective-precedence",
      status: "documented",
      topicId: "environment.variable-precedence",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/queries/environments.effective-precedence.md",
        "docs/testing/environment-effective-precedence-test-matrix.md",
      ]),
    );
  });

  test("[ENV-LIFE-ENTRY-004] environment archive records lifecycle docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("environments.archive");
    const topic = publicDocsHelpTopics["environment.lifecycle"];

    expect(coverage).toMatchObject({
      operationKey: "environments.archive",
      status: "documented",
      topicId: "environment.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/environment-lifecycle.md",
        "docs/commands/environments.clone.md",
        "docs/commands/environments.archive.md",
        "docs/events/environment-archived.md",
        "docs/errors/environments.lifecycle.md",
        "docs/testing/environment-lifecycle-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("environment lifecycle action");
  });

  test("[ENV-LIFE-CLONE-DOCS-001] environment clone records lifecycle docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("environments.clone");
    const topic = publicDocsHelpTopics["environment.lifecycle"];

    expect(coverage).toMatchObject({
      operationKey: "environments.clone",
      status: "documented",
      topicId: "environment.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/environment-lifecycle.md",
        "docs/commands/environments.clone.md",
        "docs/errors/environments.lifecycle.md",
        "docs/testing/environment-lifecycle-test-matrix.md",
      ]),
    );
  });

  test("[ENV-LIFE-RENAME-DOCS-001] environment rename records lifecycle docs coverage", () => {
    const coverage = getPublicDocsOperationCoverage("environments.rename");
    const topic = publicDocsHelpTopics["environment.lifecycle"];

    expect(coverage).toMatchObject({
      operationKey: "environments.rename",
      status: "documented",
      topicId: "environment.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/workflows/environment-lifecycle.md",
        "docs/commands/environments.rename.md",
        "docs/events/environment-renamed.md",
        "docs/errors/environments.lifecycle.md",
        "docs/testing/environment-lifecycle-test-matrix.md",
      ]),
    );
  });

  test("[ENV-LIFE-DOCS-002] environment lock and unlock record lifecycle docs coverage", () => {
    const lockCoverage = getPublicDocsOperationCoverage("environments.lock");
    const unlockCoverage = getPublicDocsOperationCoverage("environments.unlock");
    const topic = publicDocsHelpTopics["environment.lifecycle"];

    expect(lockCoverage).toMatchObject({
      operationKey: "environments.lock",
      status: "documented",
      topicId: "environment.lifecycle",
    });
    expect(unlockCoverage).toMatchObject({
      operationKey: "environments.unlock",
      status: "documented",
      topicId: "environment.lifecycle",
    });
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/environments.lock.md",
        "docs/commands/environments.unlock.md",
        "docs/events/environment-locked.md",
        "docs/events/environment-unlocked.md",
      ]),
    );
  });

  test("[PG-PREVIEW-SURFACE-001] preview operation contracts record product-grade preview docs coverage", async () => {
    const topic = publicDocsHelpTopics["deployment.product-grade-previews"];
    const operationKeys = [
      "preview-policies.configure",
      "preview-policies.show",
      "preview-environments.list",
      "preview-environments.show",
      "preview-environments.delete",
    ];

    for (const operationKey of operationKeys) {
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "deployment.product-grade-previews",
      });
    }

    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/specs/046-product-grade-preview-deployments/spec.md",
        "docs/testing/product-grade-preview-deployments-test-matrix.md",
      ]),
    );
    expect(topic.surfaces).toEqual(
      expect.arrayContaining(["web", "cli", "http-api", "repository-config", "mcp"]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("preview policy");

    const operationMap = await Bun.file("docs/BUSINESS_OPERATION_MAP.md").text();
    const previewWorkflowRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Product-grade preview deployments |"));

    expect(previewWorkflowRow).toContain("active baseline");
    expect(previewWorkflowRow).not.toContain("accepted candidate");

    const actionPreviewDeployRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| GitHub Action PR preview deploy |"));
    const actionPreviewCleanupRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| GitHub Action PR preview cleanup |"));
    const headlessCiDeployRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Headless CI deploy from repository config |"));
    const controlPlaneModeRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Control-plane mode selection and adoption |"));
    const durableProcessRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Durable process delivery baseline |"));

    expect(actionPreviewDeployRow).toContain("active baseline");
    expect(actionPreviewDeployRow).toContain("public wrapper hardening follow-ups");
    expect(actionPreviewDeployRow).not.toContain("accepted candidate");
    expect(actionPreviewCleanupRow).toContain("active baseline");
    expect(actionPreviewCleanupRow).toContain("public wrapper hardening follow-ups");
    expect(actionPreviewCleanupRow).not.toContain("accepted candidate");
    expect(headlessCiDeployRow).toContain("active self-hosted server config slice");
    expect(headlessCiDeployRow).not.toContain("The next self-hosted server config slice");
    expect(controlPlaneModeRow).toContain("active self-hosted baseline");
    expect(controlPlaneModeRow).toContain("Cloud-assisted API mode");
    expect(controlPlaneModeRow).not.toContain("accepted candidate");
    expect(durableProcessRow).toContain("preview cleanup retry dispatch");
    expect(durableProcessRow).toContain("process-attempt claim/completion bindings");
    expect(durableProcessRow).not.toContain("Preview cleanup, certificate issuance");

    const previewWorkflowDoc = await Bun.file(
      "docs/workflows/github-action-pr-preview-deploy.md",
    ).text();
    const productGradePreviewSpec = await Bun.file(
      "docs/specs/046-product-grade-preview-deployments/spec.md",
    ).text();
    const productGradePreviewMatrix = await Bun.file(
      "docs/testing/product-grade-preview-deployments-test-matrix.md",
    ).text();
    const domainModel = await Bun.file("docs/DOMAIN_MODEL.md").text();
    const durableProcessMatrix = await Bun.file(
      "docs/testing/durable-process-delivery-test-matrix.md",
    ).text();
    const productGradePreviewPlan = await Bun.file(
      "docs/specs/046-product-grade-preview-deployments/plan.md",
    ).text();
    const productGradePreviewTasks = await Bun.file(
      "docs/specs/046-product-grade-preview-deployments/tasks.md",
    ).text();
    const actionServerConfigPlan = await Bun.file(
      "docs/specs/050-action-server-config-deploy/plan.md",
    ).text();
    const actionServerConfigTasks = await Bun.file(
      "docs/specs/050-action-server-config-deploy/tasks.md",
    ).text();
    const actionServerConfigSpec = await Bun.file(
      "docs/specs/050-action-server-config-deploy/spec.md",
    ).text();
    const actionServerConfigWorkflow = await Bun.file(
      "docs/workflows/action-server-config-deploy.md",
    ).text();
    const controlPlaneMatrix = await Bun.file(
      "docs/testing/control-plane-modes-test-matrix.md",
    ).text();
    const controlPlaneWorkflow = await Bun.file(
      "docs/workflows/control-plane-mode-selection-and-adoption.md",
    ).text();
    const controlPlaneAdr = await Bun.file(
      "docs/decisions/ADR-025-control-plane-modes-and-action-execution.md",
    ).text();
    const actionDeployPlan = await Bun.file(
      "docs/implementation/github-action-deploy-action-plan.md",
    ).text();
    const deployActionYaml = await Bun.file(".github/actions/deploy-action/action.yml").text();
    const deployActionReadme = await Bun.file(".github/actions/deploy-action/README.md").text();
    const maintenanceWorkerStatusReader = await Bun.file(
      "apps/shell/src/maintenance-worker-status-reader.ts",
    ).text();
    const webHomeViewTest = await Bun.file("apps/web/test/e2e-webview/home.webview.test.ts").text();
    const normalizedActionServerConfigSpec = actionServerConfigSpec.replace(/\s+/g, " ");
    const normalizedActionServerConfigWorkflow = actionServerConfigWorkflow.replace(/\s+/g, " ");
    const normalizedControlPlaneMatrix = controlPlaneMatrix.replace(/\s+/g, " ");
    const normalizedControlPlaneWorkflow = controlPlaneWorkflow.replace(/\s+/g, " ");
    const normalizedControlPlaneAdr = controlPlaneAdr.replace(/\s+/g, " ");
    const normalizedActionDeployPlan = actionDeployPlan.replace(/\s+/g, " ");
    expect(previewWorkflowDoc).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(previewWorkflowDoc).toContain("active product-grade preview baseline");
    expect(previewWorkflowDoc).toContain(
      "Remaining product-grade preview work is public enablement",
    );
    expect(productGradePreviewSpec).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(productGradePreviewSpec).toContain("Governed Follow-Ups");
    expect(productGradePreviewMatrix).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(productGradePreviewMatrix).toContain(
      "process-attempt retry generation creates a pending retry attempt",
    );
    expect(productGradePreviewMatrix).toContain("cleanup executes only after atomic claim");
    expect(domainModel).toContain(
      "preview cleanup retry scheduling uses process-attempt retry generation plus atomic",
    );
    expect(durableProcessMatrix).toContain(
      "Preview cleanup is the fourth process-attempt worker binding",
    );
    expect(durableProcessMatrix).toContain("atomic process-attempt claim/completion");
    expect(productGradePreviewPlan).toContain("Risks And Governed Follow-Ups");
    expect(productGradePreviewPlan).toContain("contract/fake-provider coverage");
    expect(productGradePreviewTasks).toContain(
      "Run contract GitHub App webhook and feedback adapter tests.",
    );
    expect(productGradePreviewSpec).not.toContain(
      "Current Implementation Notes And Migration Gaps",
    );
    expect(productGradePreviewMatrix).not.toContain(
      "Current Implementation Notes And Migration Gaps",
    );
    expect(productGradePreviewMatrix).not.toContain(
      "Application coverage also proves the retry scheduler reads due candidates",
    );
    expect(domainModel).not.toContain("preview cleanup retry scheduling still uses");
    expect(domainModel).not.toContain("preview cleanup attempt store and");
    expect(durableProcessMatrix).not.toContain(
      "preview cleanup attempt store and preview-lifecycle",
    );
    expect(productGradePreviewPlan).not.toContain("Risks And Migration Gaps");
    expect(productGradePreviewPlan).not.toContain("hermetic by default");
    expect(productGradePreviewPlan).not.toContain("opt-in provider smoke tests");
    expect(productGradePreviewTasks).not.toContain("Run hermetic GitHub App");
    expect(maintenanceWorkerStatusReader).toContain(
      'operationKeys: ["preview-environments.delete", "deployments.cleanup-preview"]',
    );
    expect(webHomeViewTest).toContain(
      'operationKeys: ["preview-environments.delete", "deployments.cleanup-preview"]',
    );
    expect(previewWorkflowDoc).not.toContain(
      "The product-grade preview Spec Round is positioned, but Code Round implementation remains open.",
    );
    expect(previewWorkflowDoc).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(previewWorkflowDoc).not.toContain("Missing pieces for product-grade previews:");
    expect(previewWorkflowDoc).toContain("Remaining public wrapper hardening follow-ups");
    expect(previewWorkflowDoc).not.toContain(
      "Missing pieces before the public Action preview path is fully stable",
    );
    expect(actionServerConfigSpec).toContain("Product-grade preview orchestration is active");
    expect(actionServerConfigSpec).toContain(
      "Artifact state: active self-hosted server config deploy baseline",
    );
    expect(actionServerConfigSpec).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(actionServerConfigPlan).toContain("Risks And Governed Follow-Ups");
    expect(actionServerConfigPlan).toContain("active server-github-fetch");
    expect(actionServerConfigTasks).toContain("Record governed follow-ups explicitly");
    expect(actionServerConfigSpec).toContain("server-github-fetch");
    expect(normalizedActionServerConfigSpec).toContain("durable source package blob storage");
    expect(normalizedActionServerConfigSpec).toContain("broader control-plane adoption");
    expect(normalizedActionServerConfigSpec).toContain("remain governed follow-ups");
    expect(actionServerConfigSpec).not.toContain("Artifact state: accepted-candidate");
    expect(actionServerConfigSpec).not.toContain("Round: Spec Round");
    expect(actionServerConfigWorkflow).toContain("active implemented self-hosted server route");
    expect(actionServerConfigWorkflow).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(normalizedActionServerConfigWorkflow).toContain("durable source package blob storage");
    expect(normalizedActionServerConfigWorkflow).toContain("broader control-plane adoption");
    expect(normalizedActionServerConfigWorkflow).toContain("remain governed follow-ups");
    expect(actionServerConfigWorkflow).not.toContain(
      "source package storage, diagnostics, cleanup rules",
    );
    expect(actionServerConfigSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(actionServerConfigPlan).not.toContain("Risks And Migration Gaps");
    expect(actionServerConfigPlan).not.toContain("Fail closed until size");
    expect(actionServerConfigTasks).not.toContain("remaining migration gaps");
    expect(actionServerConfigWorkflow).not.toContain(
      "Current Implementation Notes And Migration Gaps",
    );
    expect(actionDeployPlan).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(normalizedActionDeployPlan).toContain(
      "GitHub Actions variable-gated exact-version install smoke",
    );
    expect(actionDeployPlan).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(actionDeployPlan).not.toContain("opt-in exact-version install smoke");
    expect(previewWorkflowDoc).toContain("explicitly\nrequested exact-version install smoke");
    expect(previewWorkflowDoc).not.toContain("opt-in\nexact-version install smoke");
    expect(normalizedControlPlaneMatrix).toContain("active server-config deploy slices");
    expect(controlPlaneMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(normalizedControlPlaneMatrix).toContain("active explicit `server-config-deploy` mode");
    expect(normalizedControlPlaneMatrix).toContain("Cloud-assisted reporting");
    expect(normalizedControlPlaneMatrix).toContain("non-`ci-env:` secret resolvers");
    expect(normalizedControlPlaneWorkflow).toContain(
      "active self-hosted server-config deploy slice",
    );
    expect(normalizedControlPlaneWorkflow).toContain(
      "Additional config-aware backend workflow APIs beyond the active `server-config-deploy` route",
    );
    expect(normalizedControlPlaneWorkflow).toContain(
      "Cloud-assisted Action API mode and OIDC/token exchange remain governed control-plane follow-ups",
    );
    expect(deployActionYaml).toContain("Active self-hosted server config deploy mode");
    expect(deployActionYaml).not.toContain("Experimental self-hosted server config deploy mode");
    expect(deployActionReadme).toContain("active self-hosted server config workflow");
    expect(deployActionReadme).toContain("Active self-hosted server config deploy mode");
    expect(deployActionReadme).not.toContain("Experimental self-hosted mode");
    expect(deployActionReadme).not.toContain("next self-hosted server config workflow");
    expect(controlPlaneAdr).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(controlPlaneAdr).toContain("scoped CLI state-backend baseline");
    expect(normalizedControlPlaneAdr).toContain("Action Server Config Deploy is active");
    expect(normalizedControlPlaneAdr).toContain(
      "Source package transport/storage, server-side config bootstrap",
    );
    expect(controlPlaneWorkflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(controlPlaneMatrix).not.toContain(
      "existing-resource/no-profile deployment remain target coverage",
    );
    expect(controlPlaneMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(controlPlaneMatrix).not.toContain("A future server config deploy mode");
    expect(controlPlaneMatrix).not.toContain("A future server config deploy mode is selected");
    expect(controlPlaneWorkflow).not.toContain("The next accepted-candidate `0.9.x` slice");
    expect(controlPlaneWorkflow).not.toContain(
      "A future config-aware backend workflow API requires",
    );
    expect(controlPlaneWorkflow).not.toContain("no config `controlPlane` parser exists");
    expect(controlPlaneWorkflow).not.toContain("no Cloud/self-hosted handshake exists");
    expect(controlPlaneWorkflow).not.toContain(
      "no control-plane API mode exists for deploy-action",
    );
    expect(controlPlaneWorkflow).not.toContain("Until Phase 1 is implemented");
    expect(controlPlaneWorkflow).not.toContain("not implemented yet");
    expect(controlPlaneAdr).not.toContain(
      "source package transport/storage and server-side config bootstrap implementation do not exist yet",
    );
    expect(controlPlaneAdr).not.toContain("partial state-backend implementation");
    expect(controlPlaneAdr).not.toContain("No Cloud-assisted Action API");
    expect(actionServerConfigSpec).not.toContain(
      "product-grade preview orchestration remain migration gaps",
    );

    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();
    const previewRoadmapBlock = roadmap.slice(
      roadmap.indexOf("Phase 7 product-grade preview deployment Spec Round"),
      roadmap.indexOf("Phase 7 preview deployment Docs Round"),
    );
    const deployActionCiRoadmapBlock = roadmap.slice(
      roadmap.indexOf("Phase 7 deploy-action public CI export slice"),
      roadmap.indexOf("Phase 7 deploy-action public repository publication slice"),
    );
    expect(previewRoadmapBlock).toContain("closed the active baseline");
    expect(deployActionCiRoadmapBlock).toContain(
      "GitHub Actions variable-gated exact-version install smoke",
    );
    expect(previewRoadmapBlock).not.toContain("active preview environment entrypoints remain open");
    expect(deployActionCiRoadmapBlock).not.toContain("opt-in exact-version install smoke");
    expect(previewRoadmapBlock).not.toContain(
      "transports remain inactive until the product-grade control-plane route is wired",
    );
  });

  test("[PREVIEW-CLEANUP-ENTRY-001] preview cleanup docs record active API and CLI coverage", async () => {
    const coverage = getPublicDocsOperationCoverage("deployments.cleanup-preview");
    const topic = publicDocsHelpTopics["deployment.preview-cleanup"];
    const commandSpec = await Bun.file("docs/commands/deployments.cleanup-preview.md").text();
    const matrix = await Bun.file("docs/testing/deployments.cleanup-preview-test-matrix.md").text();

    expect(coverage).toMatchObject({
      operationKey: "deployments.cleanup-preview",
      status: "documented",
      topicId: "deployment.preview-cleanup",
    });
    expect(topic.surfaces).toEqual(expect.arrayContaining(["cli", "http-api", "mcp"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/commands/deployments.cleanup-preview.md",
        "docs/testing/deployments.cleanup-preview-test-matrix.md",
      ]),
    );
    expect(commandSpec).toContain("POST /api/deployments/cleanup-preview");
    expect(commandSpec).toContain("x-appaloft-action-command: preview-cleanup");
    expect(commandSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(matrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(commandSpec).not.toContain(
      "HTTP/oRPC and Web preview cleanup entrypoints remain future work",
    );
    expect(commandSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(matrix).not.toContain("Current Implementation Notes And Migration Gaps");
  });

  test("[RES-PROFILE-ENTRY-012] resource profile topics record resource detail editing closure coverage", async () => {
    for (const [operationKey, topicId] of [
      ["resources.configure-source", "resource.source-profile"],
      ["resources.configure-runtime", "resource.runtime-profile"],
      ["resources.configure-network", "resource.network-profile"],
      ["resources.configure-access", "resource.access-profile"],
      ["resources.configure-health", "resource.health-profile"],
      ["resources.reset-health", "resource.health-profile"],
    ] as const) {
      const coverage = getPublicDocsOperationCoverage(operationKey);
      const topic = publicDocsHelpTopics[topicId];

      expect(coverage).toMatchObject({
        operationKey,
        status: "documented",
        topicId,
      });
      expect(topic.specReferences).toEqual(
        expect.arrayContaining([
          "docs/workflows/resource-profile-lifecycle.md",
          "docs/testing/resource-profile-lifecycle-test-matrix.md",
          "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
        ]),
      );
      expect(topic.webSurfaces?.join("\n")).toContain(
        "apps/web/src/routes/resources/[resourceId=consoleObjectId]/+page.svelte",
      );
    }

    for (const operationKey of [
      "resources.set-variable",
      "resources.secrets.create",
      "resources.secrets.rotate",
      "resources.secrets.delete",
      "resources.secrets.list",
      "resources.secrets.show",
      "resources.import-variables",
      "resources.unset-variable",
      "resources.effective-config",
    ] as const) {
      const coverage = getPublicDocsOperationCoverage(operationKey);
      const topic = publicDocsHelpTopics["environment.variable-precedence"];

      expect(coverage).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "environment.variable-precedence",
      });
      expect(topic.specReferences).toEqual(
        expect.arrayContaining([
          "docs/commands/resources.import-variables.md",
          "docs/commands/resources.secrets.create.md",
          "docs/commands/resources.secrets.rotate.md",
          "docs/commands/resources.secrets.delete.md",
          "docs/queries/resources.secrets.list.md",
          "docs/queries/resources.secrets.show.md",
          "docs/queries/resources.effective-config.md",
          "docs/testing/resource-profile-lifecycle-test-matrix.md",
          "docs/specs/031-resource-secret-operations-and-effective-config/spec.md",
          "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
        ]),
      );
      expect(topic.webSurfaces?.join("\n")).toContain(
        "apps/web/src/routes/resources/[resourceId=consoleObjectId]/+page.svelte",
      );
    }

    const resourceVariableSpec = await Bun.file(
      "docs/commands/resources.import-variables.md",
    ).text();
    const resourceVariablePlan = await Bun.file(
      "docs/specs/031-resource-secret-operations-and-effective-config/plan.md",
    ).text();
    const resourceProfileMatrix = await Bun.file(
      "docs/testing/resource-profile-lifecycle-test-matrix.md",
    ).text();

    expect(resourceVariableSpec).toContain(
      "Resource detail configuration section paste/import form dispatches the shared oRPC command.",
    );
    expect(resourceVariableSpec).not.toContain("Full Web paste/import UI is deferred");
    expect(resourceVariablePlan).toContain("resource-detail Web paste/import interaction");
    expect(resourceVariablePlan).not.toContain("Deferred gap: Web paste/import UI");
    expect(resourceProfileMatrix).toContain("RES-PROFILE-ENTRY-017");
    expect(resourceProfileMatrix).toContain("configuration set/import");
  });

  test("[SRC-AUTO-SURFACE-003] source auto-deploy operations record docs coverage", () => {
    expect(getPublicDocsOperationCoverage("resources.configure-auto-deploy")).toMatchObject({
      operationKey: "resources.configure-auto-deploy",
      status: "documented",
      topicId: "source.auto-deploy-setup",
    });
    expect(getPublicDocsOperationCoverage("source-events.ingest")).toMatchObject({
      operationKey: "source-events.ingest",
      status: "documented",
      topicId: "source.auto-deploy-signatures",
    });
    expect(getPublicDocsOperationCoverage("source-events.list")).toMatchObject({
      operationKey: "source-events.list",
      status: "documented",
      topicId: "source.auto-deploy-dedupe",
    });
    expect(getPublicDocsOperationCoverage("source-events.show")).toMatchObject({
      operationKey: "source-events.show",
      status: "documented",
      topicId: "source.auto-deploy-ignored-events",
    });
    expect(getPublicDocsOperationCoverage("source-events.replay")).toMatchObject({
      operationKey: "source-events.replay",
      status: "documented",
      topicId: "source.auto-deploy-recovery",
    });
    expect(publicDocsHelpTopics["source.auto-deploy-setup"].webSurfaces?.join("\n")).toContain(
      "Resource detail auto-deploy settings",
    );
    expect(
      publicDocsHelpTopics["source.auto-deploy-ignored-events"].webSurfaces?.join("\n"),
    ).toContain("Resource detail source event diagnostics");
  });

  test("[ZSSH-RUNTIME-004][ZSSH-RUNTIME-005] workload catalog docs record GitHub Actions real-target gates", async () => {
    const workflow = await Bun.file(
      "docs/workflows/workload-framework-detection-and-planning.md",
    ).text();
    const frameworkCatalogArtifacts = await Promise.all(
      [
        "docs/specs/014-framework-planner-contract-and-js-ts-catalog/spec.md",
        "docs/specs/014-framework-planner-contract-and-js-ts-catalog/plan.md",
        "docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/spec.md",
        "docs/specs/015-python-framework-planner-contract-and-asgi-wsgi-catalog/plan.md",
        "docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/spec.md",
        "docs/specs/016-jvm-framework-planner-contract-and-spring-boot-catalog/plan.md",
      ].map((path) => Bun.file(path).text()),
    );
    const frameworkCatalogSource = frameworkCatalogArtifacts.join("\n");
    const matrix = await Bun.file(
      "docs/testing/workload-framework-detection-and-planning-test-matrix.md",
    ).text();
    const substratePlan = await Bun.file(
      "docs/implementation/deployment-runtime-substrate-plan.md",
    ).text();
    const quickDeployMatrix = await Bun.file("docs/testing/quick-deploy-test-matrix.md").text();
    const quickDeployWorkflow = await Bun.file("docs/workflows/quick-deploy.md").text();
    const resourcesCreateCommand = await Bun.file("docs/commands/resources.create.md").text();
    const resourcesCreateMatrix = await Bun.file(
      "docs/testing/resources.create-test-matrix.md",
    ).text();
    const resourcesFirstDeployWorkflow = await Bun.file(
      "docs/workflows/resources.create-and-first-deploy.md",
    ).text();
    const deploymentPlanMatrix = await Bun.file(
      "docs/testing/deployment-plan-preview-test-matrix.md",
    ).text();
    const deploymentPlanSpec = await Bun.file(
      "docs/specs/013-deployment-plan-preview/spec.md",
    ).text();
    const deploymentPlanPlan = await Bun.file(
      "docs/specs/013-deployment-plan-preview/plan.md",
    ).text();
    const zsshSpec = await Bun.file(
      "docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/spec.md",
    ).text();
    const zsshPlan = await Bun.file(
      "docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/plan.md",
    ).text();
    const zsshTasks = await Bun.file(
      "docs/specs/019-zero-to-ssh-supported-catalog-acceptance-harness/tasks.md",
    ).text();
    const operationMap = await Bun.file("docs/BUSINESS_OPERATION_MAP.md").text();
    const normalizedOperationMap = operationMap.replace(/\s+/g, " ");
    const staticSiteWorkflowRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| First-class static site deployment |"));
    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();

    for (const source of [workflow, matrix, zsshSpec, zsshPlan, operationMap, roadmap]) {
      expect(source).toContain("GitHub Actions");
      expect(source).toMatch(/local explicit|local Docker/);
    }
    expect(matrix).toContain("GitHub Actions + local explicit Docker e2e");
    expect(matrix).toContain("GitHub Actions secret-gated + local explicit SSH e2e");
    expect(matrix).toContain(".github/workflows/framework-fixture-e2e.yml");
    expect(matrix).toContain("GitHub Actions/local explicit real-target gates");
    expect(matrix).toContain("GitHub Actions/local explicit real-smoke coverage");
    expect(workflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(workflow).toContain("GitHub Actions/local explicit real fixture smoke");
    expect(matrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(deploymentPlanMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(deploymentPlanMatrix).toContain("MCP/tool descriptor promotion remains governed");
    expect(deploymentPlanSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(deploymentPlanSpec).toContain("MCP/tool descriptor promotion remains governed");
    expect(deploymentPlanPlan).toContain("Risks And Governed Follow-Ups");
    expect(deploymentPlanPlan).toContain("side-effect assertions");
    expect(deploymentPlanMatrix).toContain(
      "packages/application/test/deployment-plan-preview.test.ts",
    );
    expect(zsshSpec.replace(/\s+/g, " ")).toContain(
      "GitHub Actions/local explicit Docker and generic-SSH fixture smoke",
    );
    expect(zsshPlan).toContain("Risks And Governed Follow-Ups");
    expect(zsshTasks).toContain("unrelated governed");
    expect(frameworkCatalogSource).toContain("GitHub Actions/local explicit real smoke execution");
    expect(frameworkCatalogSource).toContain("GitHub Actions/local explicit gates");
    expect(substratePlan).toContain(
      "Real local Docker and generic-SSH smoke are GitHub Actions/local explicit",
    );
    expect(substratePlan).toContain(
      "GitHub Actions secret-gated plus local explicit generic-SSH workflow",
    );
    expect(substratePlan).toContain(
      "GitHub Actions secret-gated plus local explicit e2e harness for real SSH",
    );
    expect(substratePlan).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(quickDeployMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(quickDeployMatrix).toContain("separate governed entrypoint follow-up");
    expect(quickDeployWorkflow).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(quickDeployWorkflow).toContain("active resource profile commands");
    expect(quickDeployWorkflow).toContain("## Governed Follow-Ups");
    expect(resourcesCreateCommand).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(resourcesCreateCommand).toContain(
      "Dedicated resource profile mutation operations are active",
    );
    expect(resourcesCreateCommand).toContain("resources.configure-access");
    expect(resourcesCreateMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(resourcesCreateMatrix).toContain("active resource profile configuration commands");
    expect(resourcesFirstDeployWorkflow).toContain(
      "Current Implementation Notes And Governed Follow-Ups",
    );
    expect(resourcesFirstDeployWorkflow).toContain(
      "Resource source/runtime/network operation names are active",
    );
    expect(operationMap).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(normalizedOperationMap).toContain(
      "GitHub Actions secret-gated plus local explicit static smoke",
    );
    expect(staticSiteWorkflowRow).toContain("Active workflow");
    expect(staticSiteWorkflowRow).not.toContain("Accepted candidate workflow");
    expect(roadmap).toContain("GitHub Actions/local explicit Docker");
    expect(workflow).not.toContain("Default automation must stay hermetic");
    expect(workflow).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(workflow).not.toContain("The following are migration gaps");
    expect(matrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(deploymentPlanMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(deploymentPlanMatrix).not.toContain("remain a migration gap");
    expect(deploymentPlanMatrix).not.toContain("there is no");
    expect(deploymentPlanSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(deploymentPlanSpec).not.toContain("Full future MCP/tool descriptors remain a follow-up");
    expect(deploymentPlanPlan).not.toContain("Risks And Migration Gaps");
    expect(deploymentPlanPlan).not.toContain("remain a migration gap");
    expect(workflow).not.toContain("shared opt-in local Docker/generic-SSH");
    expect(workflow).not.toContain("fixture descriptor list for opt-in generic-SSH smoke");
    expect(workflow).not.toContain("optional real local Docker or generic-SSH smoke gate");
    expect(workflow).not.toContain("Opt-in real fixture smoke");
    expect(matrix).not.toContain("| ZSSH-RUNTIME-004 | opt-in local Docker e2e |");
    expect(matrix).not.toContain("| ZSSH-RUNTIME-005 | opt-in SSH e2e |");
    expect(matrix).not.toContain("below opt-in real smoke");
    expect(matrix).not.toContain(
      "real Docker and real SSH remain explicit opt-in confidence layers",
    );
    expect(matrix).not.toContain("generic Java deterministic jar behavior and opt-in");
    expect(matrix).not.toContain("covered by the opt-in `QUICK-DEPLOY-WF-061`");
    expect(zsshSpec).not.toContain("shared\n  opt-in local Docker");
    expect(zsshPlan).not.toContain("Risks And Migration Gaps");
    expect(zsshTasks).not.toContain("unrelated migration gaps");
    expect(frameworkCatalogSource).not.toContain("opt-in real smoke execution");
    expect(frameworkCatalogSource).not.toContain("shared opt-in framework smoke harness");
    expect(frameworkCatalogSource).not.toContain("default CI stays hermetic");
    expect(substratePlan).not.toContain("explicit opt-in\nconfidence gates");
    expect(substratePlan).not.toContain("opt-in local Docker slice");
    expect(substratePlan).not.toContain("has an opt-in\ngeneric-SSH workflow");
    expect(substratePlan).not.toContain("opt-in e2e harness");
    expect(substratePlan).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(quickDeployMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(quickDeployMatrix).not.toContain("fixture-coverage migration gap");
    expect(quickDeployWorkflow).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(quickDeployWorkflow).not.toContain("accepted candidate resource profile commands");
    expect(quickDeployWorkflow).not.toContain(
      "Resource source/runtime/network operation names are resolved as accepted candidates",
    );
    expect(resourcesCreateCommand).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(resourcesCreateCommand).not.toContain(
      "Dedicated source/runtime/network configuration operations are accepted candidate",
    );
    expect(resourcesCreateCommand).not.toContain("They remain inactive until implemented");
    expect(resourcesCreateCommand).not.toContain(
      "Resource source/runtime/network operation names are resolved as accepted candidates",
    );
    expect(resourcesCreateMatrix).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(resourcesCreateMatrix).not.toContain("future resource profile configuration commands");
    expect(resourcesFirstDeployWorkflow).not.toContain(
      "Current Implementation Notes And Migration Gaps",
    );
    expect(resourcesFirstDeployWorkflow).not.toContain(
      "Provider-backed disambiguation for slash-containing Git refs remains future work",
    );
    expect(resourcesFirstDeployWorkflow).not.toContain(
      "Resource source/runtime/network operation names are resolved as accepted candidates",
    );
    expect(operationMap).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(operationMap).not.toContain("opt-in static smoke coverage");
    expect(roadmap).not.toContain("shared opt-in local Docker");
    expect(roadmap).not.toContain("Opt-in real Docker framework fixture smoke");
    expect(roadmap).not.toContain("Representative opt-in real local Docker");
    expect(roadmap).not.toContain("first representative opt-in real local Docker");
    expect(roadmap).not.toContain("shared opt-in smoke descriptors");
  });

  test("[QUICK-DEPLOY-WF-052][CONFIG-FILE-STATE-010] SSH target docs record GitHub Actions real-target gates", async () => {
    const quickDeployMatrix = await Bun.file("docs/testing/quick-deploy-test-matrix.md").text();
    const deploymentConfigMatrix = await Bun.file(
      "docs/testing/deployment-config-file-test-matrix.md",
    ).text();

    expect(quickDeployMatrix).toContain("GitHub Actions secret-gated + local explicit SSH e2e");
    expect(quickDeployMatrix).toContain("integration + GitHub Actions/local explicit e2e");
    expect(quickDeployMatrix).toContain(".github/workflows/public-launch-basic-docker-smoke.yml");
    expect(quickDeployMatrix).toContain(".github/workflows/public-launch-github-repo-smoke.yml");
    expect(quickDeployMatrix).toContain("require_public_launch_github_repo_smoke");
    expect(deploymentConfigMatrix).toContain(
      "e2e-preferred, GitHub Actions secret-gated + local explicit SSH",
    );
    expect(deploymentConfigMatrix).toContain(
      ".github/workflows/public-launch-basic-docker-smoke.yml",
    );
    expect(deploymentConfigMatrix).toContain(
      ".github/workflows/public-launch-github-repo-smoke.yml",
    );
    expect(deploymentConfigMatrix).toContain(".github/workflows/public-launch-cron-smoke.yml");
    expect(deploymentConfigMatrix).toContain("require_public_launch_cron_smoke");
    const deploymentConfigWorkflow = await Bun.file(
      "docs/workflows/deployment-config-file-bootstrap.md",
    ).text();
    expect(deploymentConfigWorkflow).toContain("GitHub Actions/local explicit shell e2e harness");
    expect(deploymentConfigWorkflow).not.toContain("An opt-in shell e2e harness");
    expect(quickDeployMatrix).not.toContain("integration, opt-in e2e");
    expect(quickDeployMatrix).not.toContain("The opt-in SSH e2e harness");
    expect(quickDeployMatrix).not.toContain("shared opt-in real local Docker");
    expect(deploymentConfigMatrix).not.toContain("e2e-preferred, opt-in SSH");
    expect(deploymentConfigMatrix).not.toContain("have an opt-in external SSH e2e harness");
    expect(deploymentConfigMatrix).not.toContain("remains opt-in SSH e2e target coverage");
  });

  test("[SCHED-TASK-DOCS-001] scheduled task operations record docs coverage", async () => {
    for (const operationKey of [
      "scheduled-tasks.create",
      "scheduled-tasks.list",
      "scheduled-tasks.show",
      "scheduled-tasks.configure",
      "scheduled-tasks.delete",
      "scheduled-tasks.run-now",
      "scheduled-task-runs.list",
      "scheduled-task-runs.show",
      "scheduled-task-runs.logs",
    ] as const) {
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "scheduled-task.resource-lifecycle",
      });
    }

    const topic = publicDocsHelpTopics["scheduled-task.resource-lifecycle"];
    const plan = await Bun.file("docs/specs/044-scheduled-task-resource-shape/plan.md").text();
    const spec = await Bun.file("docs/specs/044-scheduled-task-resource-shape/spec.md").text();
    const tasks = await Bun.file("docs/specs/044-scheduled-task-resource-shape/tasks.md").text();
    const matrix = await Bun.file("docs/testing/scheduled-task-resource-test-matrix.md").text();
    const roadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();
    const shellRuntimeRegistration = await Bun.file(
      "apps/shell/src/register-runtime-dependencies.ts",
    ).text();
    const runAdmissionService = await Bun.file(
      "packages/application/src/operations/scheduled-tasks/scheduled-task-run-admission.service.ts",
    ).text();
    const scheduledTaskRunner = await Bun.file("apps/shell/src/scheduled-task-runner.ts").text();
    const processAttemptJournalTest = await Bun.file(
      "packages/persistence/pg/test/process-attempt-journal.pglite.test.ts",
    ).text();
    const webInstanceTest = await Bun.file("apps/web/test/e2e-webview/home.webview.test.ts").text();
    const normalizedSpec = spec.replace(/\s+/g, " ");

    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-039-scheduled-task-resource-ownership.md",
        "docs/specs/044-scheduled-task-resource-shape/spec.md",
        "docs/testing/scheduled-task-resource-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("Resource detail scheduled-task controls");

    const operationMap = await Bun.file("docs/BUSINESS_OPERATION_MAP.md").text();
    const scheduledTaskDocs = await Bun.file(
      "apps/docs/src/content/docs/en/resources/scheduled-tasks.md",
    ).text();
    const scheduledTaskRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Scheduled task resource lifecycle |"));
    const scheduledTaskRoadmapBlock = roadmap.slice(
      roadmap.indexOf("Phase 7 scheduled task resource Spec Round"),
      roadmap.indexOf("Phase 7 terminal container exec slice"),
    );

    expect(scheduledTaskRow).toContain("active baseline");
    expect(scheduledTaskRow).not.toContain("accepted candidate");
    expect(plan).toContain("local-shell/generic-SSH Docker");
    expect(plan).toContain("Docker Compose one-off task execution");
    expect(plan).toContain("Docker Swarm replicated-job");
    expect(plan).toContain("explicitly enabled runner");
    expect(tasks).toContain("Add explicitly enabled scheduled-task shell runner");
    expect(plan).toContain(
      "GitHub Actions/local explicit real local Docker/generic-SSH Docker smoke",
    );
    expect(plan).not.toContain("First runtime artifact source for task execution");
    expect(plan).not.toContain("hermetic adapter");
    expect(plan).not.toContain("opt-in real local Docker/generic-SSH Docker smoke commands");
    expect(spec).toContain("Scheduled task real runtime execution currently covers");
    expect(spec).toContain("disabled by default and starts only when shell");
    expect(spec).toContain("Docker Swarm OCI-image services");
    expect(spec).toContain(".github/workflows/scheduled-task-e2e.yml");
    expect(spec).toContain("real runtime-target implementation");
    expect(spec).toContain("manual run-now attempts record");
    expect(spec).toContain("scheduled-task-runs.run-due");
    expect(shellRuntimeRegistration).toContain("new RuntimeTargetScheduledTaskRuntimePort");
    expect(shellRuntimeRegistration).not.toContain("new HermeticScheduledTaskRuntimePort");
    expect(runAdmissionService).toContain(
      'const manualRunOperationKey = "scheduled-tasks.run-now"',
    );
    expect(runAdmissionService).toContain(
      'const scheduledRunOperationKey = "scheduled-task-runs.run-due"',
    );
    expect(runAdmissionService).not.toContain('operationKey: "scheduled-task-runs.run-now"');
    expect(scheduledTaskRunner).toContain('"scheduled-tasks.run-now"');
    expect(scheduledTaskRunner).toContain('"scheduled-task-runs.run-due"');
    expect(scheduledTaskRunner).not.toContain('"scheduled-task-runs.run-now"');
    expect(processAttemptJournalTest).toContain('"scheduled-tasks.run-now"');
    expect(processAttemptJournalTest).not.toContain('"scheduled-task-runs.run-now"');
    expect(webInstanceTest).toContain(
      'operationKeys: ["scheduled-tasks.run-now", "scheduled-task-runs.run-due"]',
    );
    expect(webInstanceTest).not.toContain('"scheduled-tasks.run-due"');
    expect(normalizedSpec).toContain(
      "hermetic execution limited to tests and development fixtures",
    );
    expect(matrix).toContain("GitHub Actions + local explicit real Docker smoke");
    expect(matrix).toContain(
      "GitHub Actions secret-gated + local explicit real generic-SSH Docker smoke",
    );
    expect(matrix).toContain("release dispatch can require the SSH side");
    expect(matrix).toContain("Appaloft-owned");
    expect(matrix).toContain("explicitly enabled scheduled task runner");
    expect(matrix).toContain("Manual run-now process attempts use catalog key");
    expect(matrix).toContain("Delivery reads include both `scheduled-tasks.run-now`");
    expect(roadmap).toContain("scheduled task real-runtime confidence sync");
    expect(roadmap).toContain(".github/workflows/scheduled-task-e2e.yml");
    expect(scheduledTaskRoadmapBlock).toContain("implemented by later scheduled-task slices");
    expect(scheduledTaskRoadmapBlock).toContain(
      "disabled by default and starts only when shell processes explicitly",
    );
    expect(matrix).not.toContain("have opt-in real Docker/SSH smoke bindings");
    expect(matrix).not.toContain("hermetic runtime adapter support");
    expect(spec).not.toContain("Opt-in real runtime smoke commands exist");
    expect(spec).not.toContain("runner remains opt-in");
    expect(spec).not.toContain("An opt-in scheduled task runner config");
    expect(plan).not.toContain("opt-in runner");
    expect(tasks).not.toContain("opt-in scheduled-task shell runner");
    expect(matrix).not.toContain("opt-in scheduled task runner");
    expect(scheduledTaskRoadmapBlock).not.toContain(
      "scheduled task shell runner slice added opt-in",
    );
    expect(scheduledTaskRoadmapBlock).not.toContain("scheduled-task runner remains opt-in");
    expect(scheduledTaskRoadmapBlock).not.toContain("entrypoints, and public docs remain open");
    expect(scheduledTaskRoadmapBlock).not.toContain(
      "runtime execution, entrypoints, and public docs remain open",
    );
    expect(scheduledTaskRoadmapBlock).not.toContain("workload context injection remain open");
    expect(spec).not.toContain(
      "baseline runs through Appaloft-owned runtime execution for hermetic tests",
    );
    expect(scheduledTaskDocs).toContain("local-shell Docker");
    expect(scheduledTaskDocs).toContain("generic-SSH Docker");
    expect(scheduledTaskDocs).toContain("Docker Compose");
    expect(scheduledTaskDocs).toContain("Docker Swarm image services");
    expect(scheduledTaskDocs).not.toContain(
      "currently run against the Resource's latest successful `generic-ssh` Docker container deployment",
    );
  });

  test("[RT-MON-010] runtime monitoring operation map records active surfaces and explicit non-goals", async () => {
    for (const [operationKey, topicId] of [
      ["runtime-monitoring.samples.list", "diagnostics.runtime-monitoring"],
      ["runtime-monitoring.rollup", "diagnostics.runtime-monitoring"],
      ["runtime-monitoring.thresholds.configure", "diagnostics.runtime-monitoring-thresholds"],
      ["runtime-monitoring.thresholds.show", "diagnostics.runtime-monitoring-thresholds"],
    ] as const) {
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId,
      });
    }

    const operationMap = await Bun.file("docs/BUSINESS_OPERATION_MAP.md").text();
    const usageMatrix = await Bun.file(
      "docs/testing/runtime-usage-attribution-test-matrix.md",
    ).text();
    const monitoringMatrix = await Bun.file(
      "docs/testing/runtime-monitoring-observation-test-matrix.md",
    ).text();
    const monitoringSpec = await Bun.file(
      "docs/specs/069-runtime-monitoring-observation-boundary/spec.md",
    ).text();
    const productRoadmap = await Bun.file("docs/PRODUCT_ROADMAP.md").text();
    const usageSpec = await Bun.file(
      "docs/specs/068-runtime-usage-attribution-and-monitoring/spec.md",
    ).text();
    const inspectQuerySpec = await Bun.file("docs/queries/runtime-usage.inspect.md").text();
    const usagePlan = await Bun.file(
      "docs/specs/068-runtime-usage-attribution-and-monitoring/plan.md",
    ).text();
    const usageTasks = await Bun.file(
      "docs/specs/068-runtime-usage-attribution-and-monitoring/tasks.md",
    ).text();
    const monitoringPlan = await Bun.file(
      "docs/specs/069-runtime-monitoring-observation-boundary/plan.md",
    ).text();
    const monitoringTasks = await Bun.file(
      "docs/specs/069-runtime-monitoring-observation-boundary/tasks.md",
    ).text();
    const apiDescriptions = await Bun.file("packages/orpc/src/index.ts").text();
    const runtimeMonitoringRow = operationMap
      .split("\n")
      .find((line) => line.startsWith("| Runtime usage attribution and monitoring |"));

    expect(runtimeMonitoringRow).toContain("Active read workflow / scoped observability boundary");
    expect(runtimeMonitoringRow).toContain("External alert routing");
    expect(runtimeMonitoringRow).toContain(
      "no future runtime-monitoring operation is accepted without a new spec",
    );
    expect(runtimeMonitoringRow).not.toContain("accepted follow-up candidates");
    expect(runtimeMonitoringRow).not.toContain("Full Observe UI and richer charts");
    expect(runtimeMonitoringRow).not.toContain("future operations: full Observe UI");
    expect(apiDescriptions).toMatch(
      /runtimeMonitoringThresholdConfigure:[\s\S]*diagnostics\.runtime-monitoring-thresholds/,
    );
    expect(apiDescriptions).toMatch(
      /runtimeMonitoringThresholdShow:[\s\S]*diagnostics\.runtime-monitoring-thresholds/,
    );
    expect(usageSpec).toContain("GitHub Actions/local explicit real Docker and SSH usage smoke");
    expect(usageSpec).toContain(".github/workflows/runtime-usage-e2e.yml");
    expect(usageSpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(usageSpec).toContain(
      "Time-series collection is disabled by default, explicitly enabled, and bounded",
    );
    expect(usageSpec).toContain("readback/configuration is active in this baseline");
    expect(usageSpec).toContain("server/resource Monitor surfaces read retained samples");
    expect(usageSpec).toContain("monitoring collection is explicitly enabled");
    expect(usageSpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(usageSpec).not.toContain("Time-series collection is opt-in and bounded");
    expect(usageSpec).not.toContain("Later slices may add thresholds");
    expect(usageSpec).not.toContain("after query contracts exist");
    expect(inspectQuerySpec).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(inspectQuerySpec).toContain("Runtime Monitoring Observation Boundary");
    expect(inspectQuerySpec).toContain("runtime-monitoring.samples.list");
    expect(inspectQuerySpec).toContain("runtime-monitoring.rollup");
    expect(inspectQuerySpec).toContain("runtime-monitoring.thresholds.configure");
    expect(inspectQuerySpec).toContain("runtime-monitoring.thresholds.show");
    expect(inspectQuerySpec).toContain("Server/resource Monitor surfaces show compact usage");
    expect(inspectQuerySpec).not.toContain("retained samples and time windows are deferred");
    expect(inspectQuerySpec).not.toContain("First Code Round exposes");
    expect(inspectQuerySpec).not.toContain("First Code Round should expose");
    expect(inspectQuerySpec).not.toContain("Current Implementation Notes And Migration Gaps");
    expect(inspectQuerySpec).not.toContain(
      "Retained samples, time-window rollups, charts, thresholds, alert delivery, quotas, and runtime sizing remain deferred.",
    );
    expect(usageMatrix).toContain("Retained sample collection is disabled by default");
    expect(usageMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(monitoringSpec).toContain(
      "Sample collection is disabled by default and starts only when",
    );
    expect(monitoringSpec).toContain("explicitly enabled");
    expect(productRoadmap).toContain("Pulled-forward runtime monitoring observation baseline");
    expect(productRoadmap).toContain(
      "[x] Bounded runtime usage sample retention and rollup queries for charts.",
    );
    expect(productRoadmap).toContain(
      "[x] Non-enforcing usage thresholds, warning/critical state, and operator visibility.",
    );
    expect(productRoadmap).toContain(
      "selected as an active\n  pre-RC baseline rather than a post-GA placeholder",
    );
    expect(productRoadmap).toContain("[x] Runtime monitoring: bounded sample read/write storage");
    expect(productRoadmap).not.toContain(
      "[ ] Runtime monitoring: bounded sample read/write storage",
    );
    expect(productRoadmap).not.toContain("Deferred unless explicitly pulled into `0.12.0`");
    expect(productRoadmap).not.toContain(
      "[ ] Select whether bounded samples, rollups, charts, and threshold visibility",
    );
    expect(usagePlan).toContain("GitHub Actions/local explicit gates");
    expect(usagePlan).not.toContain("add opt-in Docker/SSH");
    expect(usagePlan).toContain("Risks And Governed Follow-Ups");
    expect(usagePlan).not.toContain("Risks And Migration Gaps");
    expect(usageTasks).toContain("governed follow-ups");
    expect(usageTasks).not.toContain("Record remaining migration gaps");
    expect(monitoringPlan).toContain("Risks And Governed Follow-Ups");
    expect(monitoringPlan).not.toContain("Risks And Migration Gaps");
    expect(monitoringTasks).toContain("governed follow-ups");
    expect(monitoringTasks).not.toContain("migration gaps");
    expect(usageSpec).not.toContain("Opt-in real Docker and SSH usage smoke commands");
    expect(usageMatrix).not.toContain("Retained sample collection is opt-in");
    expect(usageMatrix).not.toContain("## Current Gaps");
    expect(usageMatrix).not.toContain("observability handoff gaps are tracked");
    expect(monitoringSpec).not.toContain("Sample collection remains opt-in");
    expect(usageTasks).toContain("GitHub Actions/local explicit Docker/SSH smoke gates");
    expect(usageTasks).not.toContain("Add opt-in Docker/SSH smoke gates");
    for (const matrix of [usageMatrix, monitoringMatrix]) {
      expect(matrix).toContain(
        "Real Docker and SSH usage smoke coverage is a GitHub Actions gate with local explicit",
      );
      expect(matrix).toContain(".github/workflows/runtime-usage-e2e.yml");
      expect(matrix).toContain("require_runtime_usage_e2e=true");
      expect(matrix).not.toContain("Real Docker and SSH usage smoke tests are opt-in");
      expect(matrix).not.toContain("The opt-in gates live in");
    }
    expect(monitoringMatrix).toContain("Current Implementation Notes And Governed Follow-Ups");
    expect(monitoringMatrix).not.toContain("Current Implementation Notes And Remaining Gaps");
  });

  test("[PRODUCT-AUTH-DOCS-001] first-admin bootstrap operations record public docs coverage", () => {
    const topic = publicDocsHelpTopics["self-hosting.first-admin-bootstrap"];

    expect(getPublicDocsOperationCoverage("auth.bootstrap-status")).toMatchObject({
      operationKey: "auth.bootstrap-status",
      status: "documented",
      topicId: "self-hosting.first-admin-bootstrap",
    });
    expect(getPublicDocsOperationCoverage("auth.bootstrap-first-admin")).toMatchObject({
      operationKey: "auth.bootstrap-first-admin",
      status: "documented",
      topicId: "self-hosting.first-admin-bootstrap",
    });
    expect(getPublicDocsOperationCoverage("capabilities.query")).toMatchObject({
      operationKey: "capabilities.query",
      status: "documented",
      topicId: "self-hosting.organization-team-management",
    });
    expect(topic.surfaces).toEqual(expect.arrayContaining(["web", "cli", "http-api", "mcp"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-044-self-hosted-first-admin-bootstrap.md",
        "docs/specs/053-self-hosted-first-admin-bootstrap/spec.md",
        "docs/workflows/self-hosted-first-admin-bootstrap.md",
        "docs/errors/self-hosted-product-auth.md",
        "docs/testing/self-hosted-product-auth-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("public bootstrap status/setup endpoints");
  });

  test("[PRODUCT-AUTH-PARITY-001] Phase 8 auth operations keep CLI, HTTP/oRPC, and docs coverage aligned", () => {
    const operationsByTopic = {
      "self-hosting.first-admin-bootstrap": ["auth.bootstrap-status", "auth.bootstrap-first-admin"],
      "self-hosting.organization-team-management": [
        "organizations.current-context",
        "organizations.switch-current",
        "organizations.list-members",
        "organizations.list-invitations",
        "organizations.invite-member",
        "organizations.change-member-role",
        "organizations.remove-member",
        "organizations.reactivate-member",
        "organizations.transfer-owner",
      ],
      "self-hosting.action-deploy-token-auth": [
        "deploy-tokens.create",
        "deploy-tokens.list",
        "deploy-tokens.show",
        "deploy-tokens.rotate",
        "deploy-tokens.revoke",
      ],
    } as const;

    for (const [topicId, operationKeys] of Object.entries(operationsByTopic)) {
      const topic = publicDocsHelpTopics[topicId];
      expect(topic, topicId).toBeDefined();
      expect(topic.surfaces, topicId).toEqual(
        expect.arrayContaining(["cli", "http-api", "web", "mcp"]),
      );

      for (const operationKey of operationKeys) {
        const operation = requireCatalogOperation(operationKey);
        expect(operation.transports.cli, operationKey).toBeDefined();
        expect(operation.transports.orpc, operationKey).toBeDefined();
        expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
          operationKey,
          status: "documented",
          topicId,
        });
      }
    }
  });

  test("[ORG-TEAM-DOCS-001] organization/team operations record public docs coverage", () => {
    const topic = publicDocsHelpTopics["self-hosting.organization-team-management"];

    for (const operationKey of [
      "organizations.current-context",
      "organizations.switch-current",
      "organizations.list-members",
      "organizations.list-invitations",
      "organizations.invite-member",
      "organizations.change-member-role",
      "organizations.remove-member",
      "organizations.reactivate-member",
      "organizations.transfer-owner",
    ] as const) {
      expect(getPublicDocsOperationCoverage(operationKey)).toMatchObject({
        operationKey,
        status: "documented",
        topicId: "self-hosting.organization-team-management",
      });
    }

    expect(topic.surfaces).toEqual(expect.arrayContaining(["cli", "http-api", "web", "mcp"]));
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-045-self-hosted-organization-team-operations.md",
        "docs/specs/054-self-hosted-organization-team-operations/spec.md",
        "docs/errors/self-hosted-product-auth.md",
        "docs/testing/self-hosted-product-auth-test-matrix.md",
      ]),
    );
    expect(topic.anchor).toBe("self-hosting-organization-team-management");
    expect(topic.webSurfaces?.join("\n")).toContain("apps/web /organization");
  });
});
