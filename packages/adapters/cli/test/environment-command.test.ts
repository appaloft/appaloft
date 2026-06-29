import { describe, expect, test } from "bun:test";
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

describe("CLI environment commands", () => {
  test("[ENV-LIFE-RENAME-ENTRY-001] environment rename dispatches the application command", async () => {
    ensureReflectMetadata();
    const { RenameEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_rename_test",
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
        "env",
        "rename",
        "env_demo",
        "--name",
        "customer-production",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(RenameEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_demo",
      name: "customer-production",
    });
  });

  test("[ENV-LIFE-CLONE-ENTRY-001] environment clone dispatches the application command", async () => {
    ensureReflectMetadata();
    const { CloneEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_clone" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_clone_test",
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
        "env",
        "clone",
        "env_production",
        "--name",
        "production-copy",
        "--kind",
        "staging",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CloneEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      targetName: "production-copy",
      targetKind: "staging",
    });
  });

  test("[ENV-PROFILE-DUP-004] environment duplicate apply dispatches reviewed decisions", async () => {
    ensureReflectMetadata();
    const { DuplicateEnvironmentProfileCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_staging" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_duplicate_apply_test",
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
        "env",
        "duplicate",
        "apply",
        "env_production",
        "--name",
        "staging",
        "--kind",
        "staging",
        "--dependency-decisions",
        JSON.stringify([{ dependencyResourceId: "rsi_pg", decision: "defer" }]),
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DuplicateEnvironmentProfileCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
      targetKind: "staging",
      dependencyDecisions: [{ dependencyResourceId: "rsi_pg", decision: "defer" }],
    });
  });

  test("[ENV-PROFILE-DUP-004] environment copy dispatches default isolated profile duplication", async () => {
    ensureReflectMetadata();
    const {
      DuplicateEnvironmentProfileCommand,
      PlanDuplicateEnvironmentQuery,
      createExecutionContext,
    } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "environments.duplicate-profile/v1",
          sourceEnvironmentId: "env_production",
          targetEnvironmentId: "env_staging",
          copiedResources: [],
          appliedDependencies: [],
          createdDependencyBindings: [],
          deferredDecisions: [],
          warnings: [],
          generatedAt: "2026-01-01T00:00:01.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(environmentDuplicatePlanFixture() as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_copy_test",
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
      await program.parseAsync(["node", "appaloft", "env", "copy", "env_production", "staging"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(queries[0]).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DuplicateEnvironmentProfileCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
      dependencyDecisions: [
        {
          dependencyResourceId: "rsi_pg",
          decision: "create-new-managed",
          providerKey: "appaloft-managed-postgres",
        },
      ],
    });
  });

  test("[ENV-PROFILE-DUP-001] environment copy dry-run returns a safe copy plan without applying", async () => {
    ensureReflectMetadata();
    const { PlanDuplicateEnvironmentQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({} as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(environmentDuplicatePlanFixture() as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_copy_dry_run_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    let stdout = "";
    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "env",
        "copy",
        "env_production",
        "staging",
        "--dry-run",
        "--json",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(commands).toHaveLength(0);
    expect(stdout).toContain('"schemaVersion": "environments.copy-plan/v1"');
    expect(stdout).toContain('"dependencies": "create-new-managed"');
    expect(stdout).not.toContain("postgres://");
    expect(stdout).not.toContain("sk_live_");
  });

  test("[ENV-PROFILE-DUP-004] environment copy requires explicit ack for shared source reuse", async () => {
    ensureReflectMetadata();
    const {
      DuplicateEnvironmentProfileCommand,
      PlanDuplicateEnvironmentQuery,
      createExecutionContext,
    } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "environments.duplicate-profile/v1",
          sourceEnvironmentId: "env_production",
          targetEnvironmentId: "env_staging",
          copiedResources: [],
          appliedDependencies: [],
          createdDependencyBindings: [],
          deferredDecisions: [],
          warnings: [],
          generatedAt: "2026-01-01T00:00:01.000Z",
        } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(environmentDuplicatePlanFixture() as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_copy_reuse_source_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    let stdout = "";
    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "env",
        "copy",
        "env_production",
        "staging",
        "--reuse-source",
        "db",
        "--acknowledge-shared-source",
        "--yes",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DuplicateEnvironmentProfileCommand);
    expect(commands[0]).toMatchObject({
      dependencyDecisions: [
        {
          dependencyResourceId: "rsi_pg",
          decision: "reuse-source",
          acknowledgement: "I understand this target environment will share the source dependency.",
        },
      ],
    });
    expect(stdout).toContain('"confirmed": true');
  });

  test("[ENV-PROFILE-DUP-001] environment copy dry-run exposes advanced data domain and storage policies", async () => {
    ensureReflectMetadata();
    const { PlanDuplicateEnvironmentQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({} as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(environmentDuplicatePlanFixture() as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_copy_advanced_dry_run_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    let stdout = "";
    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "env",
        "copy",
        "production",
        "staging",
        "--dry-run",
        "--json",
        "--database",
        "restore:backup_123",
        "--domain",
        "rebind:staging.example.com",
        "--storage",
        "import:artifact_ref",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(commands).toHaveLength(0);
    expect(stdout).toContain('"data": "restore:backup_123"');
    expect(stdout).toContain('"domains": "rebind:staging.example.com"');
    expect(stdout).toContain('"storage": "import:artifact_ref"');
  });

  test("[ENV-LIFE-ENTRY-003] environment archive dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ArchiveEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_production" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_archive_test",
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
        "env",
        "archive",
        "env_production",
        "--reason",
        "Retired",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ArchiveEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      reason: "Retired",
    });
  });

  test("[ENV-LIFE-ENTRY-006] environment lock dispatches the application command", async () => {
    ensureReflectMetadata();
    const { LockEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_production" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_lock_test",
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
        "env",
        "lock",
        "env_production",
        "--reason",
        "Change freeze",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(LockEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      reason: "Change freeze",
    });
  });

  test("[ENV-LIFE-ENTRY-006] environment unlock dispatches the application command", async () => {
    ensureReflectMetadata();
    const { UnlockEnvironmentCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "env_production" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_unlock_test",
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
      await program.parseAsync(["node", "appaloft", "env", "unlock", "env_production"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(UnlockEnvironmentCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
    });
  });

  test("[ENV-PRECEDENCE-ENTRY-003] environment effective-precedence dispatches the application query", async () => {
    ensureReflectMetadata();
    const { EnvironmentEffectivePrecedenceQuery, createExecutionContext } = await import(
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
          schemaVersion: "environments.effective-precedence/v1",
          environmentId: "env_production",
          projectId: "prj_demo",
          ownedEntries: [],
          effectiveEntries: [],
          precedence: [
            "defaults",
            "system",
            "organization",
            "project",
            "environment",
            "resource",
            "deployment",
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_precedence_test",
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
        "env",
        "effective-precedence",
        "env_production",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(EnvironmentEffectivePrecedenceQuery);
    expect(queries[0]).toMatchObject({
      environmentId: "env_production",
    });
  });

  test("[ENV-PROFILE-DUP-001] environment duplicate plan dispatches the application query", async () => {
    ensureReflectMetadata();
    const { PlanDuplicateEnvironmentQuery, createExecutionContext } = await import(
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
          schemaVersion: "environments.duplicate-plan/v1",
          sourceEnvironment: {
            id: "env_production",
            projectId: "prj_demo",
            name: "production",
            kind: "production",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [],
          },
          target: {
            projectId: "prj_demo",
            name: "staging",
            conflict: false,
          },
          variableCandidates: [],
          resourceCandidates: [],
          dependencyCandidates: [],
          dependencyBindingCandidates: [],
          domainRouteCandidates: [],
          storageDecisionCandidates: [],
          warnings: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_duplicate_plan_test",
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
        "env",
        "duplicate",
        "plan",
        "env_production",
        "--name",
        "staging",
        "--project",
        "prj_demo",
        "--target",
        "env_staging",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(PlanDuplicateEnvironmentQuery);
    expect(queries[0]).toMatchObject({
      environmentId: "env_production",
      targetName: "staging",
      targetProjectId: "prj_demo",
      targetEnvironmentId: "env_staging",
    });
  });

  test("[ENV-PROFILE-DUP-008] environment diff-profile dispatches the application query", async () => {
    ensureReflectMetadata();
    const { DiffEnvironmentProfileQuery, createExecutionContext } = await import(
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
          schemaVersion: "environments.diff-profile/v1",
          sourceEnvironment: {
            id: "env_production",
            projectId: "prj_demo",
            name: "production",
            kind: "production",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [],
          },
          targetEnvironment: {
            id: "env_staging",
            projectId: "prj_demo",
            name: "staging",
            kind: "staging",
            lifecycleStatus: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            maskedVariables: [],
          },
          entries: [],
          counts: { added: 0, removed: 0, changed: 0, unchanged: 0 },
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_environment_diff_profile_test",
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
        "env",
        "diff-profile",
        "env_production",
        "env_staging",
        "--include-unchanged",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(DiffEnvironmentProfileQuery);
    expect(queries[0]).toMatchObject({
      environmentId: "env_production",
      targetEnvironmentId: "env_staging",
      includeUnchanged: true,
    });
  });

  test("[ENV-PROFILE-DUP-009] environment sync-profile dispatches selected resources", async () => {
    ensureReflectMetadata();
    const { SyncEnvironmentProfileCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          schemaVersion: "environments.sync-profile/v1",
          sourceEnvironmentId: "env_production",
          targetEnvironmentId: "env_staging",
          syncedResources: [],
          skippedResources: [],
          deferredDecisions: [],
          warnings: [],
          generatedAt: "2026-01-01T00:00:00.000Z",
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
          requestId: "req_cli_environment_sync_profile_test",
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
        "env",
        "sync-profile",
        "env_production",
        "env_staging",
        "--resource-ids",
        "res_worker,res_api",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(SyncEnvironmentProfileCommand);
    expect(commands[0]).toMatchObject({
      environmentId: "env_production",
      targetEnvironmentId: "env_staging",
      resourceIds: ["res_worker", "res_api"],
    });
  });
});

function environmentDuplicatePlanFixture() {
  return {
    schemaVersion: "environments.duplicate-plan/v1",
    sourceEnvironment: {
      id: "env_production",
      projectId: "prj_demo",
      name: "production",
      kind: "production",
      lifecycleStatus: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      maskedVariables: [],
    },
    target: {
      projectId: "prj_demo",
      name: "staging",
      conflict: false,
    },
    variableCandidates: [],
    resourceCandidates: [
      {
        resourceId: "res_web",
        name: "Web",
        slug: "web",
        kind: "application",
        services: [{ name: "web", kind: "web" }],
        decisionHint: "recreate-resource",
      },
    ],
    dependencyCandidates: [
      {
        dependencyResourceId: "rsi_pg",
        name: "Main DB",
        slug: "main-db",
        kind: "postgres",
        sourceMode: "appaloft-managed",
        providerKey: "appaloft-managed-postgres",
        providerManaged: true,
        lifecycleStatus: "active",
        desiredCapabilities: [],
        decisionHint: "create-new-managed",
        reasons: ["Provider-managed dependencies should default to a new managed instance."],
      },
    ],
    dependencyBindingCandidates: [],
    domainRouteCandidates: [],
    storageDecisionCandidates: [],
    warnings: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}
