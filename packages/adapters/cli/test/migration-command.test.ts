import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApplyPlatformMigrationCommand,
  CleanupPlatformMigrationCommand,
  type CommandBus,
  createExecutionContext,
  createMigrationPlan,
  PlanPlatformMigrationQuery,
  type QueryBus,
  StatusPlatformMigrationQuery,
  VerifyPlatformMigrationQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Migration CLI", () => {
  test("[MIG-SURFACE-009] migrate plan reads a strict bundle and prints the shared plan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-migrate-cli-"));
    temporaryPaths.push(directory);
    const bundlePath = join(directory, "migration.json");
    const bundle = {
      apiVersion: "appaloft.io/migration/v1" as const,
      kind: "MigrationBundle" as const,
      metadata: { name: "Fresh web migration" },
      spec: {
        project: { name: "Storefront" },
        environment: { name: "production", kind: "production" as const },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: {
              kind: "remote-git" as const,
              locator: "https://github.com/acme/storefront.git",
            },
          },
        ],
        variables: [],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    };
    await writeFile(bundlePath, JSON.stringify(bundle), "utf8");
    const plan = createMigrationPlan(bundle);
    if (plan.isErr()) throw plan.error;

    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok(undefined) } as unknown as CommandBus,
      queryBus: { execute: async () => ok(plan.value) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_migrate_plan" }),
      },
    });
    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(["node", "appaloft", "migrate", "plan", "--input", bundlePath]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(output.join("")).toContain('"protocol": "platform-migration/v1"');
    expect(output.join("")).toContain('"operationKey": "projects.create"');
  });

  test("[MIG-SOURCE-002][MIG-SURFACE-009] migrate plan --from railway dispatches a neutral bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-migrate-railway-cli-"));
    temporaryPaths.push(directory);
    const exportPath = join(directory, "railway.json");
    await writeFile(
      exportPath,
      JSON.stringify({
        apiVersion: "railway.appaloft.io/export/v1",
        kind: "RailwayProjectExport",
        metadata: { name: "Railway Web", projectId: "railway_private_id" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        services: [
          {
            ref: "web",
            name: "Web",
            source: { image: "ghcr.io/acme/web:latest" },
          },
        ],
      }),
      "utf8",
    );
    let captured: PlanPlatformMigrationQuery | undefined;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: { execute: async () => ok(undefined) } as unknown as CommandBus,
      queryBus: {
        execute: async (_context, query) => {
          captured = query as PlanPlatformMigrationQuery;
          return createMigrationPlan(captured.bundle);
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_migrate_railway" }),
      },
    });
    const processWrite = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "migrate",
        "plan",
        "--from",
        "railway",
        "--input",
        exportPath,
      ]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(captured).toBeInstanceOf(PlanPlatformMigrationQuery);
    expect(captured?.bundle.metadata.source?.provider).toBe("railway");
    expect(JSON.stringify(captured?.bundle)).not.toContain("railway_private_id");
  });

  test("[MIG-SURFACE-009][MIG-APPLY-004] migrate apply requires the accepted plan digest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-migrate-apply-cli-"));
    temporaryPaths.push(directory);
    const planPath = join(directory, "plan.json");
    const plan = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Fresh web migration" },
      spec: {
        project: { name: "Storefront" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/storefront.git" },
          },
        ],
        variables: [],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    });
    if (plan.isErr()) throw plan.error;
    await writeFile(planPath, JSON.stringify(plan.value), "utf8");

    const output: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async () =>
          ok({
            protocol: "platform-migration/v1",
            planDigest: plan.value.planDigest,
            state: "completed",
            receipts: [],
            resume: { remainingStepIds: [], cleanupStepIds: [] },
          }),
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok(undefined) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_migrate_apply" }),
      },
    });
    const processWrite = process.stdout.write;
    process.stdout.write = ((chunk) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync([
        "node",
        "appaloft",
        "migrate",
        "apply",
        "--plan",
        planPath,
        "--confirm",
        plan.value.planDigest,
      ]);
    } finally {
      process.stdout.write = processWrite;
    }

    expect(output.join("")).toContain('"state": "completed"');
    expect(output.join("")).toContain(`"planDigest": "${plan.value.planDigest}"`);
  });

  test("[MIG-FAIL-006][MIG-SURFACE-009] migrate apply --task resumes validated prior receipts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-migrate-resume-cli-"));
    temporaryPaths.push(directory);
    const taskPath = join(directory, "task.json");
    const plan = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Resume migration" },
      spec: {
        project: { name: "Resume" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Resume Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/resume.git" },
          },
        ],
      },
    });
    if (plan.isErr()) throw plan.error;
    const priorReceipt = {
      stepId: plan.value.steps[0]?.id as string,
      operationKey: plan.value.steps[0]?.operationKey as string,
      state: "completed" as const,
      output: { projectId: "prj_resume" },
      ownership: "created" as const,
    };
    await writeFile(
      taskPath,
      JSON.stringify({ plan: plan.value, receipts: [priorReceipt] }),
      "utf8",
    );
    let dispatched: ApplyPlatformMigrationCommand | undefined;
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async (_context, command) => {
          dispatched = command as ApplyPlatformMigrationCommand;
          return ok({
            protocol: "platform-migration/v1",
            planDigest: plan.value.planDigest,
            state: "completed",
            receipts: [priorReceipt],
            resume: { remainingStepIds: [], cleanupStepIds: [priorReceipt.stepId] },
          });
        },
      } as unknown as CommandBus,
      queryBus: { execute: async () => ok(undefined) } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_migrate_resume" }),
      },
    });

    await program.parseAsync([
      "node",
      "appaloft",
      "migrate",
      "apply",
      "--task",
      taskPath,
      "--confirm",
      plan.value.planDigest,
    ]);

    expect(dispatched).toBeInstanceOf(ApplyPlatformMigrationCommand);
    expect(dispatched?.priorReceipts).toEqual([priorReceipt]);
  });

  test("[MIG-SURFACE-009][MIG-READ-005][MIG-VERIFY-007][MIG-CLEAN-008] exposes shared task readback and owner-confirmed cleanup commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "appaloft-migrate-task-cli-"));
    temporaryPaths.push(directory);
    const taskPath = join(directory, "task.json");
    const plan = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Task migration" },
      spec: {
        project: { name: "Task" },
        environment: { name: "production", kind: "production" },
        target: { deploymentTargetId: "srv_prod" },
        resources: [
          {
            ref: "web",
            name: "Web",
            source: { kind: "remote-git", locator: "https://github.com/acme/web.git" },
          },
        ],
      },
    });
    if (plan.isErr()) throw plan.error;
    await writeFile(taskPath, JSON.stringify({ plan: plan.value, receipts: [] }), "utf8");
    const dispatched: string[] = [];
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus: {
        execute: async (_context, command) => {
          dispatched.push(command.constructor.name);
          return ok({
            protocol: "platform-migration/v1",
            planDigest: plan.value.planDigest,
            state: "completed",
            actions: [],
            skippedStepIds: [],
            remainingStepIds: [],
          });
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async (_context, query) => {
          dispatched.push(query.constructor.name);
          return ok({
            protocol: "platform-migration/v1",
            planDigest: plan.value.planDigest,
            state: query instanceof StatusPlatformMigrationQuery ? "partial" : "passed",
            completedStepIds: [],
            pendingStepIds: plan.value.steps.map((step) => step.id),
            evidence: [],
          });
        },
      } as unknown as QueryBus,
      executionContextFactory: {
        create: (input) => createExecutionContext({ ...input, requestId: "req_migrate_task" }),
      },
    });

    await program.parseAsync(["node", "appaloft", "migrate", "status", "--task", taskPath]);
    await program.parseAsync(["node", "appaloft", "migrate", "verify", "--task", taskPath]);
    await program.parseAsync([
      "node",
      "appaloft",
      "migrate",
      "cleanup",
      "--task",
      taskPath,
      "--confirm",
      plan.value.planDigest,
    ]);

    expect(dispatched).toEqual([
      StatusPlatformMigrationQuery.name,
      VerifyPlatformMigrationQuery.name,
      CleanupPlatformMigrationCommand.name,
    ]);
  });
});
