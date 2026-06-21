import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type ActionDeployTokenAuthorizationPort,
  type AppLogger,
  ApplyActionPreviewRouteCommand,
  ArchiveDeploymentCommand,
  CancelDeploymentCommand,
  CleanupPreviewCommand,
  type Command,
  type CommandBus,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  ConfirmActionPreviewRouteCommand,
  CreateActionSourceLinkDeploymentCommand,
  CreateDeploymentCommand,
  CreateDomainBindingCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  ForceRedeployDeploymentCommand,
  type ProductSessionAuthorizationPort,
  PruneDeploymentsCommand,
  type Query,
  type QueryBus,
  RedeployDeploymentCommand,
  ResolveActionServerConfigDeploymentTargetCommand,
  ResolvePreviewPullRequestContextQuery,
  RestartResourceRuntimeCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
  SetEnvironmentVariableCommand,
  ShowResourceQuery,
  ShowServerQuery,
  StartResourceRuntimeCommand,
  StopResourceRuntimeCommand,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import {
  type ActionSourcePackageConfigReader,
  mountAppaloftOrpcRoutes,
  type RequestContextRunnerOptions,
} from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_deployment_create_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
    });
  }
}

const actionDeployToken = "test_action_deploy_token";
const actionDeployTokenHeaders = {
  authorization: `Bearer ${actionDeployToken}`,
} as const;
const productJsonHeaders = {
  cookie: "better-auth.session_token=test-admin-session",
  "content-type": "application/json",
} as const;

const testActionDeployTokenAuthorizationPort: ActionDeployTokenAuthorizationPort = {
  authorize: async (_context, input) => {
    if (input.token !== actionDeployToken) {
      return err({
        code: "action_auth_invalid",
        category: "user",
        message: "Action deploy token is invalid",
        retryable: false,
        details: {
          phase: "action-authentication",
          workflow: input.workflow,
        },
      });
    }

    return ok({
      actor: {
        kind: "deploy-token",
        id: "dtok_test",
        label: "Test deploy token",
      },
    });
  },
};

const testProductSessionAuthorizationPort: ProductSessionAuthorizationPort = {
  authorizeProductSession: async (_context, input) =>
    ok({
      actor: {
        kind: "user",
        id: "usr_test_admin",
        label: "test-admin@example.com",
      },
      email: "test-admin@example.com",
      organizationId: "org_test",
      role: input.requiredRole,
      userId: "usr_test_admin",
    }),
};

function mountDeploymentCreateHttpRoutes(
  app: Elysia,
  context: Parameters<typeof mountAppaloftOrpcRoutes>[1],
) {
  return mountAppaloftOrpcRoutes(app, {
    actionDeployTokenAuthorizationPort: testActionDeployTokenAuthorizationPort,
    productSessionAuthorizationPort: testProductSessionAuthorizationPort,
    ...context,
  });
}

function actionServerConfigTarget(command: ResolveActionServerConfigDeploymentTargetCommand) {
  return {
    sourceFingerprint: command.sourceFingerprint,
    projectId: command.trustedContext?.projectId ?? "prj_console",
    environmentId: command.trustedContext?.environmentId ?? "env_prod",
    resourceId: command.trustedContext?.resourceId ?? "res_www",
    serverId: command.trustedContext?.serverId ?? "srv_prod",
    ...(command.trustedContext?.destinationId
      ? { destinationId: command.trustedContext.destinationId }
      : {}),
    updatedAt: "2026-05-08T00:00:00.000Z",
    reason: "test-source-link",
  };
}

