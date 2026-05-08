import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  CleanupPreviewCommand,
  type Command,
  type CommandBus,
  CreateDeploymentCommand,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type Query,
  type QueryBus,
  RedeployDeploymentCommand,
  RestartResourceRuntimeCommand,
  RetryDeploymentCommand,
  RollbackDeploymentCommand,
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

  test("[CONTROL-PLANE-HANDSHAKE-017] Action server config endpoint fails before mutation when profile application is required", async () => {
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
          text: ["runtime:", "  strategy: static", "  publishDirectory: dist"].join("\n"),
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
