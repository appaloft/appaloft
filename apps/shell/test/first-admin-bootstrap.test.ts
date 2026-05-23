import "reflect-metadata";

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  BootstrapFirstAdminCommand,
  type CommandBus,
  createExecutionContext,
  type ExecutionContextFactory,
  GetAuthBootstrapStatusQuery,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok } from "@appaloft/core";
import { writeBootstrapFirstAdminOutput } from "../src/first-admin-bootstrap";

const loginMethods = [
  {
    key: "local-password" as const,
    configured: true,
    enabled: true,
  },
];

const executionContextFactory: ExecutionContextFactory = {
  create: (input) =>
    createExecutionContext({
      ...input,
      requestId: "req_first_admin_bootstrap_test",
    }),
};

test("[FIRST-ADMIN-BOOTSTRAP-002] installer bootstrap writes generated first-admin password once", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-first-admin-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "first-admin.json");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          bootstrapRequired: true,
          firstAdminConfigured: false,
          organizationConfigured: false,
          loginMethods,
          loginUrl: "http://localhost:3721/login",
        } as T);
      },
    } as unknown as QueryBus;
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          bootstrapRequired: false,
          created: true,
          email: "admin@example.com",
          generatedPassword: "generated-admin-password",
          loginMethods,
          loginUrl: "http://localhost:3721/login",
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
          userId: "usr_admin",
        } as T);
      },
    } as CommandBus;

    const result = await writeBootstrapFirstAdminOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: outputFile,
          APPALOFT_FIRST_ADMIN_EMAIL: "admin@example.com",
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(queries[0]).toBeInstanceOf(GetAuthBootstrapStatusQuery);
    expect(commands[0]).toBeInstanceOf(BootstrapFirstAdminCommand);
    expect(commands[0]).toMatchObject({
      email: "admin@example.com",
      displayName: "Appaloft Admin",
      organizationName: "Self-hosted Appaloft",
      organizationSlug: "self-hosted-appaloft",
    });

    const output = JSON.parse(await Bun.file(outputFile).text()) as Record<string, unknown>;
    expect(output).toMatchObject({
      schemaVersion: "first-admin.bootstrap/v1",
      bootstrapRequired: false,
      created: true,
      email: "admin@example.com",
      generatedPassword: "generated-admin-password",
      organizationId: "org_self_hosted",
      organizationSlug: "self-hosted-appaloft",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("[FIRST-ADMIN-BOOTSTRAP-001] installer bootstrap does not echo supplied password", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-first-admin-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "first-admin.json");
    const queryBus = {
      execute: async <T>() =>
        ok({
          bootstrapRequired: true,
          firstAdminConfigured: false,
          organizationConfigured: false,
          loginMethods,
        } as T),
    } as unknown as QueryBus;
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        expect(command).toMatchObject({
          password: "supplied-admin-password",
        });
        return ok({
          bootstrapRequired: false,
          created: true,
          email: "admin@example.com",
          loginMethods,
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
          userId: "usr_admin",
        } as T);
      },
    } as CommandBus;

    const result = await writeBootstrapFirstAdminOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: outputFile,
          APPALOFT_FIRST_ADMIN_EMAIL: "admin@example.com",
          APPALOFT_FIRST_ADMIN_PASSWORD: "supplied-admin-password",
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    const text = await Bun.file(outputFile).text();
    expect(text).not.toContain("supplied-admin-password");
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: "first-admin.bootstrap/v1",
      created: true,
      email: "admin@example.com",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("[FIRST-ADMIN-BOOTSTRAP-006] startup config bootstraps first admin without a handoff file", async () => {
  const queries: AppQuery<unknown>[] = [];
  const commands: AppCommand<unknown>[] = [];
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({
        bootstrapRequired: true,
        firstAdminConfigured: false,
        organizationConfigured: false,
        loginMethods,
        loginUrl: "http://localhost:3721/login",
      } as T);
    },
  } as unknown as QueryBus;
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({
        bootstrapRequired: false,
        created: true,
        email: "admin@example.com",
        loginMethods,
        loginUrl: "http://localhost:3721/login",
        organizationId: "org_startup",
        organizationSlug: "startup-org",
        userId: "usr_admin",
      } as T);
    },
  } as CommandBus;

  const result = await writeBootstrapFirstAdminOutput({
    config: resolveConfig({
      env: {
        APPALOFT_FIRST_ADMIN_DISPLAY_NAME: "Startup Admin",
        APPALOFT_FIRST_ADMIN_EMAIL: "admin@example.com",
        APPALOFT_FIRST_ADMIN_ORGANIZATION_NAME: "Startup Org",
        APPALOFT_FIRST_ADMIN_ORGANIZATION_SLUG: "startup-org",
        APPALOFT_FIRST_ADMIN_PASSWORD: "startup-admin-password",
      },
    }),
    commandBus,
    queryBus,
    executionContextFactory,
  });

  expect(result.isOk()).toBe(true);
  expect(queries[0]).toBeInstanceOf(GetAuthBootstrapStatusQuery);
  expect(commands[0]).toBeInstanceOf(BootstrapFirstAdminCommand);
  expect(commands[0]).toMatchObject({
    email: "admin@example.com",
    displayName: "Startup Admin",
    password: "startup-admin-password",
    organizationName: "Startup Org",
    organizationSlug: "startup-org",
  });
  expect(result._unsafeUnwrap()).toMatchObject({
    schemaVersion: "first-admin.bootstrap/v1",
    bootstrapRequired: false,
    created: true,
    email: "admin@example.com",
    organizationId: "org_startup",
    organizationSlug: "startup-org",
  });
  expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("startup-admin-password");
});

