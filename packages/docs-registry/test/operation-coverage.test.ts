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
        "docs/commands/environments.archive.md",
        "docs/events/environment-archived.md",
        "docs/errors/environments.lifecycle.md",
        "docs/testing/environment-lifecycle-test-matrix.md",
      ]),
    );
    expect(topic.webSurfaces?.join("\n")).toContain("environment lifecycle action");
  });
});
