import "reflect-metadata";

import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CreateDeployTokenCommand,
  createExecutionContext,
  type ExecutionContextFactory,
  ListDeployTokensQuery,
  type QueryBus,
} from "@appaloft/application";
import { resolveConfig } from "@appaloft/config";
import { ok } from "@appaloft/core";
import { writeBootstrapDeployTokenOutput } from "../src/deploy-token-bootstrap";

const executionContextFactory: ExecutionContextFactory = {
  create: (input) =>
    createExecutionContext({
      ...input,
      requestId: "req_deploy_token_bootstrap_test",
    }),
};

test("[SELF-AUTH-TOKEN-001] installer bootstrap writes one-time deploy token output", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-deploy-token-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "deploy-token.json");
    const commands: AppCommand<unknown>[] = [];
    const queries: AppQuery<unknown>[] = [];
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({ items: [] } as T);
      },
    } as QueryBus;
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({
          token: "aplt_dt_bootstraptoken00000000",
          tokenId: "dpt_bootstrap",
          organizationId: "org_self_hosted",
          displayName: "GitHub Action deploy token",
          secretSuffix: "00000000",
          scopes: {
            deploymentTargetIds: [],
            environmentIds: [],
            projectIds: [],
            repositoryFullNames: [],
            resourceIds: [],
            workflowCommands: ["source-link-deploy", "server-config-deploy", "preview-cleanup"],
          },
          createdAt: "2026-05-10T08:00:00.000Z",
        } as T);
      },
    } as CommandBus;

    const result = await writeBootstrapDeployTokenOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: outputFile,
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    expect(queries[0]).toBeInstanceOf(ListDeployTokensQuery);
    expect(commands[0]).toBeInstanceOf(CreateDeployTokenCommand);
    expect(commands[0]).toMatchObject({
      organizationId: "org_self_hosted",
      displayName: "GitHub Action deploy token",
      scope: {
        workflowCommands: ["source-link-deploy", "server-config-deploy", "preview-cleanup"],
      },
    });

    const output = JSON.parse(await Bun.file(outputFile).text()) as Record<string, unknown>;
    expect(output).toMatchObject({
      schemaVersion: "deploy-token.bootstrap/v1",
      created: true,
      organizationId: "org_self_hosted",
      actionSecretName: "APPALOFT_TOKEN",
      tokenId: "dpt_bootstrap",
      token: "aplt_dt_bootstraptoken00000000",
      secretSuffix: "00000000",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("[SELF-AUTH-TOKEN-001] installer bootstrap skips deploy token when no handoff file is configured", async () => {
  const result = await writeBootstrapDeployTokenOutput({
    config: resolveConfig({}),
    commandBus: {
      execute: async () => {
        throw new Error("command bus should not run without deploy-token bootstrap output file");
      },
    } as unknown as CommandBus,
    queryBus: {
      execute: async () => {
        throw new Error("query bus should not run without deploy-token bootstrap output file");
      },
    } as unknown as QueryBus,
    executionContextFactory,
  });

  expect(result.isOk()).toBe(true);
  expect(result._unsafeUnwrap()).toBeNull();
});

test("[SELF-AUTH-TOKEN-001] installer bootstrap is idempotent after an active token exists", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-deploy-token-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "deploy-token.json");
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        expect(query).toBeInstanceOf(ListDeployTokensQuery);
        return ok({
          items: [
            {
              tokenId: "dpt_existing",
              organizationId: "org_self_hosted",
              displayName: "GitHub Action deploy token",
              status: "active",
              secretSuffix: "11111111",
              scope: {
                deploymentTargetIds: [],
                environmentIds: [],
                projectIds: [],
                repositoryFullNames: [],
                resourceIds: [],
                workflowCommands: ["source-link-deploy"],
              },
              createdAt: "2026-05-10T08:00:00.000Z",
            },
          ],
        } as T);
      },
    } as QueryBus;
    const commandBus = {
      execute: async () => {
        throw new Error("bootstrap must not create another token when one is active");
      },
    } as unknown as CommandBus;

    const result = await writeBootstrapDeployTokenOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: outputFile,
        },
      }),
      commandBus,
      queryBus,
      executionContextFactory,
    });

    expect(result.isOk()).toBe(true);
    const text = await Bun.file(outputFile).text();
    expect(text).not.toContain("aplt_dt_");
    expect(text).not.toContain("sha256:");
    expect(JSON.parse(text)).toMatchObject({
      schemaVersion: "deploy-token.bootstrap/v1",
      created: false,
      organizationId: "org_self_hosted",
      tokenId: "dpt_existing",
      secretSuffix: "11111111",
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("installer bootstrap leaves an existing handoff file untouched", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "appaloft-deploy-token-bootstrap-"));

  try {
    const outputFile = join(tempRoot, "deploy-token.json");
    await writeFile(outputFile, '{"created":true}\n');
    const result = await writeBootstrapDeployTokenOutput({
      config: resolveConfig({
        env: {
          APPALOFT_BOOTSTRAP_DEPLOY_TOKEN_OUTPUT_FILE: outputFile,
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
