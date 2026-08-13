import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { domainError, err, ok } from "@appaloft/core";

import { applyMigrationPlan, createMigrationPlan, type MigrationCommandDispatcher } from "../src";

describe("Platform migration apply", () => {
  test("[MIG-APPLY-004] applies an accepted digest and returns ordered safe receipts", async () => {
    const planned = createMigrationPlan({
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
            network: { internalPort: 3000 },
          },
        ],
        variables: [],
        dependencies: [],
        volumes: [],
        domains: [],
      },
    });
    if (planned.isErr()) throw planned.error;

    const dispatcher: MigrationCommandDispatcher = {
      async execute(command) {
        switch (command.constructor.name) {
          case "CreateProjectCommand":
            return ok({ id: "prj_storefront" });
          case "CreateEnvironmentCommand":
            return ok({ id: "env_production" });
          case "CreateResourceCommand":
            return ok({ id: "res_web" });
          case "CreateDeploymentCommand":
            return ok({ id: "dep_web" });
          default:
            return err(
              domainError.infra("Unexpected migration command", {
                command: command.constructor.name,
              }),
            );
        }
      },
    };

    const applied = await applyMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest: planned.value.planDigest,
      dispatcher,
    });

    expect(applied.isOk()).toBe(true);
    if (applied.isErr()) throw applied.error;
    expect(applied.value.state).toBe("completed");
    expect(applied.value.receipts).toEqual([
      {
        stepId: "project:create",
        operationKey: "projects.create",
        state: "completed",
        output: { projectId: "prj_storefront" },
        ownership: "created",
      },
      {
        stepId: "environment:create",
        operationKey: "environments.create",
        state: "completed",
        output: { environmentId: "env_production" },
        ownership: "created",
      },
      {
        stepId: "resource:create:web",
        operationKey: "resources.create",
        state: "completed",
        output: { resourceId: "res_web" },
        ownership: "created",
      },
      {
        stepId: "deployment:create:web",
        operationKey: "deployments.create",
        state: "completed",
        output: { deploymentId: "dep_web" },
        ownership: "created",
      },
    ]);
  });

  test("[MIG-APPLY-004][MIG-FAIL-006] resumes from contiguous receipts without repeating completed effects", async () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Resume web migration" },
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
    if (planned.isErr()) throw planned.error;

    const dispatcher: MigrationCommandDispatcher = {
      async execute(command) {
        if (command.constructor.name === "CreateResourceCommand") return ok({ id: "res_web" });
        if (command.constructor.name === "CreateDeploymentCommand") return ok({ id: "dep_web" });
        return err(
          domainError.conflict("Completed migration effect was dispatched again", {
            command: command.constructor.name,
          }),
        );
      },
    };

    const applied = await applyMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest: planned.value.planDigest,
      dispatcher,
      priorReceipts: [
        {
          stepId: "project:create",
          operationKey: "projects.create",
          state: "completed",
          output: { projectId: "prj_storefront" },
          ownership: "created",
        },
        {
          stepId: "environment:create",
          operationKey: "environments.create",
          state: "completed",
          output: { environmentId: "env_production" },
          ownership: "created",
        },
      ],
    });

    expect(applied.isOk()).toBe(true);
    if (applied.isErr()) throw applied.error;
    expect(applied.value.state).toBe("completed");
    expect(applied.value.receipts.map((receipt) => receipt.stepId)).toEqual([
      "project:create",
      "environment:create",
      "resource:create:web",
      "deployment:create:web",
    ]);
  });

  test("[MIG-CLEAN-008] records an explicitly reused operation so cleanup cannot own it", async () => {
    const planned = createMigrationPlan({
      apiVersion: "appaloft.io/migration/v1",
      kind: "MigrationBundle",
      metadata: { name: "Reused ownership migration" },
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
      },
    });
    if (planned.isErr()) throw planned.error;

    const applied = await applyMigrationPlan({
      plan: planned.value,
      confirmedPlanDigest: planned.value.planDigest,
      dispatcher: {
        async execute(command) {
          switch (command.constructor.name) {
            case "CreateProjectCommand":
              return ok({ id: "prj_storefront", reused: true });
            case "CreateEnvironmentCommand":
              return ok({ id: "env_production" });
            case "CreateResourceCommand":
              return ok({ id: "res_web" });
            case "CreateDeploymentCommand":
              return ok({ id: "dep_web" });
            default:
              return err(domainError.infra("Unexpected migration command"));
          }
        },
      },
    });

    expect(applied.isOk()).toBe(true);
    if (applied.isErr()) throw applied.error;
    expect(applied.value.receipts[0]?.ownership).toBe("reused");
    expect(
      applied.value.receipts.slice(1).every((receipt) => receipt.ownership === "created"),
    ).toBe(true);
  });
});
