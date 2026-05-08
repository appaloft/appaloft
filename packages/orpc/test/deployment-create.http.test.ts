import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CleanupPreviewCommand,
  type Command,
  type CommandBus,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  CreateDeploymentCommand,
  CreateDomainBindingCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RedeployDeploymentCommand,
  RestartResourceRuntimeCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
  SetEnvironmentVariableCommand,
  ShowResourceQuery,
  ShowServerQuery,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type SourceLinkUpsertSpec,
  StartResourceRuntimeCommand,
  StopResourceRuntimeCommand,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { type ActionSourcePackageConfigReader, mountAppaloftOrpcRoutes } from "../src";

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
        ok({} as T),
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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

  test("[CONTROL-PLANE-HANDSHAKE-008] dispatches Action server-mode deployment from source link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_from_source_link" } as T);
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, _query: Query<T>): Promise<Result<T>> =>
        ok({} as T),
    } as QueryBus;
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) =>
        ok({
          sourceFingerprint:
            "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_prod",
          destinationId: "dst_prod",
          updatedAt: "2026-05-07T00:00:00.000Z",
        }),
      upsert: async (_record: SourceLinkRecord, _spec: SourceLinkUpsertSpec) => ok(_record),
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } as SourceLinkRepository;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
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

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      id: "dep_from_source_link",
      deploymentHref: "/deployments/dep_from_source_link",
    });
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-010] Action server-mode explicit ids bootstrap source link", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let createdLink: SourceLinkRecord | undefined;
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
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) => ok(null),
      upsert: async (record: SourceLinkRecord, _spec: SourceLinkUpsertSpec) => {
        createdLink = record;
        return ok(record);
      },
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } as SourceLinkRepository;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
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
    expect(capturedCommand).toBeInstanceOf(CreateDeploymentCommand);
    expect(capturedCommand).toMatchObject({
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
    });
    expect(createdLink).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      destinationId: "dst_prod",
      reason: "github-action-source-link-bootstrap",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-010] Action server-mode explicit ids cannot retarget source link", async () => {
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
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) =>
        ok({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_console",
          environmentId: "env_prod",
          resourceId: "res_www",
          serverId: "srv_prod",
          updatedAt: "2026-05-07T00:00:00.000Z",
        }),
      upsert: async (_record: SourceLinkRecord, _spec: SourceLinkUpsertSpec) => ok(_record),
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } as SourceLinkRepository;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
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

    expect(response.status).toBe(400);
    expect(capturedCommand).toBeUndefined();
  });

  test("[CONTROL-PLANE-HANDSHAKE-008] Action server-mode source-link deployment fails without link", async () => {
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
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) => ok(null),
      upsert: async (_record: SourceLinkRecord, _spec: SourceLinkUpsertSpec) => ok(_record),
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } as SourceLinkRepository;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
    });

    const response = await app.handle(
      new Request("http://localhost/api/action/deployments/from-source-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceFingerprint: "source-fingerprint:v1:missing",
        }),
      }),
    );

    expect(response.status).toBe(404);
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint dispatches ids-only deployment for an existing resource", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        capturedCommand = command as Command<unknown>;
        return ok({ id: "dep_from_config_package" } as T);
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint resolves existing source-link context without trusted ids", async () => {
    let capturedCommand: Command<unknown> | undefined;
    const sourceLinkRecord = {
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      projectId: "prj_linked",
      environmentId: "env_linked",
      resourceId: "res_linked",
      serverId: "srv_linked",
      destinationId: "dst_linked",
      updatedAt: "2026-05-08T00:00:00.000Z",
      reason: "test-source-link",
    } satisfies SourceLinkRecord;
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) => ok(sourceLinkRecord),
      upsert: async (
        record: SourceLinkRecord,
        _spec: SourceLinkUpsertSpec,
      ): Promise<Result<SourceLinkRecord>> => ok(record),
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } satisfies SourceLinkRepository;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
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
    });
  });

  test("[CONFIG-FILE-ENTRY-028] Action server config endpoint bootstraps source-link context from trusted ids", async () => {
    let capturedCommand: Command<unknown> | undefined;
    let upsertedRecord: SourceLinkRecord | undefined;
    const sourceLinkRepository = {
      findOne: async (_spec: SourceLinkSelectionSpec) => ok(null),
      upsert: async (
        record: SourceLinkRecord,
        _spec: SourceLinkUpsertSpec,
      ): Promise<Result<SourceLinkRecord>> => {
        upsertedRecord = record;
        return ok(record);
      },
      deleteOne: async (_spec: SourceLinkSelectionSpec) => ok(false),
    } satisfies SourceLinkRepository;
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      actionSourcePackageConfigReader,
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
      sourceLinkRepository,
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
    expect(upsertedRecord).toMatchObject({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      projectId: "prj_console",
      environmentId: "env_prod",
      resourceId: "res_www",
      serverId: "srv_prod",
      reason: "github-action-server-config-bootstrap",
    });
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies runtime, network, and health profile commands before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
      ConfigureResourceRuntimeCommand,
      ConfigureResourceNetworkCommand,
      ConfigureResourceHealthCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
      resourceId: "res_www",
      runtimeProfile: {
        strategy: "static",
        runtimeName: "docs",
        installCommand: "bun install --frozen-lockfile",
        buildCommand: "bun run build",
        publishDirectory: "dist",
      },
    });
    expect(capturedCommands[1]).toMatchObject({
      resourceId: "res_www",
      networkProfile: {
        internalPort: 80,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    });
    expect(capturedCommands[2]).toMatchObject({
      resourceId: "res_www",
      healthCheck: {
        enabled: true,
        type: "http",
        http: {
          path: "/ready",
        },
      },
    });
    expect(capturedCommands[3]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies plain environment variables before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
      SetEnvironmentVariableCommand,
      SetEnvironmentVariableCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
      environmentId: "env_prod",
      key: "PUBLIC_SITE",
      value: "https://www.example.com",
      kind: "plain-config",
      exposure: "build-time",
      scope: "environment",
      isSecret: false,
    });
    expect(capturedCommands[1]).toMatchObject({
      environmentId: "env_prod",
      key: "HOST",
      value: "0.0.0.0",
      kind: "plain-config",
      exposure: "runtime",
      scope: "environment",
      isSecret: false,
    });
    expect(capturedCommands[2]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint applies resolved CI secrets before deployment", async () => {
    const capturedCommands: Command<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
      SetEnvironmentVariableCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
      environmentId: "env_prod",
      key: "APPALOFT_BETTER_AUTH_SECRET",
      value: "resolved-ci-secret",
      kind: "secret",
      exposure: "runtime",
      scope: "environment",
      isSecret: true,
    });
    expect(capturedCommands[1]).toBeInstanceOf(CreateDeploymentCommand);
  });

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint rejects missing resolved CI secrets before mutation", async () => {
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
            "secrets:",
            "  APPALOFT_BETTER_AUTH_SECRET:",
            "    from: ci-env:APPALOFT_BETTER_AUTH_SECRET",
          ].join("\n"),
          fileName: "appaloft.yml",
        }),
    } satisfies ActionSourcePackageConfigReader;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
        capturedCommands.push(command as Command<unknown>);
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
      CreateDomainBindingCommand,
      CreateDomainBindingCommand,
      CreateDeploymentCommand,
    ]);
    expect(capturedCommands[0]).toMatchObject({
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
    expect(capturedCommands[1]).toMatchObject({
      domainName: "www.example.com",
      redirectTo: "docs.example.com",
      redirectStatus: 308,
    });
    expect(capturedCommands[2]).toBeInstanceOf(CreateDeploymentCommand);
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_failed/retry", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/resources/res_demo/redeploy", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/dep_failed/rollback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const stopResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/stop", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          deploymentId: "dep_current",
          reason: "operator-request",
        }),
      }),
    );
    const startResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          acknowledgeRetainedRuntimeMetadata: true,
        }),
      }),
    );
    const restartResponse = await app.handle(
      new Request("http://localhost/api/resources/res_demo/runtime/restart", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      executionContextFactory: new TestExecutionContextFactory(),
      logger: new NoopLogger(),
      queryBus,
    });

    const response = await app.handle(
      new Request("http://localhost/api/deployments/cleanup-preview", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
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
});
