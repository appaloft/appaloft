import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

describe("CLI server commands", () => {
  test("[SWARM-TARGET-REG-001] server register dispatches target kind metadata", async () => {
    ensureReflectMetadata();
    const { RegisterServerCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_swarm" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_register_target_kind_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "register",
        "--name",
        "Swarm manager",
        "--host",
        "swarm-manager.internal",
        "--provider",
        "docker-swarm",
        "--target-kind",
        "orchestrator-cluster",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RegisterServerCommand);
    expect(commands[0]).toMatchObject({
      name: "Swarm manager",
      host: "swarm-manager.internal",
      providerKey: "docker-swarm",
      targetKind: "orchestrator-cluster",
      proxyKind: "traefik",
    });
  });

  test("[SRV-LIFE-ENTRY-001] server show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowServerQuery, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "servers.show/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_show_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "server", "show", "srv_primary"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowServerQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
      includeRollups: true,
    });
  });

  test("[RUNTIME-CAPACITY-INSPECT-001] server capacity inspect dispatches the application query", async () => {
    ensureReflectMetadata();
    const { InspectServerCapacityQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "servers.capacity.inspect/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          inspectedAt: "2026-01-01T00:00:00.000Z",
          disk: [],
          inodes: [],
          docker: {
            imagesSize: 0,
            reclaimableImagesSize: 0,
            buildCacheSize: 0,
            reclaimableBuildCacheSize: 0,
            containersSize: 0,
            volumesSize: 0,
          },
          memory: { total: null, available: null, used: null, usePercent: null },
          cpu: {
            logicalCores: null,
            loadAverage1m: null,
            loadAverage5m: null,
            loadAverage15m: null,
          },
          appaloftRuntime: {
            runtimeRoot: { path: "/var/lib/appaloft/runtime", size: null, detectable: false },
            stateRoot: { path: "/var/lib/appaloft/runtime/state", size: null, detectable: false },
            sourceWorkspace: {
              path: "/var/lib/appaloft/runtime/ssh-deployments",
              size: null,
              detectable: false,
            },
          },
          appaloftContainers: [],
          appaloftWorkspaces: [],
          safeReclaimableEstimate: {
            stoppedContainersSize: 0,
            danglingImagesSize: 0,
            oldBuildCacheSize: 0,
            oldPreviewWorkspaceCandidatesSize: 0,
            total: 0,
          },
          warnings: [],
          partial: false,
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_capacity_inspect_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "capacity",
        "inspect",
        "srv_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(InspectServerCapacityQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[RT-CAP-PRUNE-005] server capacity prune dispatches the application command", async () => {
    ensureReflectMetadata();
    const { PruneServerCapacityCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "servers.capacity.prune/v1",
          server: {
            id: "srv_primary",
            name: "Primary",
            host: "203.0.113.10",
            port: 22,
            providerKey: "generic-ssh",
            targetKind: "single-server",
          },
          before: "2026-01-01T00:05:00.000Z",
          categories: ["docker-build-cache", "unused-images"],
          dryRun: false,
          prunedAt: "2026-01-01T00:10:00.000Z",
          summary: {
            inspectedCount: 1,
            matchedCount: 0,
            prunedCount: 1,
            skippedCount: 0,
            excludedCount: 0,
            reclaimedBytes: 1024,
          },
          candidates: [],
          warnings: [],
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_capacity_prune_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "capacity",
        "prune",
        "srv_primary",
        "--before",
        "2026-01-01T00:05:00.000Z",
        "--category",
        "docker-build-cache",
        "--category",
        "unused-images",
        "--category",
        "remote-state-markers",
        "--target",
        "appaloft-dep_123",
        "--dry-run",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PruneServerCapacityCommand);
    expect(commands[0]).toMatchObject({
      input: {
        serverId: "srv_primary",
        before: "2026-01-01T00:05:00.000Z",
        categories: ["docker-build-cache", "unused-images", "remote-state-markers"],
        target: "appaloft-dep_123",
        dryRun: false,
      },
    });
  });

  test("[RT-CAP-SCHED-007] server capacity policy configure dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureScheduledRuntimePrunePolicyCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "rtp_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_scheduled_runtime_prune_policy_configure_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "capacity",
        "policy",
        "configure",
        "--policy-id",
        "rtp_primary",
        "--version",
        "v2",
        "--scope",
        "environment",
        "--server-id",
        "srv_primary",
        "--retention-days",
        "14",
        "--destructive",
        "true",
        "--category",
        "stopped-containers",
        "--category",
        "unused-images",
        "--retry-on-failure",
        "false",
        "--enabled",
        "false",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureScheduledRuntimePrunePolicyCommand);
    expect(commands[0]).toMatchObject({
      input: {
        policyId: "rtp_primary",
        version: "v2",
        scope: "environment",
        serverId: "srv_primary",
        retentionDays: 14,
        destructive: true,
        categories: ["stopped-containers", "unused-images"],
        retryOnFailure: false,
        enabled: false,
      },
    });
  });

  test("[RT-CAP-SCHED-007] server capacity policy list dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ListScheduledRuntimePrunePoliciesQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "scheduled-runtime-prune-policies.list/v1",
          items: [],
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_scheduled_runtime_prune_policy_list_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "capacity",
        "policy",
        "list",
        "--server-id",
        "srv_primary",
        "--scope",
        "project",
        "--enabled-only",
        "true",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ListScheduledRuntimePrunePoliciesQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
      scope: "project",
      enabledOnly: true,
    });
  });

  test("[RT-CAP-SCHED-007] server capacity policy show dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ShowScheduledRuntimePrunePolicyQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "scheduled-runtime-prune-policies.show/v1",
          policy: null,
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_scheduled_runtime_prune_policy_show_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "capacity",
        "policy",
        "show",
        "rtp_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowScheduledRuntimePrunePolicyQuery);
    expect(queries[0]).toMatchObject({
      policyId: "rtp_primary",
    });
  });

  test("[SRV-LIFE-ENTRY-005] server deactivate dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeactivateServerCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_deactivate_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "deactivate",
        "srv_primary",
        "--reason",
        "retired",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeactivateServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      reason: "retired",
    });
  });

  test("[SRV-LIFE-ENTRY-013] server rename dispatches the application command", async () => {
    ensureReflectMetadata();
    const { RenameServerCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_rename_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "rename",
        "srv_primary",
        "--name",
        "Primary SSH server",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RenameServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      name: "Primary SSH server",
    });
  });

  test("[SRV-LIFE-REORDER-001] server reorder dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ReorderServersCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ reorderedServerIds: ["srv_secondary", "srv_primary"] } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_reorder_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "reorder",
        "--server-ids",
        "srv_secondary, srv_primary",
        "--start-offset",
        "12",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ReorderServersCommand);
    expect(commands[0]).toMatchObject({
      serverIds: ["srv_secondary", "srv_primary"],
      startOffset: 12,
    });
  });

  test("[SRV-LIFE-ENTRY-017] server proxy repair dispatches the application command", async () => {
    ensureReflectMetadata();
    const { BootstrapServerProxyCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          id: "srv_primary",
          accepted: true,
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_proxy_repair_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "server", "proxy", "repair", "srv_primary"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(BootstrapServerProxyCommand);
    expect(commands[0]).toMatchObject({
      input: {
        serverId: "srv_primary",
        reason: "repair",
      },
    });
  });

  test("[SRV-LIFE-ENTRY-007] server delete-check dispatches the application query", async () => {
    ensureReflectMetadata();
    const { CheckServerDeleteSafetyQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "servers.delete-check/v1",
          serverId: "srv_primary",
          lifecycleStatus: "inactive",
          eligible: true,
          blockers: [],
          checkedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_delete_check_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "server", "delete-check", "srv_primary"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(CheckServerDeleteSafetyQuery);
    expect(queries[0]).toMatchObject({
      serverId: "srv_primary",
    });
  });

  test("[SSH-CRED-ENTRY-002] server credential-show dispatches the reusable SSH credential detail query", async () => {
    ensureReflectMetadata();
    const application = (await import("@appaloft/application")) as Record<string, unknown> & {
      createExecutionContext: typeof import("@appaloft/application").createExecutionContext;
    };
    const ShowSshCredentialQuery = application.ShowSshCredentialQuery as
      | (new (
          ...args: never[]
        ) => AppQuery<unknown>)
      | undefined;
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "credentials.show/v1",
          credential: {
            id: "cred_primary",
            name: "primary-key",
            kind: "ssh-private-key",
            username: "deploy",
            publicKeyConfigured: true,
            privateKeyConfigured: true,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          usage: {
            totalServers: 0,
            activeServers: 0,
            inactiveServers: 0,
            servers: [],
          },
          generatedAt: "2026-01-01T00:00:10.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        application.createExecutionContext({
          ...input,
          requestId: "req_cli_ssh_credential_show_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await program.parseAsync(["node", "appaloft", "server", "credential-show", "cred_primary"]);
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
    }

    expect(ShowSshCredentialQuery, "ShowSshCredentialQuery export").toBeDefined();
    expect(queries).toHaveLength(1);
    if (!ShowSshCredentialQuery) {
      throw new Error("ShowSshCredentialQuery is not exported yet");
    }
    expect(queries[0]).toBeInstanceOf(ShowSshCredentialQuery);
    expect(queries[0]).toMatchObject({
      credentialId: "cred_primary",
      includeUsage: true,
    });
  });

  test("[SRV-LIFE-ENTRY-010] server delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeleteServerCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "srv_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_server_delete_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "delete",
        "srv_primary",
        "--confirm",
        "srv_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteServerCommand);
    expect(commands[0]).toMatchObject({
      serverId: "srv_primary",
      confirmation: {
        serverId: "srv_primary",
      },
    });
  });

  test("[SSH-CRED-ENTRY-007] server credential-delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeleteSshCredentialCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "cred_primary" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_ssh_credential_delete_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "credential-delete",
        "cred_primary",
        "--confirm",
        "cred_primary",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteSshCredentialCommand);
    expect(commands[0]).toMatchObject({
      credentialId: "cred_primary",
      confirmation: {
        credentialId: "cred_primary",
      },
    });
  });

  test("[SSH-CRED-ENTRY-012] server credential-rotate dispatches the application command", async () => {
    ensureReflectMetadata();
    const { RotateSshCredentialCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-cli-ssh-credential-rotate-"));
    const privateKeyPath = join(workspaceDir, "id_appaloft");
    writeFileSync(privateKeyPath, "NEW_PRIVATE");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "credentials.rotate-ssh/v1",
          credential: {
            id: "cred_primary",
            kind: "ssh-private-key",
            usernameConfigured: true,
            publicKeyConfigured: true,
            privateKeyConfigured: true,
            rotatedAt: "2026-01-01T00:00:10.000Z",
          },
          affectedUsage: {
            totalServers: 1,
            activeServers: 1,
            inactiveServers: 0,
            servers: [],
          },
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_ssh_credential_rotate_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "server",
        "credential-rotate",
        "cred_primary",
        "--private-key-file",
        privateKeyPath,
        "--public-key",
        "ssh-ed25519 NEW_PUBLIC",
        "--username",
        "deploy-new",
        "--confirm",
        "cred_primary",
        "--acknowledge-server-usage",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RotateSshCredentialCommand);
    expect(commands[0]).toMatchObject({
      credentialId: "cred_primary",
      privateKey: "NEW_PRIVATE",
      publicKey: "ssh-ed25519 NEW_PUBLIC",
      username: "deploy-new",
      confirmation: {
        credentialId: "cred_primary",
        acknowledgeServerUsage: true,
      },
    });
  });
});