describe("deployment create HTTP route", () => {
  test("[MIN-CONSOLE-OPS-001] dispatches ids-only CreateDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_minimum" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok(
          _query instanceof ShowDeploymentQuery
            ? ({
                schemaVersion: "deployments.show/v1",
                deployment: {
                  id: "dep_preview_config",
                  runtimePlan: {
                    execution: {
                      accessRoutes: [
                        {
                          proxyKind: "traefik",
                          domains: ["pr-42.preview.example.com"],
                          pathPrefix: "/",
                          tlsMode: "disabled",
                        },
                      ],
                    },
                  },
                },
              } as T)
            : ({} as T),
        ),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          projectId: "prj_demo",
          serverId: "srv_demo",
          destinationId: "dst_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "dep_minimum" });
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
    });
  });

  test("[SWARM-TARGET-ADM-001] rejects Swarm deployment fields before HTTP dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_swarm_fields" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          projectId: "prj_demo",
          serverId: "srv_demo",
          destinationId: "dst_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          namespace: "prod",
          stack: "web",
          service: "api",
          replicas: 3,
          updatePolicy: "start-first",
          registrySecret: "resource-secret:REGISTRY_TOKEN",
          ingress: { host: "www.example.com" },
          manifest: { services: {} },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-001] Action deployment rejects missing deploy token before command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_auth_missing",
        details: {
          workflow: "source-link-deploy",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-002] Action deployment rejects invalid deploy token before command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid_action_deploy_token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_auth_invalid",
        details: {
          workflow: "source-link-deploy",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-004] Action deployment rejects scope mismatch before command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedRequestedProjectId: string | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionDeployTokenAuthorizationPort: {
        authorize: async (_context, input) => {
          if (input.token !== actionDeployToken) {
            return err({
              code: "action_auth_invalid",
              category: "user",
              message: "Action deploy token is invalid",
              retryable: false,
              details: {
                endpoint: input.path,
                phase: "action-authentication",
                reasonCode: "unknown",
                workflow: input.workflow,
              },
            });
          }

          capturedRequestedProjectId = input.requestedScope?.projectId;
          if (input.requestedScope?.projectId === "prj_blocked") {
            return err({
              code: "action_auth_forbidden",
              category: "user",
              message: "Action deploy token is not authorized for this request",
              retryable: false,
              details: {
                endpoint: input.path,
                missingScope: "project",
                phase: "action-authorization",
                projectId: input.requestedScope.projectId,
                workflow: input.workflow,
              },
            });
          }

          return ok({
            actor: {
              kind: "deploy-token",
              id: "dtok_scoped",
            },
          });
        },
      },
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          projectId: "prj_blocked",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_auth_forbidden",
        details: {
          missingScope: "project",
          phase: "action-authorization",
          projectId: "prj_blocked",
          workflow: "source-link-deploy",
        },
      },
    });
    expect(capturedRequestedProjectId).toBe("prj_blocked");
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-008][SELF-AUTH-ACTION-003] dispatches Action server-mode deployment from source link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedContext: ExecutionContext | undefined;
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedContext = context;
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_from_source_link" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_from_source_link",
      deploymentHref: "/deployments/dep_from_source_link",
    });
    expect(capturedCommand).toBeInstanceOf(CreateActionSourceLinkDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      executionMode: "detached",
    });
    expect(capturedContext?.actor).toEqual({
      kind: "deploy-token",
      id: "dtok_test",
      label: "Test deploy token",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-010] Action server-mode explicit ids bootstrap source link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_bootstrap_source_link" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_prod",
          destinationId: "dst_prod",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_bootstrap_source_link",
      deploymentHref: "/deployments/dep_bootstrap_source_link",
    });
    expect(capturedCommand).toBeInstanceOf(CreateActionSourceLinkDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-010] Action server-mode explicit ids cannot retarget source link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_other",
          serverId: "srv_prod",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommand).toBeInstanceOf(CreateActionSourceLinkDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      resourceId: "res_other",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-008] Action server-mode source-link deployment fails without link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint: "source-fingerprint:v1:missing",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommand).toBeInstanceOf(CreateActionSourceLinkDeploymentCommand);
  });

  test("[SELF-AUTH-ACTION-001][SELF-AUTH-ACTION-006] Action server config deployment rejects missing deploy token before mutation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            environmentId: "env_prod",
            projectId: "prj_console",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_auth_missing",
        details: {
          workflow: "server-config-deploy",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-004][SELF-AUTH-ACTION-006] Action server config deployment forwards repository scope to auth", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedRequestedRepositoryFullName: string | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionDeployTokenAuthorizationPort: ActionDeployTokenAuthorizationPort = {
      authorize: async (_context, input) => {
        capturedRequestedRepositoryFullName = input.requestedScope?.repositoryFullName;
        return err({
          code: "action_auth_forbidden",
          category: "user",
          message: "Action deploy token is not authorized for this request",
          retryable: false,
          details: {
            deniedScope: "repository",
            endpoint: input.path,
            missingScope: "repository",
            phase: "action-authorization",
            reasonCode: "scope_value_not_allowed",
            repositoryFullName: input.requestedScope?.repositoryFullName ?? null,
            workflow: input.workflow,
          },
        });
      },
    };
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionDeployTokenAuthorizationPort,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(capturedRequestedRepositoryFullName).toBe("appaloft/www");
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_auth_forbidden",
        details: {
          deniedScope: "repository",
          missingScope: "repository",
          reasonCode: "scope_value_not_allowed",
          repositoryFullName: "appaloft/www",
          workflow: "server-config-deploy",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-015] Action server config endpoint rejects unsafe package paths before mutation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "../appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "../appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
            repositoryFullName: "appaloft/www",
            repositoryId: "1214783645",
            ref: "refs/pull/26/merge",
            revision: "abc123",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "source-package-validation",
          field: "configPath",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-015] Action server config endpoint reports bootstrap gap after package validation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "config-bootstrap",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-016] Action server config endpoint rejects committed identity config before mutation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let readConfigCalled = false;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () => {
        readConfigCalled = true;
        return ok({
          text: ["projectId: prj_committed", "runtime:", "  strategy: static"].join("\n"),
          fileName: "appaloft.yml",
        });
      },
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "config-identity",
        },
      },
    });
    expect(readConfigCalled).toBe(true);
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-016] Action server config endpoint rejects committed secret config before mutation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "env:",
            "  DATABASE_URL: postgres://user:password@example.test/app",
            "runtime:",
            "  strategy: static",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "config-secret-validation",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-017][ACTION-SERVER-CONFIG-SPEC-010] Action server config endpoint dispatches ids-only deployment for an existing resource", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const capturedCommandContexts: ExecutionContext[] = [];
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommandContexts.push(context);
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_from_config_package" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    let capturedReadConfigInput:
      | Parameters<ActionSourcePackageConfigReader["readConfig"]>[0]
      | undefined;
    const actionSourcePackageConfigReader = {
      readConfig: async (input) => {
        capturedReadConfigInput = input;
        return ok({
          text: ["controlPlane:", "  mode: self-hosted", "  url: https://console.example.com"].join(
            "\n",
          ),
          fileName: "appaloft.yml",
        });
      },
    } satisfies ActionSourcePackageConfigReader;
    const capturedRequestContextOptions: Array<RequestContextRunnerOptions | undefined> = [];
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      requestContextRunner: {
        runWithRequest: async (_request, _context, callback, options) => {
          capturedRequestContextOptions.push(options);
          return callback();
        },
      },
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          sourcePackageCredentials: {
            githubToken: "github-token-fixture",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
            destinationId: "dst_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_from_config_package",
      deploymentHref: "/deployments/dep_from_config_package",
    });
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });
    expect(capturedReadConfigInput?.credentials).toEqual({
      githubToken: "github-token-fixture",
    });
    expect(capturedRequestContextOptions).toContainEqual({
      providerAccessTokens: {
        github: "github-token-fixture",
      },
    });
    expect(capturedCommandContexts.length).toBeGreaterThan(0);
    expect(
      capturedCommandContexts.every(
        (context) =>
          context.auth?.providerAccessTokens?.github === "github-token-fixture" &&
          context.auth?.authorizationHeader === undefined &&
          context.auth?.cookieHeader === undefined,
      ),
    ).toBe(true);
  });

  test("[CONFIG-FILE-NAMED-PROFILE-004] Action server config endpoint applies selected config profile", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        return ok({ id: "dep_from_config_profile" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "controlPlane:",
            "  mode: self-hosted",
            "  url: https://console.example.com",
            "env:",
            "  APP_ENV: production",
            "profiles:",
            "  staging:",
            "    runtime:",
            "      strategy: workspace-commands",
            "      startCommand: bun run staging",
            "    env:",
            "      APP_ENV: staging",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          configProfile: "staging",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(
      capturedCommands.find(
        (command) => command.constructor.name === "ConfigureResourceRuntimeCommand",
      ),
    ).toMatchObject({
      runtimeProfile: {
        strategy: "workspace-commands",
        startCommand: "bun run staging",
      },
    });
    expect(
      capturedCommands.find(
        (command) => command.constructor.name === "SetEnvironmentVariableCommand",
      ),
    ).toMatchObject({
      key: "APP_ENV",
      value: "staging",
      kind: "plain-config",
    });
    const deployment = capturedCommands.find(
      (command) => command.constructor.name === "CreateDeploymentCommand",
    );
    expect(deployment).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
    });
    expect("runtimeProfile" in (deployment as Record<string, unknown>)).toBe(false);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint resolves existing source-link context without trusted ids", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok({
            sourceFingerprint: command.sourceFingerprint,
            projectId: "prj_linked",
            environmentId: "env_linked",
            resourceId: "res_linked",
            serverId: "srv_linked",
            destinationId: "dst_linked",
            updatedAt: "2026-05-08T00:00:00.000Z",
            reason: "test-source-link",
          } as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_from_source_link_config_package" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: ["controlPlane:", "  mode: self-hosted", "  url: https://console.example.com"].join(
            "\n",
          ),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_from_source_link_config_package",
      deploymentHref: "/deployments/dep_from_source_link_config_package",
    });
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_linked",
      environmentId: "env_linked",
      resourceId: "res_linked",
      serverId: "srv_linked",
      destinationId: "dst_linked",
      executionMode: "detached",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-019] Action server config endpoint reports unresolved target before mutation", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return err({
            code: "action_deployment_target_unresolved",
            category: "user",
            message:
              "Action deployment target could not be resolved from source-link state, deploy token scope, or trusted bootstrap context",
            retryable: false,
            details: {
              phase: "source-link-resolution",
              sourceFingerprint: command.sourceFingerprint,
              nextActions: [
                "create-or-link-source-binding-in-console",
                "run-source-links-relink",
                "pass-one-time-trusted-bootstrap-ids",
              ],
            },
          });
        }
        capturedCommands.push(command as Command<unknown>);
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: ["controlPlane:", "  mode: self-hosted", "  url: https://console.example.com"].join(
            "\n",
          ),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amissing:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amissing:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "action_deployment_target_unresolved",
        details: {
          phase: "source-link-resolution",
          nextActions: [
            "create-or-link-source-binding-in-console",
            "run-source-links-relink",
            "pass-one-time-trusted-bootstrap-ids",
          ],
        },
      },
    });
    expect(capturedCommands).toEqual([]);
  });

  test("[CONFIG-FILE-ENTRY-029] Action server config endpoint resolves pull request preview target from preview policy", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const targetCommands: ResolveActionServerConfigDeploymentTargetCommand[] = [];
    let previewContextQuery: ResolvePreviewPullRequestContextQuery | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          targetCommands.push(command);
          if (!command.trustedContext?.projectId) {
            return err({
              code: "action_deployment_target_unresolved",
              category: "user",
              message: "Action deployment target could not be resolved",
              retryable: false,
              details: {
                phase: "source-link-resolution",
                reasonCode: "target-context-required",
              },
            });
          }

          return ok({
            sourceFingerprint: command.sourceFingerprint,
            projectId: command.trustedContext.projectId,
            environmentId: command.trustedContext.environmentId,
            resourceId: command.trustedContext.resourceId,
            serverId: command.trustedContext.serverId,
            destinationId: command.trustedContext.destinationId,
            updatedAt: "2026-05-08T00:00:00.000Z",
            reason: "github-action-preview-policy",
          } as T);
        }

        capturedCommands.push(command as Command<unknown>);
        return ok({ id: "dep_preview_policy" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        if (query instanceof ResolvePreviewPullRequestContextQuery) {
          previewContextQuery = query;
          return ok({
            projectId: "prj_cloud",
            environmentId: "env_preview",
            resourceId: "res_cloud_preview",
            serverId: "srv_yundu",
            destinationId: "dst_yundu",
            sourceBindingFingerprint: "source-binding:github:appaloft/appaloft-cloud",
          } as T);
        }

        return ok({} as T);
      },
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "runtime:",
            "  strategy: dockerfile",
            "network:",
            "  internalPort: 3001",
            "  exposureMode: reverse-proxy",
          ].join("\n"),
          fileName: "appaloft.cloud-preview.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.cloud-preview.yml",
          configPath: "appaloft.cloud-preview.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.cloud-preview.yml",
            configPath: "appaloft.cloud-preview.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/appaloft-cloud",
            repositoryId: "123456",
          },
          preview: {
            kind: "pull-request",
            previewId: "cloud-pr-1",
            pullRequestNumber: 1,
            baseRef: "main",
            headRef: "fix/v0-2-cloud-authz",
          },
          trustedContext: {
            repositoryFullName: "appaloft/appaloft-cloud",
            repositoryId: "123456",
            ref: "refs/pull/1/merge",
            revision: "abc123",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(previewContextQuery).toMatchObject({
      repositoryFullName: "appaloft/appaloft-cloud",
      providerRepositoryId: "123456",
      baseRef: "main",
    });
    expect(targetCommands).toHaveLength(2);
    expect(targetCommands[1]).toMatchObject({
      trustedContext: {
        repositoryFullName: "appaloft/appaloft-cloud",
        repositoryId: "123456",
        projectId: "prj_cloud",
        environmentId: "env_preview",
        resourceId: "res_cloud_preview",
        serverId: "srv_yundu",
        destinationId: "dst_yundu",
      },
    });
    expect(capturedCommands.at(-1)).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommands.at(-1)).toMatchObject({
      projectId: "prj_cloud",
      environmentId: "env_preview",
      resourceId: "res_cloud_preview",
      serverId: "srv_yundu",
      destinationId: "dst_yundu",
    });
  });

  test("[CONFIG-FILE-ENTRY-029] Action server config endpoint treats partial preview ids as policy hints", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const targetCommands: ResolveActionServerConfigDeploymentTargetCommand[] = [];
    let previewContextQuery: ResolvePreviewPullRequestContextQuery | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          targetCommands.push(command);
          return ok({
            sourceFingerprint: command.sourceFingerprint,
            projectId: command.trustedContext?.projectId,
            environmentId: command.trustedContext?.environmentId,
            resourceId: command.trustedContext?.resourceId,
            serverId: command.trustedContext?.serverId,
            destinationId: command.trustedContext?.destinationId,
            updatedAt: "2026-05-08T00:00:00.000Z",
            reason: "github-action-preview-policy",
          } as T);
        }

        capturedCommands.push(command as Command<unknown>);
        return ok({ id: "dep_preview_policy_hints" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        if (query instanceof ResolvePreviewPullRequestContextQuery) {
          previewContextQuery = query;
          return ok({
            projectId: "prj_cloud",
            environmentId: "env_preview",
            resourceId: "res_cloud_preview",
            serverId: "srv_yundu",
            destinationId: "dst_yundu",
            sourceBindingFingerprint: "source-binding:github:appaloft/appaloft-cloud",
          } as T);
        }

        return ok({} as T);
      },
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "runtime:",
            "  strategy: dockerfile",
            "network:",
            "  internalPort: 3001",
            "  exposureMode: reverse-proxy",
          ].join("\n"),
          fileName: "appaloft.cloud-preview.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.cloud-preview.yml",
          configPath: "appaloft.cloud-preview.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.cloud-preview.yml",
            configPath: "appaloft.cloud-preview.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/appaloft-cloud",
            repositoryId: "123456",
          },
          preview: {
            kind: "pull-request",
            previewId: "cloud-pr-1",
            pullRequestNumber: 1,
            baseRef: "main",
            headRef: "fix/preview",
          },
          trustedContext: {
            repositoryFullName: "appaloft/appaloft-cloud",
            repositoryId: "123456",
            ref: "refs/pull/1/merge",
            revision: "abc123",
            projectId: "prj_cloud",
            environmentId: "env_preview",
            serverId: "srv_yundu",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(previewContextQuery).toMatchObject({
      repositoryFullName: "appaloft/appaloft-cloud",
      providerRepositoryId: "123456",
      baseRef: "main",
    });
    expect(targetCommands).toHaveLength(1);
    expect(targetCommands[0]).toMatchObject({
      trustedContext: {
        repositoryFullName: "appaloft/appaloft-cloud",
        repositoryId: "123456",
        projectId: "prj_cloud",
        environmentId: "env_preview",
        resourceId: "res_cloud_preview",
        serverId: "srv_yundu",
        destinationId: "dst_yundu",
      },
    });
    expect(capturedCommands.at(-1)).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommands.at(-1)).toMatchObject({
      projectId: "prj_cloud",
      environmentId: "env_preview",
      resourceId: "res_cloud_preview",
      serverId: "srv_yundu",
      destinationId: "dst_yundu",
    });
  });

  test("[CONFIG-FILE-ENTRY-028] Action server config endpoint bootstraps source-link context from trusted ids", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let targetCommand: ResolveActionServerConfigDeploymentTargetCommand | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          targetCommand = command;
          return ok({
            sourceFingerprint: command.sourceFingerprint,
            projectId: command.trustedContext?.projectId ?? "prj_console",
            environmentId: command.trustedContext?.environmentId ?? "env_prod",
            resourceId: command.trustedContext?.resourceId ?? "res_www",
            serverId: command.trustedContext?.serverId ?? "srv_prod",
            updatedAt: "2026-05-08T00:00:00.000Z",
            reason: "github-action-server-config-bootstrap",
          } as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_bootstrapped_config_package" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: ["controlPlane:", "  mode: self-hosted", "  url: https://console.example.com"].join(
            "\n",
          ),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
    });
    expect(targetCommand).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      trustedContext: {
        projectId: "prj_console",
        environmentId: "env_prod",
        resourceId: "res_www",
        serverId: "srv_prod",
      },
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies runtime, network, and health profile commands before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        return ok({
          id: command instanceof CreateDeploymentCommand ? "dep_profile_config" : "res_www",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "runtime:",
            "  strategy: static",
            "  name: docs",
            "  installCommand: bun install --frozen-lockfile",
            "  buildCommand: bun run build",
            "  publishDirectory: dist",
            "  healthCheckPath: /ready",
            "network:",
            "  upstreamProtocol: http",
            "  exposureMode: reverse-proxy",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommands.map((command) => command.constructor)).toEqual([
      ConfigureResourceSourceCommand,
      ConfigureResourceRuntimeCommand,
      ConfigureResourceNetworkCommand,
      ConfigureResourceHealthCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
      resourceId: "res_www",
      source: {
        kind: "git-github-app",
        locator: "https://github.com/appaloft/www.git",
        displayName: "appaloft/www",
        repositoryFullName: "appaloft/www",
        commitSha: "abc123",
      },
    });
    expect(capturedCommands[1]).toMatchObject({
      resourceId: "res_www",
      runtimeProfile: {
        strategy: "static",
        runtimeName: "docs",
        installCommand: "bun install --frozen-lockfile",
        buildCommand: "bun run build",
        publishDirectory: "dist",
      },
    });
    expect(capturedCommands[2]).toMatchObject({
      resourceId: "res_www",
      networkProfile: {
        internalPort: 80,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    expect(capturedCommands[3]).toMatchObject({
      resourceId: "res_www",
      healthCheck: {
        enabled: true,
        type: "http",
        http: {
          path: "/ready",
        },
      },
    });
    expect(capturedCommands[4]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config preview renders runtime name templates before applying profile commands", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        return ok({
          id:
            command instanceof CreateDeploymentCommand
              ? "dep_preview_runtime_template"
              : `cmd_${capturedCommands.length}`,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "runtime:",
            "  strategy: dockerfile",
            "  name: cloud-pr-{pr_number}",
            "  dockerfilePath: Dockerfile",
          ].join("\n"),
          fileName: "appaloft.preview.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.preview.yml",
          configPath: "appaloft.preview.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:preview%3Apr%3A1:github:provider-repository%3A123456:.:appaloft.preview.yml",
            configPath: "appaloft.preview.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/appaloft-cloud",
          },
          preview: {
            kind: "pull-request",
            previewId: "cloud-pr-1",
            pullRequestNumber: 1,
            headRef: "fix/v0-2-cloud-authz",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_preview",
            resourceId: "res_preview",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommands.map((command) => command.constructor)).toEqual([
      ConfigureResourceSourceCommand,
      ConfigureResourceRuntimeCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
      resourceId: "res_preview",
      source: {
        kind: "git-github-app",
        locator: "https://github.com/appaloft/appaloft-cloud.git",
        displayName: "appaloft/appaloft-cloud",
        repositoryFullName: "appaloft/appaloft-cloud",
        gitRef: "fix/v0-2-cloud-authz",
        commitSha: "abc123",
      },
    });
    expect(capturedCommands[1]).toMatchObject({
      resourceId: "res_preview",
      runtimeProfile: {
        strategy: "dockerfile",
        runtimeName: "cloud-pr-1",
        dockerfilePath: "Dockerfile",
      },
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies plain environment variables before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        return ok(
          (command instanceof CreateDeploymentCommand ? { id: "dep_env_config" } : null) as T,
        );
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: ["env:", "  PUBLIC_SITE: https://www.example.com", "  HOST: 0.0.0.0"].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommands.map((command) => command.constructor)).toEqual([
      ConfigureResourceSourceCommand,
      SetEnvironmentVariableCommand,
      SetEnvironmentVariableCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[1]).toMatchObject({
      environmentId: "env_prod",
      key: "PUBLIC_SITE",
      value: "https://www.example.com",
      kind: "plain-config",
      exposure: "build-time",
      scope: "environment",
      isSecret: false,
    });
    expect(capturedCommands[2]).toMatchObject({
      environmentId: "env_prod",
      key: "HOST",
      value: "0.0.0.0",
      kind: "plain-config",
      exposure: "runtime",
      scope: "environment",
      isSecret: false,
    });
    expect(capturedCommands[3]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies resolved CI secrets before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        return ok(
          (command instanceof CreateDeploymentCommand ? { id: "dep_secret_config" } : null) as T,
        );
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "secrets:",
            "  APPALOFT_BETTER_AUTH_SECRET:",
            "    from: ci-env:APPALOFT_BETTER_AUTH_SECRET",
            "    required: true",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          resolvedSecrets: {
            APPALOFT_BETTER_AUTH_SECRET: "resolved-ci-secret",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommands.map((command) => command.constructor)).toEqual([
      ConfigureResourceSourceCommand,
      SetEnvironmentVariableCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[1]).toMatchObject({
      environmentId: "env_prod",
      key: "APPALOFT_BETTER_AUTH_SECRET",
      value: "resolved-ci-secret",
      kind: "secret",
      exposure: "runtime",
      scope: "environment",
      isSecret: true,
    });
    expect(capturedCommands[2]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint rejects missing resolved CI secrets before mutation", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "secrets:",
            "  APPALOFT_BETTER_AUTH_SECRET:",
            "    from: ci-env:APPALOFT_BETTER_AUTH_SECRET",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );
    const responseJson = await response.json();

    expect(response.status).toBe(400);
    expect(responseJson).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "config-secret-resolution",
          secretKey: "APPALOFT_BETTER_AUTH_SECRET",
          secretRef: "ci-env:APPALOFT_BETTER_AUTH_SECRET",
        },
      },
    });
    expect(JSON.stringify(responseJson)).not.toContain("resolved-ci-secret");
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies access domain commands before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        if (command instanceof ConfirmActionPreviewRouteCommand) {
          return ok({ previewUrl: "http://pr-42.preview.example.com" } as T);
        }
        return ok({
          id:
            command instanceof CreateDeploymentCommand
              ? "dep_domain_config"
              : `dmb_${capturedCommands.length}`,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        if (query instanceof ShowResourceQuery) {
          return ok({
            schemaVersion: "resources.show/v1",
            resource: {
              id: "res_www",
              projectId: "prj_console",
              environmentId: "env_prod",
              destinationId: "dst_prod",
              name: "Docs",
              slug: "docs",
              kind: "application",
              createdAt: "2026-05-08T00:00:00.000Z",
              services: [],
              deploymentCount: 0,
            },
            lifecycle: {
              status: "active",
            },
            diagnostics: [],
            generatedAt: "2026-05-08T00:00:00.000Z",
          } as T);
        }
        if (query instanceof ShowServerQuery) {
          return ok({
            schemaVersion: "servers.show/v1",
            server: {
              id: "srv_prod",
              name: "prod",
              host: "203.0.113.10",
              port: 22,
              providerKey: "ssh",
              targetKind: "single-server",
              lifecycleStatus: "active",
              edgeProxy: {
                kind: "traefik",
                status: "ready",
              },
              createdAt: "2026-05-08T00:00:00.000Z",
            },
            generatedAt: "2026-05-08T00:00:00.000Z",
          } as T);
        }
        return ok({} as T);
      },
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "access:",
            "  domains:",
            "    - host: docs.example.com",
            "      pathPrefix: /",
            "      tlsMode: auto",
            "    - host: www.example.com",
            "      pathPrefix: /",
            "      tlsMode: auto",
            "      redirectTo: docs.example.com",
            "      redirectStatus: 308",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_domain_config",
      deploymentHref: "/deployments/dep_domain_config",
    });
    expect(capturedCommands.map((command) => command.constructor)).toEqual([
      ConfigureResourceSourceCommand,
      CreateDomainBindingCommand,
      CreateDomainBindingCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[1]).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      domainName: "docs.example.com",
      pathPrefix: "/",
      proxyKind: "traefik",
      tlsMode: "auto",
    });
    expect(capturedCommands[2]).toMatchObject({
      domainName: "www.example.com",
      redirectTo: "docs.example.com",
      redirectStatus: 308,
    });
    expect(capturedCommands[3]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config preview applies transient env and preview route only", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        if (command instanceof ResolveActionServerConfigDeploymentTargetCommand) {
          return ok(actionServerConfigTarget(command) as T);
        }
        capturedCommands.push(command as Command<unknown>);
        if (command instanceof ConfirmActionPreviewRouteCommand) {
          return ok({ previewUrl: "http://pr-42.preview.example.com" } as T);
        }
        return ok({
          id:
            command instanceof CreateDeploymentCommand
              ? "dep_preview_config"
              : `cmd_${capturedCommands.length}`,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: [
            "env:",
            "  HOST: 127.0.0.1",
            "  PUBLIC_SITE: https://www.example.com",
            "access:",
            "  domains:",
            "    - host: www.example.com",
            "      pathPrefix: /",
            "      tlsMode: auto",
          ].join("\n"),
          fileName: "appaloft.preview.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:provider-repository%3A123456:.:appaloft.preview.yml",
          configPath: "appaloft.preview.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:preview%3Apr%3A42:github:provider-repository%3A123456:.:appaloft.preview.yml",
            configPath: "appaloft.preview.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          environmentVariables: {
            HOST: "0.0.0.0",
            APPALOFT_BETTER_AUTH_URL: "http://pr-42.preview.example.com",
          },
          preview: {
            kind: "pull-request",
            previewId: "pr-42",
            pullRequestNumber: 42,
          },
          previewRoute: {
            host: "pr-42.preview.example.com",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_preview",
            resourceId: "res_preview",
            serverId: "srv_prod",
            destinationId: "dst_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      id: "dep_preview_config",
      previewUrl: "http://pr-42.preview.example.com",
    });
    const environmentCommands = capturedCommands.filter(
      (command) => command instanceof SetEnvironmentVariableCommand,
    );
    const domainCommands = capturedCommands.filter(
      (command) => command instanceof CreateDomainBindingCommand,
    );
    const applyPreviewRouteCommands = capturedCommands.filter(
      (command) => command instanceof ApplyActionPreviewRouteCommand,
    );
    const confirmPreviewRouteCommands = capturedCommands.filter(
      (command) => command instanceof ConfirmActionPreviewRouteCommand,
    );
    expect(environmentCommands).toHaveLength(3);
    expect(environmentCommands).toContainEqual(
      expect.objectContaining({
        environmentId: "env_preview",
        key: "HOST",
        value: "0.0.0.0",
        kind: "plain-config",
      }),
    );
    expect(environmentCommands).toContainEqual(
      expect.objectContaining({
        key: "APPALOFT_BETTER_AUTH_URL",
        value: "http://pr-42.preview.example.com",
      }),
    );
    expect(domainCommands).toHaveLength(0);
    expect(applyPreviewRouteCommands).toHaveLength(1);
    expect(applyPreviewRouteCommands[0]).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_preview",
      resourceId: "res_preview",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A42:github:provider-repository%3A123456:.:appaloft.preview.yml",
      host: "pr-42.preview.example.com",
      pathPrefix: "/",
      tlsMode: "disabled",
    });
    expect(confirmPreviewRouteCommands).toHaveLength(1);
    expect(confirmPreviewRouteCommands[0]).toMatchObject({
      deploymentId: "dep_preview_config",
      host: "pr-42.preview.example.com",
      pathPrefix: "/",
      tlsMode: "disabled",
    });
    expect(capturedCommands.at(-2)).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint fails before mutation when unsupported source profile application is required", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_unexpected" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionSourcePackageConfigReader = {
      readConfig: async () =>
        ok({
          text: ["source:", "  baseDirectory: apps/docs"].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-config-package", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          configPath: "appaloft.yml",
          sourceRoot: ".",
          sourcePackage: {
            transport: "server-github-fetch",
            sourceFingerprint:
              "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
            configPath: "appaloft.yml",
            sourceRoot: ".",
            revision: "abc123",
            repositoryFullName: "appaloft/www",
          },
          trustedContext: {
            projectId: "prj_console",
            environmentId: "env_prod",
            resourceId: "res_www",
            serverId: "srv_prod",
          },
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_error",
        details: {
          phase: "profile-application",
        },
      },
    });
    expect(capturedCommand).toBeUndefined();
  });

  test("[DEP-RETRY-001] dispatches RetryDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_retry" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_failed/retry", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          resourceId: "res_demo",
          readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "dep_retry" });
    expect(capturedCommand).toBeInstanceOf(RetryDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      deploymentId: "dep_failed",
      resourceId: "res_demo",
      readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEP-REDEPLOY-001] dispatches RedeployDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_redeploy" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/resources/res_demo/redeploy", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          sourceDeploymentId: "dep_failed",
          readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "dep_redeploy" });
    expect(capturedCommand).toBeInstanceOf(RedeployDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_demo",
      sourceDeploymentId: "dep_failed",
      readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEP-FORCE-REDEPLOY-ENTRY-001] dispatches ForceRedeployDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_force_redeploy" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/resources/res_demo/force-redeploy", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          sourceDeploymentId: "dep_failed",
          readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "dep_force_redeploy" });
    expect(capturedCommand).toBeInstanceOf(ForceRedeployDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      resourceId: "res_demo",
      sourceDeploymentId: "dep_failed",
      readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEP-ROLLBACK-ENTRY-001] dispatches RollbackDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_rollback" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_failed/rollback", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          rollbackCandidateDeploymentId: "dep_success",
          resourceId: "res_demo",
          readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "dep_rollback" });
    expect(capturedCommand).toBeInstanceOf(RollbackDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      deploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_success",
      resourceId: "res_demo",
      readinessGeneratedAt: "2026-01-01T00:00:10.000Z",
    });
  });

  test("[DEP-CANCEL-ENTRY-002] dispatches CancelDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          id: "dep_cancel",
          status: "canceled",
          canceledAt: "2026-01-01T00:00:15.000Z",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_cancel/cancel", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          confirm: "dep_cancel",
          resourceId: "res_demo",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "dep_cancel",
      status: "canceled",
      canceledAt: "2026-01-01T00:00:15.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(CancelDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      deploymentId: "dep_cancel",
      confirm: "dep_cancel",
      resourceId: "res_demo",
    });
  });

  test("[DEP-ARCHIVE-ENTRY-002] dispatches ArchiveDeploymentCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          id: "dep_archive",
          archivedAt: "2026-01-01T00:01:00.000Z",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_archive/archive", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          confirm: "dep_archive",
          resourceId: "res_demo",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "dep_archive",
      archivedAt: "2026-01-01T00:01:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(ArchiveDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      deploymentId: "dep_archive",
      confirm: "dep_archive",
      resourceId: "res_demo",
    });
  });

  test("[DEP-ARCHIVE-ENTRY-003] normalizes oRPC archive output validation failures", async () => {
    const commandBus = {
      execute: async <T>(): Promise<Result<T>> =>
        ok({
          id: "dep_archive",
        } as T),
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_archive/archive", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          confirm: "dep_archive",
          resourceId: "res_demo",
        }),
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        code: "internal_server_error",
        category: "infra",
        message: "Output validation failed",
        retryable: false,
        details: {
          phase: "orpc-error-normalization",
          orpcCode: "INTERNAL_SERVER_ERROR",
          status: 500,
          defined: false,
        },
      },
    });
  });

  test("[DEP-PRUNE-ENTRY-002] dispatches PruneDeploymentsCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          schemaVersion: "deployments.prune/v1",
          before: "2026-01-01T00:05:00.000Z",
          resourceId: "res_demo",
          dryRun: false,
          matchedCount: 1,
          guardedCount: 0,
          prunedCount: 1,
          affectedDeploymentIds: ["dep_old"],
          guardedDeploymentIds: [],
          prunedAt: "2026-01-01T00:10:00.000Z",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/prune", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          before: "2026-01-01T00:05:00.000Z",
          resourceId: "res_demo",
          dryRun: false,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: "deployments.prune/v1",
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_demo",
      dryRun: false,
      matchedCount: 1,
      guardedCount: 0,
      prunedCount: 1,
      affectedDeploymentIds: ["dep_old"],
      guardedDeploymentIds: [],
      prunedAt: "2026-01-01T00:10:00.000Z",
    });
    expect(capturedCommand).toBeInstanceOf(PruneDeploymentsCommand);
    expect(capturedCommand).toMatchObject({
      before: "2026-01-01T00:05:00.000Z",
      resourceId: "res_demo",
      dryRun: false,
    });
  });

  test("[RUNTIME-CTRL-SURFACE-001] dispatches resource runtime control commands through HTTP", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommands.push(command as Command<unknown>);
        return ok({
          runtimeControlAttemptId: "rtc_http",
          operation: "stop",
          status: "succeeded",
          startedAt: "2026-01-01T00:00:00.000Z",
          completedAt: "2026-01-01T00:00:01.000Z",
          runtimeState: "stopped",
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const stopResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/stop", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          deploymentId: "dep_current",
          reason: "operator-request",
        }),
      }),
    );
    const startResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/start", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          acknowledgeRetainedRuntimeMetadata: true,
        }),
      }),
    );
    const restartResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/restart", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          acknowledgeRetainedRuntimeMetadata: true,
        }),
      }),
    );

    expect(stopResponse.status).toBe(202);
    expect(startResponse.status).toBe(202);
    expect(restartResponse.status).toBe(202);
    expect(capturedCommands[0]).toBeInstanceOf(StopResourceRuntimeCommand);
    expect(capturedCommands[0]).toMatchObject({
      resourceId: "res_demo",
      deploymentId: "dep_current",
      reason: "operator-request",
    });
    expect(capturedCommands[1]).toBeInstanceOf(StartResourceRuntimeCommand);
    expect(capturedCommands[1]).toMatchObject({
      resourceId: "res_demo",
      acknowledgeRetainedRuntimeMetadata: true,
    });
    expect(capturedCommands[2]).toBeInstanceOf(RestartResourceRuntimeCommand);
    expect(capturedCommands[2]).toMatchObject({
      resourceId: "res_demo",
      acknowledgeRetainedRuntimeMetadata: true,
    });
  });

  test("[DEPLOYMENTS-CLEANUP-PREVIEW-HTTP-001] dispatches CleanupPreviewCommand through HTTP", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
          status: "cleaned",
          cleanedRuntime: true,
          cleanedArtifacts: true,
          removedServerAppliedRoute: true,
          removedSourceLink: true,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: productJsonHeaders,
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
      status: "cleaned",
      cleanedRuntime: true,
      cleanedArtifacts: true,
      removedServerAppliedRoute: true,
      removedSourceLink: true,
    });
    expect(capturedCommand).toBeInstanceOf(CleanupPreviewCommand);
    expect(capturedCommand).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
    });
  });

  test("[SELF-AUTH-ACTION-001][SELF-AUTH-ACTION-007] Action preview cleanup rejects missing deploy token before command dispatch", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ status: "cleaned" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: {
          cookie: productJsonHeaders.cookie,
          "content-type": "application/json",
          "x-appaloft-action-command": "preview-cleanup",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain("action_auth_missing");
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-004][SELF-AUTH-ACTION-007] Action preview cleanup rejects repository-scoped tokens without trusted repository context", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedRequestedRepositoryFullName: string | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ status: "cleaned" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionDeployTokenAuthorizationPort: ActionDeployTokenAuthorizationPort = {
      authorize: async (_context, input) => {
        capturedRequestedRepositoryFullName = input.requestedScope?.repositoryFullName;
        return err({
          code: "action_auth_forbidden",
          category: "user",
          message: "Action deploy token is not authorized for this request",
          retryable: false,
          details: {
            deniedScope: "repository",
            endpoint: input.path,
            phase: "action-authorization",
            reasonCode: "scope_value_missing",
            workflow: input.workflow,
          },
        });
      },
    };
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionDeployTokenAuthorizationPort,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
          "x-appaloft-action-command": "preview-cleanup",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
        }),
      }),
    );

    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain("action_auth_forbidden");
    expect(body).toContain("scope_value_missing");
    expect(capturedRequestedRepositoryFullName).toBeUndefined();
    expect(capturedCommand).toBeUndefined();
  });

  test("[SELF-AUTH-ACTION-007] Action preview cleanup forwards trusted repository scope to deploy token auth", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedRequestedRepositoryFullName: string | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
          status: "cleaned",
          cleanedRuntime: true,
          cleanedArtifacts: true,
          removedServerAppliedRoute: true,
          removedSourceLink: true,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const actionDeployTokenAuthorizationPort: ActionDeployTokenAuthorizationPort = {
      authorize: async (_context, input) => {
        capturedRequestedRepositoryFullName = input.requestedScope?.repositoryFullName;
        if (input.requestedScope?.repositoryFullName !== "appaloft/www") {
          return err({
            code: "action_auth_forbidden",
            category: "user",
            message: "Action deploy token is not authorized for this request",
            retryable: false,
            details: {
              deniedScope: "repository",
              endpoint: input.path,
              phase: "action-authorization",
              reasonCode: "scope_value_missing",
              workflow: input.workflow,
            },
          });
        }

        return ok({
          actor: {
            kind: "deploy-token",
            id: "dtok_repo_scoped",
            label: "Repo scoped deploy token",
          },
        });
      },
    };
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      actionDeployTokenAuthorizationPort,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
          "x-appaloft-action-command": "preview-cleanup",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
          trustedContext: {
            repositoryFullName: "appaloft/www",
            repositoryId: "123456",
            ref: "refs/pull/42/merge",
            revision: "abc123",
          },
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedRequestedRepositoryFullName).toBe("appaloft/www");
    expect(capturedCommand).toBeInstanceOf(CleanupPreviewCommand);
  });

  test("[SELF-AUTH-ACTION-007] Action preview cleanup dispatches after deploy token auth", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let capturedContext: ExecutionContext | undefined;
    const commandBus = {
      execute: async <T>(context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedContext = context;
        capturedCommand = command as Command<unknown>;
        return ok({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
          status: "cleaned",
          cleanedRuntime: true,
          cleanedArtifacts: true,
          removedServerAppliedRoute: true,
          removedSourceLink: true,
        } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const app = mountDeploymentCreateHttpRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: {
          ...actionDeployTokenHeaders,
          "content-type": "application/json",
          "x-appaloft-action-command": "preview-cleanup",
        },
        body: JSON.stringify({
          sourceFingerprint:
            "source-fingerprint:v1:preview%3Apr%3A42:github:github.com%2Fappaloft%2Fwww:.:appaloft.docs.yml",
        }),
      }),
    );

    expect(response.status).toBe(202);
    expect(capturedCommand).toBeInstanceOf(CleanupPreviewCommand);
    expect(capturedContext?.actor).toEqual({
      kind: "deploy-token",
      id: "dtok_test",
      label: "Test deploy token",
    });
  });
});
