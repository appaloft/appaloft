import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  ConfigureServerCredentialCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  PrepareServerRuntimeCommand,
  type QueryBus,
  RegisterServerCommand,
  ShowServerQuery,
  TestServerConnectivityCommand,
} from "@appaloft/application";
import { domainError, err, ok } from "@appaloft/core";

import { createCliProgram } from "../src";

function serverDetail(input: {
  id: string;
  host: string;
  port: number;
  providerKey: string;
  credentialKind?: "local-ssh-agent" | "ssh-private-key";
}) {
  return {
    schemaVersion: "servers.show/v1" as const,
    server: {
      id: input.id,
      name: input.host,
      host: input.host,
      port: input.port,
      providerKey: input.providerKey,
      targetKind: "single-server" as const,
      workloadRoles: [],
      lifecycleStatus: "active" as const,
      runtimeAvailability: { status: "available" as const, reasonCodes: [] },
      ...(input.credentialKind
        ? {
            credential: {
              kind: input.credentialKind,
              publicKeyConfigured: false,
              privateKeyConfigured: input.credentialKind === "ssh-private-key",
            },
          }
        : {}),
      createdAt: "2026-08-11T00:00:00.000Z",
    },
    generatedAt: "2026-08-11T00:00:10.000Z",
  };
}

function enrollmentProgram(input: {
  executeCommand<T>(command: AppCommand<T>): ReturnType<CommandBus["execute"]>;
  executeQuery?<T>(query: AppQuery<T>): ReturnType<QueryBus["execute"]>;
}) {
  const executionContextFactory: ExecutionContextFactory = {
    create: (context) =>
      createExecutionContext({
        ...context,
        requestId: "req_cli_server_enrollment_test",
      }),
  };
  return createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus: {
      execute: async <T>(_context: unknown, command: AppCommand<T>) =>
        input.executeCommand(command),
    } as unknown as CommandBus,
    queryBus: {
      execute: async <T>(_context: unknown, query: AppQuery<T>) =>
        input.executeQuery ? input.executeQuery(query) : ok({} as T),
    } as unknown as QueryBus,
    executionContextFactory,
  });
}