test("[FIRST-ADMIN-BOOTSTRAP-003] installer bootstrap is idempotent after admin exists", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-first-admin-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "first-admin.json");
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        expect(query).toBeInstanceOf(GetAuthBootstrapStatusQuery);
        return ok({
          bootstrapRequired: false,
          firstAdminConfigured: true,
          organizationConfigured: true,
          firstAdminEmail: "admin@example.com",
          loginMethods,
          loginUrl: "http://localhost:3721/login",
          organizationId: "org_self_hosted",
          organizationSlug: "self-hosted-appaloft",
        } as T);
      },
    } as unknown as QueryBus;
    const commandBus = {
      execute: async () => {
        throw new Error("bootstrap must not create another admin when one exists");
      },
    } as unknown as CommandBus;

    const result = await writeBootstrapFirstAdminOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: outputFile,
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    const text = await Bun.file(outputFile).text();
    expect(text).not.toContain("supplied-admin-password");
    expect(text).not.toContain("generated-admin-password");
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: "first-admin.bootstrap/v1",
      bootstrapRequired: false,
      created: false,
      email: "admin@example.com",
      organizationId: "org_self_hosted",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("installer bootstrap records required status when email is not configured", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-first-admin-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "first-admin.json");
    const queryBus = {
      execute: async <T>() =>
        ok({
          bootstrapRequired: true,
          firstAdminConfigured: false,
          organizationConfigured: false,
          loginMethods,
          loginUrl: "http://localhost:3721/login",
        } as T),
    } as unknown as QueryBus;
    const commandBus = {
      execute: async () => {
        throw new Error("command bus should not run without first-admin email");
      },
    } as unknown as CommandBus;

    const result = await writeBootstrapFirstAdminOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: outputFile,
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(JSON.parse(await Bun.file(outputFile).text())).toMatchObject({
      schemaVersion: "first-admin.bootstrap/v1",
      bootstrapRequired: true,
      created: false,
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("installer first-admin bootstrap leaves an existing handoff file untouched", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-first-admin-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "first-admin.json");
    await writeFile(outputFile, '{"created":true}\n');
    const result = await writeBootstrapFirstAdminOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_FIRST_ADMIN_OUTPUT_FILE: outputFile,
        },
      }),
      commandBus: {
        execute: async () => {
          throw new Error("command bus should not run when handoff already exists");
        },
      } as unknown as CommandBus,
      queryBus: {
        execute: async () => {
          throw new Error("query bus should not run when handoff already exists");
        },
      } as unknown as QueryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBeNull();
    expect(await Bun.file(outputFile).text()).toBe('{"created":true}\n');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
