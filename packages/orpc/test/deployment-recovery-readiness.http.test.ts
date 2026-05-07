import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeploymentRecoveryReadinessQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { type DeploymentRecoveryReadinessResponse } from "@appaloft/contracts";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_deployment_recovery_readiness_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

function recoveryReadiness(): DeploymentRecoveryReadinessResponse {
  return {
    schemaVersion: "deployments.recovery-readiness/v1",
    deploymentId: "dep_demo",
    resourceId: "res_web",
    generatedAt: "2026-01-01T00:00:10.000Z",
    stateVersion: "dep_demo:failed:2026-01-01T00:00:09.000Z:3",
    recoverable: true,
    retryable: true,
    redeployable: true,
    rollbackReady: false,
    rollbackCandidateCount: 0,
    retry: {
      allowed: true,
      commandActive: true,
      targetOperation: "deployments.retry",
      reasons: [],
    },
    redeploy: {
      allowed: true,
      commandActive: true,
      targetOperation: "deployments.redeploy",
      reasons: [],
    },
    rollback: {
      allowed: false,
      commandActive: false,
      reasons: [
        {
          code: "rollback-candidate-not-successful",
          category: "blocked",
          phase: "recovery-readiness",
          retriable: false,
        },
      ],
      candidates: [],
    },
    recommendedActions: [
      {
        kind: "query",
        targetOperation: "deployments.show",
        label: "Inspect deployment detail",
        safeByDefault: true,
      },
    ],
  };
}

describe("deployment recovery readiness HTTP route", () => {
  test("[DEP-RECOVERY-HTTP-001] dispatches DeploymentRecoveryReadinessQuery through HTTP", async () => {
    let capturedQuery: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        capturedQuery = query as Query<unknown>;
        return ok(recoveryReadiness() as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_demo/recovery-readiness", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "deployments.recovery-readiness/v1",
      deploymentId: "dep_demo",
      retryable: true,
    });
    expect(capturedQuery).toBeInstanceOf(DeploymentRecoveryReadinessQuery);
    expect(capturedQuery).toMatchObject({
      deploymentId: "dep_demo",
      includeCandidates: true,
    });
  });
});
