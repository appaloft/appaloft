import { describe, expect, test } from "bun:test";

import { operationCatalog } from "../../application/src/operation-catalog";
import {
  getPublicDocsOperationCoverage,
  publicDocsHelpTopics,
  publicDocsOperationCoverage,
} from "../src";

describe("public docs operation coverage", () => {
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

  test("[OP-WORK-DOCS-001] operator work queries record read-only docs coverage", () => {
    const listCoverage = getPublicDocsOperationCoverage("operator-work.list");
    const showCoverage = getPublicDocsOperationCoverage("operator-work.show");
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
    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/queries/operator-work.list.md",
        "docs/queries/operator-work.show.md",
        "docs/testing/operator-work-ledger-test-matrix.md",
      ]),
    );
    expect(topic.description).toContain("without recovery mutations");
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

  test("[PG-PREVIEW-SURFACE-001] preview operation contracts record product-grade preview docs coverage", () => {
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
  });

  test("[RES-PROFILE-ENTRY-012] resource profile topics record resource detail editing closure coverage", () => {
    for (const [operationKey, topicId] of [
      ["resources.configure-source", "resource.source-profile"],
      ["resources.configure-runtime", "resource.runtime-profile"],
      ["resources.configure-network", "resource.network-profile"],
      ["resources.configure-access", "resource.access-profile"],
      ["resources.configure-health", "resource.health-profile"],
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
        "apps/web/src/routes/resources/[resourceId]/+page.svelte",
      );
    }

    for (const operationKey of [
      "resources.set-variable",
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
          "docs/queries/resources.effective-config.md",
          "docs/testing/resource-profile-lifecycle-test-matrix.md",
          "docs/specs/031-resource-secret-operations-and-effective-config/spec.md",
          "docs/specs/009-resource-detail-profile-editing-closure/spec.md",
        ]),
      );
      expect(topic.webSurfaces?.join("\n")).toContain(
        "apps/web/src/routes/resources/[resourceId]/+page.svelte",
      );
    }
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
    expect(publicDocsHelpTopics["source.auto-deploy-setup"].webSurfaces?.join("\n")).toContain(
      "Resource detail auto-deploy settings",
    );
    expect(
      publicDocsHelpTopics["source.auto-deploy-ignored-events"].webSurfaces?.join("\n"),
    ).toContain("Resource detail source event diagnostics");
  });

  test("[SCHED-TASK-DOCS-001] scheduled task operations record docs coverage", () => {
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

    expect(topic.specReferences).toEqual(
      expect.arrayContaining([
        "docs/decisions/ADR-039-scheduled-task-resource-ownership.md",
        "docs/specs/044-scheduled-task-resource-shape/spec.md",
        "docs/testing/scheduled-task-resource-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("Web controls deferred");
  });
});
