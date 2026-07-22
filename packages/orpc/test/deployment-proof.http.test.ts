import "../../application/node_modules/reflect-metadata/Reflect.js";
import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  createExecutionContext,
  DeploymentProofQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { type DeploymentProofResponse } from "@appaloft/contracts";
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
      requestId: input.requestId ?? "req_proof",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      principal: input.principal,
    });
  }
}
const productSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: { kind: "user", id: "usr_proof" },
      email: "proof@example.test",
      organizationId: input.organizationId ?? "org_proof",
      role: input.requiredRole,
      userId: "usr_proof",
    }),
};
function proof(): DeploymentProofResponse {
  return {
    schemaVersion: "deployments.proof/v1",
    deploymentId: "dep_demo",
    resourceId: "res_web",
    verdict: "verified",
    planned: {
      source: { reference: "acme/web" },
      artifact: { intent: "build-image", reference: "appaloft/web:v2" },
      resourceProfile: { fingerprint: "sha256:profile" },
      configuration: { fingerprint: "sha256:config" },
      runtimeTarget: { kind: "single-server", providerKey: "local-shell" },
      verificationSteps: [],
      expectedEffects: ["replace-workload"],
    },
    observed: {
      available: true,
      observedAt: "2026-07-12T10:00:00.000Z",
      artifact: { available: true, resolvedIdentity: "sha256:image" },
      workload: { available: true, generation: "dep_demo", deploymentId: "dep_demo" },
      configuration: {
        available: true,
        keyCount: 2,
        plannedKeyCount: 2,
        keyFingerprint: "sha256:keys",
        matchesPlanned: true,
        matchesPlannedKeySet: true,
      },
      health: { status: "passed", summary: "ok" },
      access: {
        status: "passed",
        summary: "redirect matched",
        routeTargetsWorkload: true,
        routes: [
          {
            url: "https://old.example.test/docs",
            routeBehavior: "redirect",
            expectedRedirectStatus: 301,
            expectedRedirectTo: "https://app.example.test/docs",
            observedStatus: 301,
            observedRedirectTo: "https://app.example.test/docs",
            matched: true,
          },
        ],
      },
      recovery: {},
    },
    mismatches: [],
    evidence: [],
    unavailableEvidence: [],
    generatedAt: "2026-07-12T10:00:00.000Z",
    stateVersion: "v1",
  };
}

describe("deployment proof HTTP route", () => {
  test("[DEP-PROOF-CONTRACT-001][DEP-PROOF-SCOPE-001] dispatches DeploymentProofQuery", async () => {
    let captured: Query<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
        ok({} as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        captured = query as Query<unknown>;
        return ok(proof() as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      queryBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      productSessionAuthorizationPort,
    });
    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_demo/proof", {
        headers: { cookie: "better-auth.session_token=proof-test" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      schemaVersion: "deployments.proof/v1",
      verdict: "verified",
      observed: {
        configuration: {
          keyCount: 2,
          plannedKeyCount: 2,
          keyFingerprint: "sha256:keys",
          matchesPlannedKeySet: true,
        },
        access: {
          routes: [
            {
              routeBehavior: "redirect",
              expectedRedirectStatus: 301,
              observedRedirectTo: "https://app.example.test/docs",
              matched: true,
            },
          ],
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("marker-secret-value");
    expect(captured).toBeInstanceOf(DeploymentProofQuery);
    expect(captured).toMatchObject({ deploymentId: "dep_demo" });
  });
});
