import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  createExecutionContext,
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

async function createCommandCaptureHarness(requestId: string) {
  ensureReflectMetadata();
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      if (command.constructor.name === "CreateDeployTokenCommand") {
        return ok({
          tokenId: "dpt_demo",
          token: "aplt_dt_rawtokenvalue00000000",
          organizationId: "org_self_hosted",
          displayName: "GitHub Action",
          secretSuffix: "00000000",
          scopes: {
            deploymentTargetIds: [],
            environmentIds: [],
            projectIds: ["prj_demo"],
            repositoryFullNames: ["acme/web"],
            resourceIds: ["res_web"],
            workflowCommands: ["source-link-deploy"],
          },
          createdAt: "2026-01-01T00:00:00.000Z",
        } as T);
      }
      if (command.constructor.name === "RotateDeployTokenCommand") {
        return ok({
          tokenId: "dpt_demo",
          token: "aplt_dt_rotatedrawtoken00000000",
          rotatedAt: "2026-01-01T00:10:00.000Z",
          scopes: {
            deploymentTargetIds: [],
            environmentIds: [],
            projectIds: ["prj_demo"],
            repositoryFullNames: ["acme/web"],
            resourceIds: ["res_web"],
            workflowCommands: ["source-link-deploy"],
          },
        } as T);
      }
      return ok({ tokenId: "dpt_demo", revokedAt: "2026-01-01T00:20:00.000Z" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      const summary = {
        tokenId: "dpt_demo",
        organizationId: "org_self_hosted",
        displayName: "GitHub Action",
        status: "active",
        secretSuffix: "12345678",
        scope: {
          deploymentTargetIds: [],
          environmentIds: [],
          projectIds: ["prj_demo"],
          repositoryFullNames: ["acme/web"],
          resourceIds: ["res_web"],
          workflowCommands: ["source-link-deploy"],
        },
        createdAt: "2026-01-01T00:00:00.000Z",
      };
      return ok(
        (query.constructor.name === "ListDeployTokensQuery" ? { items: [summary] } : summary) as T,
      );
    },
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus,
    queryBus,
    executionContextFactory,
  });

  return { commands, program, queries };
}

async function parseCli(program: { parseAsync(args: string[]): Promise<unknown> }, args: string[]) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(args);
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI deploy-token commands", () => {
  test("[SELF-AUTH-TOKEN-006] create dispatches CreateDeployTokenCommand", async () => {
    const { CreateDeployTokenCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_deploy_token_create_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "deploy-token",
      "create",
      "--organization-id",
      "org_self_hosted",
      "--display-name",
      "GitHub Action",
      "--workflow-commands",
      "source-link-deploy,preview-cleanup",
      "--project-ids",
      "prj_demo",
      "--resource-ids",
      "res_web",
      "--repositories",
      "acme/web",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(CreateDeployTokenCommand);
    expect(commands[0]).toMatchObject({
      organizationId: "org_self_hosted",
      displayName: "GitHub Action",
      scope: {
        projectIds: ["prj_demo"],
        repositoryFullNames: ["acme/web"],
        resourceIds: ["res_web"],
        workflowCommands: ["source-link-deploy", "preview-cleanup"],
      },
    });
  });

  test("[SELF-AUTH-TOKEN-006] list and show dispatch deploy-token queries", async () => {
    const { ListDeployTokensQuery, ShowDeployTokenQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness(
      "req_cli_deploy_token_query_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "deploy-token",
      "list",
      "--organization-id",
      "org_self_hosted",
      "--status",
      "active",
      "--limit",
      "20",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "deploy-token",
      "show",
      "dpt_demo",
      "--organization-id",
      "org_self_hosted",
    ]);

    expect(queries).toHaveLength(2);
    expect(queries[0]).toBeInstanceOf(ListDeployTokensQuery);
    expect(queries[0]).toMatchObject({
      organizationId: "org_self_hosted",
      status: "active",
      limit: 20,
    });
    expect(queries[1]).toBeInstanceOf(ShowDeployTokenQuery);
    expect(queries[1]).toMatchObject({
      organizationId: "org_self_hosted",
      tokenId: "dpt_demo",
    });
  });

  test("[SELF-AUTH-TOKEN-006] rotate and revoke dispatch deploy-token commands", async () => {
    const { RevokeDeployTokenCommand, RotateDeployTokenCommand } = await import(
      "@appaloft/application"
    );
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_deploy_token_rotate_revoke_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "deploy-token",
      "rotate",
      "dpt_demo",
      "--organization-id",
      "org_self_hosted",
      "--confirm",
      "dpt_demo",
    ]);
    await parseCli(program, [
      "node",
      "appaloft",
      "deploy-token",
      "revoke",
      "dpt_demo",
      "--organization-id",
      "org_self_hosted",
      "--confirm",
      "dpt_demo",
      "--reason",
      "rotated in CI",
    ]);

    expect(commands).toHaveLength(2);
    expect(commands[0]).toBeInstanceOf(RotateDeployTokenCommand);
    expect(commands[0]).toMatchObject({
      organizationId: "org_self_hosted",
      tokenId: "dpt_demo",
      confirmation: { tokenId: "dpt_demo" },
    });
    expect(commands[1]).toBeInstanceOf(RevokeDeployTokenCommand);
    expect(commands[1]).toMatchObject({
      organizationId: "org_self_hosted",
      tokenId: "dpt_demo",
      confirmation: { tokenId: "dpt_demo" },
      reason: "rotated in CI",
    });
  });
});