async function captureStdout(run: () => Promise<void>): Promise<string> {
  let stdout = "";
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    await run();
    return stdout;
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI server enrollment", () => {
  test("[SERVER-ENROLL-002][SERVER-ENROLL-004][SERVER-ENROLL-005][SERVER-ENROLL-006][SERVER-ENROLL-007][SERVER-ENROLL-009] enrolls the local machine through existing operations", async () => {
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof RegisterServerCommand) {
          return ok({ id: "srv_local", workloadRoles: ["sandbox-worker"] } as T);
        }
        if (command instanceof TestServerConnectivityCommand) {
          return ok({
            serverId: "srv_local",
            name: "Local machine",
            host: "localhost",
            port: 22,
            providerKey: "local-shell",
            checkedAt: "2026-08-11T00:00:01.000Z",
            status: "healthy",
            checks: [],
          } as T);
        }
        if (command instanceof PrepareServerRuntimeCommand) {
          return ok({
            serverId: "srv_local",
            status: "ready",
            preparedAt: "2026-08-11T00:00:02.000Z",
            steps: [],
          } as T);
        }
        return err(domainError.validation(`Unexpected command ${command.constructor.name}`));
      },
      executeQuery: async <T>(query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok(
          serverDetail({
            id: "srv_local",
            host: "localhost",
            port: 22,
            providerKey: "local-shell",
          }) as T,
        );
      },
    });

    const stdout = await captureStdout(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "server",
        "enroll",
        "--local",
        "--name",
        "Local machine",
        "--workload-role",
        "sandbox-worker",
      ]),
    );

    expect(commands).toHaveLength(3);
    expect(commands[0]).toBeInstanceOf(RegisterServerCommand);
    expect(commands[0]).toMatchObject({
      name: "Local machine",
      host: "localhost",
      providerKey: "local-shell",
      targetKind: "single-server",
      workloadRoles: ["sandbox-worker"],
    });
    expect(commands.some((command) => command instanceof ConfigureServerCredentialCommand)).toBe(
      false,
    );
    expect(commands[1]).toBeInstanceOf(TestServerConnectivityCommand);
    expect(commands[2]).toBeInstanceOf(PrepareServerRuntimeCommand);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ShowServerQuery);
    expect(stdout).toContain('"schemaVersion": "server-enrollment-checkpoint/v1"');
    expect(stdout).toContain('"schemaVersion": "server-enrollment/v1"');
    expect(stdout).toContain('"serverId": "srv_local"');
    expect(stdout).toContain('"status": "available"');
  });

  test("[R8-OCC-DEPLOY-002] defaults local enrollment to sandbox-worker and deployment-runtime", async () => {
    const commands: AppCommand<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof RegisterServerCommand) {
          return ok({
            id: "srv_local",
            workloadRoles: ["sandbox-worker", "deployment-runtime"],
          } as T);
        }
        if (command instanceof TestServerConnectivityCommand) {
          return ok({
            serverId: "srv_local",
            name: "Local machine",
            host: "localhost",
            port: 22,
            providerKey: "local-shell",
            checkedAt: "2026-08-11T00:00:01.000Z",
            status: "healthy",
            checks: [],
          } as T);
        }
        if (command instanceof PrepareServerRuntimeCommand) {
          return ok({
            serverId: "srv_local",
            status: "ready",
            preparedAt: "2026-08-11T00:00:02.000Z",
            steps: [],
          } as T);
        }
        return err(domainError.validation(`Unexpected command ${command.constructor.name}`));
      },
      executeQuery: async <T>() =>
        ok(
          serverDetail({
            id: "srv_local",
            host: "localhost",
            port: 22,
            providerKey: "local-shell",
          }) as T,
        ),
    });

    await captureStdout(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "server",
        "enroll",
        "--local",
        "--name",
        "occupancy-mac",
      ]),
    );

    expect(commands[0]).toMatchObject({
      name: "occupancy-mac",
      host: "localhost",
      providerKey: "local-shell",
      workloadRoles: ["sandbox-worker", "deployment-runtime"],
    });
  });

  test("[SERVER-ENROLL-001][SERVER-ENROLL-003][SERVER-ENROLL-007] enrolls an SSH target without printing private-key bytes", async () => {
    const secret = "-----BEGIN PRIVATE KEY-----\nsecret-enrollment-key\n-----END PRIVATE KEY-----";
    const keyFile = join(mkdtempSync(join(tmpdir(), "appaloft-enroll-")), "id_ed25519");
    writeFileSync(keyFile, secret);
    const commands: AppCommand<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof RegisterServerCommand) {
          return ok({ id: "srv_ssh", workloadRoles: [] } as T);
        }
        if (command instanceof ConfigureServerCredentialCommand)
          return ok({ serverId: "srv_ssh" } as T);
        if (command instanceof TestServerConnectivityCommand) {
          return ok({
            serverId: "srv_ssh",
            name: "example.com",
            host: "example.com",
            port: 2222,
            providerKey: "generic-ssh",
            checkedAt: "2026-08-11T00:00:01.000Z",
            status: "healthy",
            checks: [],
          } as T);
        }
        return ok({
          serverId: "srv_ssh",
          status: "ready",
          preparedAt: "2026-08-11T00:00:02.000Z",
          steps: [],
        } as T);
      },
      executeQuery: async <T>() =>
        ok(
          serverDetail({
            id: "srv_ssh",
            host: "example.com",
            port: 2222,
            providerKey: "generic-ssh",
            credentialKind: "ssh-private-key",
          }) as T,
        ),
    });

    const stdout = await captureStdout(() =>
      program.parseAsync([
        "node",
        "appaloft",
        "server",
        "enroll",
        "ssh://deploy@example.com:2222",
        "--private-key-file",
        keyFile,
      ]),
    );

    expect(commands).toHaveLength(4);
    expect(commands[0]).toMatchObject({
      host: "example.com",
      port: 2222,
      providerKey: "generic-ssh",
    });
    expect(commands[1]).toBeInstanceOf(ConfigureServerCredentialCommand);
    expect(commands[1]).toMatchObject({
      serverId: "srv_ssh",
      credential: { kind: "ssh-private-key", username: "deploy", privateKey: secret },
    });
    expect(stdout).toContain('"serverId": "srv_ssh"');
    expect(stdout).not.toContain(secret);
    expect(stdout).not.toContain("secret-enrollment-key");
  });

  test("[SERVER-ENROLL-001] rejects unsafe SSH targets before mutation", async () => {
    const commands: AppCommand<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({} as T);
      },
    });

    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    try {
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await expect(
        program.parseAsync([
          "node",
          "appaloft",
          "server",
          "enroll",
          "ssh://deploy:password@example.com/path?token=secret",
        ]),
      ).rejects.toBeDefined();
    } finally {
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }
    expect(commands).toHaveLength(0);
  });

  test("[SERVER-ENROLL-002][SERVER-ENROLL-008] keeps the registered Server checkpoint when connectivity fails", async () => {
    const commands: AppCommand<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof RegisterServerCommand) {
          return ok({ id: "srv_recover", workloadRoles: [] } as T);
        }
        if (command instanceof ConfigureServerCredentialCommand) {
          return ok({ serverId: "srv_recover" } as T);
        }
        return err(
          domainError.infra("SSH connectivity failed", {
            phase: "server-connectivity",
            retryable: true,
          }),
        );
      },
    });

    let stdout = "";
    let stderr = "";
    const writeStdout = process.stdout.write;
    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      }) as typeof process.stdout.write;
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderr += String(chunk);
        return true;
      }) as typeof process.stderr.write;
      await expect(
        program.parseAsync(["node", "appaloft", "server", "enroll", "ssh://deploy@example.com"]),
      ).rejects.toBeDefined();
    } finally {
      process.stdout.write = writeStdout;
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }

    expect(stdout).toContain('"schemaVersion": "server-enrollment-checkpoint/v1"');
    expect(stdout).toContain('"serverId": "srv_recover"');
    expect(stderr).toContain("SSH connectivity failed");
    expect(stderr).not.toContain('"code": "infra_error"');
    expect(commands.some((command) => command.constructor.name === "DeleteServerCommand")).toBe(
      false,
    );
  });

  test("[SERVER-ENROLL-006][SERVER-ENROLL-008] fails closed when runtime preparation reports failed", async () => {
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const program = enrollmentProgram({
      executeCommand: async <T>(command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        if (command instanceof RegisterServerCommand) {
          return ok({ id: "srv_runtime_failed", workloadRoles: [] } as T);
        }
        if (command instanceof TestServerConnectivityCommand) {
          return ok({
            serverId: "srv_runtime_failed",
            name: "Local machine",
            host: "localhost",
            port: 22,
            providerKey: "local-shell",
            checkedAt: "2026-08-11T00:00:01.000Z",
            status: "healthy",
            checks: [],
          } as T);
        }
        return ok({
          serverId: "srv_runtime_failed",
          status: "failed",
          preparedAt: "2026-08-11T00:00:02.000Z",
          steps: [
            {
              phase: "docker",
              status: "failed",
              message: "Docker is unavailable",
              durationMs: 10,
            },
          ],
        } as T);
      },
      executeQuery: async <T>(query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({} as T);
      },
    });

    const writeStderr = process.stderr.write;
    const exitCode = process.exitCode;
    try {
      process.stderr.write = (() => true) as typeof process.stderr.write;
      await captureStdout(async () => {
        await expect(
          program.parseAsync(["node", "appaloft", "server", "enroll", "--local"]),
        ).rejects.toBeDefined();
      });
    } finally {
      process.stderr.write = writeStderr;
      process.exitCode = exitCode ?? 0;
    }

    expect(commands).toHaveLength(3);
    expect(commands[2]).toBeInstanceOf(PrepareServerRuntimeCommand);
    expect(queries).toHaveLength(0);
  });
});
