import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  CompileAgentWorkspaceProfileQuery,
  createExecutionContext,
  DisableAgentWorkspaceProfileCommand,
  type ExecutionContext,
  type ExecutionContextFactory,
  InstallAgentWorkspaceProfileCommand,
  ListAgentWorkspaceProfilesQuery,
  type Query,
  type QueryBus,
  ShowAgentWorkspaceProfileQuery,
  UninstallAgentWorkspaceProfileCommand,
  ValidateAgentWorkspaceProfileQuery,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";
import { Elysia } from "elysia";

import { mountAppaloftOrpcRoutes } from "../src";

const digest = `sha256:${"a".repeat(64)}`;
const templateDigest = `sha256:${"b".repeat(64)}`;
const installed = {
  installationId: "awpi_example",
  definitionDigest: digest,
  profileId: "opencode-default",
  profileVersion: "1.0.0",
  displayName: "OpenCode Default",
  adapterDefinitionDigest: digest,
  status: "enabled" as const,
  installedAt: "2026-07-26T00:00:00.000Z",
};
const compiled = {
  sandbox: {
    source: { kind: "template" as const, templateId: "node-22" },
    requestedIsolation: "container-trusted" as const,
    limits: {
      cpuMillis: 2_000,
      memoryBytes: 4_294_967_296,
      diskBytes: 21_474_836_480,
      maxProcesses: 256,
    },
    networkPolicy: { mode: "deny" as const },
  },
  initialization: [],
  runtime: {
    harnessKey: "profile-opencode-default",
    harnessTemplateId: "command-agent",
    declarativeHarness: {
      key: "profile-opencode-default",
      templateId: "command-agent",
    },
  },
  defaultPorts: [],
  suggestedChecks: [],
  credentialRequirements: [],
  pin: {
    profileInstallationId: "awpi_example",
    profileDefinitionDigest: digest,
    profileId: "opencode-default",
    profileVersion: "1.0.0",
    adapterInstallationId: "aai_example",
    adapterDefinitionDigest: digest,
    adapterId: "opencode",
    adapterVersion: "1.0.0",
    harnessKey: "profile-opencode-default",
    harnessTemplateId: "command-agent",
    sandboxTemplateId: "node-22",
    sandboxTemplateVersion: "1.0.0",
    sandboxTemplateDigest: templateDigest,
    capabilities: {
      taskMode: true,
      interactive: true,
      backgroundRuns: true,
      nativeSession: true,
      persistentPaths: ["/workspace"],
      healthcheck: { kind: "process" as const },
    },
  },
};

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class ProfileContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_agent_workspace_profile_http",
      entrypoint: input.entrypoint,
      actor: input.actor,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

describe("Agent Workspace Profile HTTP routes", () => {
  test("[PROFILE-SURFACE-011] dispatches lifecycle and compile operations", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: ExecutionContext, command: Command<T>): Promise<Result<T>> => {
        commands.push(command as Command<unknown>);
        if (command instanceof UninstallAgentWorkspaceProfileCommand) {
          return ok({ installationId: "awpi_example", uninstalled: true } as T);
        }
        return ok(
          command instanceof DisableAgentWorkspaceProfileCommand
            ? { ...installed, status: "disabled", updatedAt: "2026-07-26T00:01:00.000Z" }
            : installed,
        ) as Result<T>;
      },
    } as CommandBus;
    const queryBus = {
      execute: async <T>(_context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
        queries.push(query as Query<unknown>);
        if (query instanceof ValidateAgentWorkspaceProfileQuery) {
          return ok({
            manifest: { schemaVersion: "appaloft.agent-workspace-profile/v1" },
            definitionDigest: digest,
          } as T);
        }
        if (query instanceof ListAgentWorkspaceProfilesQuery) return ok([installed] as T);
        if (query instanceof CompileAgentWorkspaceProfileQuery) return ok(compiled as T);
        return ok(installed as T);
      },
    } as QueryBus;
    const app = mountAppaloftOrpcRoutes(new Elysia(), {
      commandBus,
      queryBus,
      executionContextFactory: new ProfileContextFactory(),
      logger: new NoopLogger(),
    });
    const jsonHeaders = {
      authorization: "Bearer test",
      "content-type": "application/json",
    };

    const validated = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles/validate", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          manifest: { schemaVersion: "appaloft.agent-workspace-profile/v1" },
        }),
      }),
    );
    const created = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          manifest: { schemaVersion: "appaloft.agent-workspace-profile/v1" },
        }),
      }),
    );
    const listed = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles?limit=20", {
        headers: { authorization: "Bearer test" },
      }),
    );
    const shown = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles/awpi_example", {
        headers: { authorization: "Bearer test" },
      }),
    );
    const compiledResponse = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles/awpi_example/compile", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }),
    );
    const disabled = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles/awpi_example/disable", {
        method: "POST",
        headers: jsonHeaders,
        body: "{}",
      }),
    );
    const uninstalled = await app.handle(
      new Request("http://localhost/api/agent-workspace-profiles/awpi_example", {
        method: "DELETE",
        headers: { authorization: "Bearer test" },
      }),
    );

    expect([
      validated.status,
      created.status,
      listed.status,
      shown.status,
      compiledResponse.status,
      disabled.status,
      uninstalled.status,
    ]).toEqual([200, 201, 200, 200, 200, 200, 200]);
    expect(await listed.json()).toEqual([installed]);
    expect(await compiledResponse.json()).toEqual(compiled);
    expect((queries[1] as ListAgentWorkspaceProfilesQuery).input).toEqual({ limit: 20 });
    expect(queries[2]).toBeInstanceOf(ShowAgentWorkspaceProfileQuery);
    expect(commands.map((command) => command.constructor)).toEqual([
      InstallAgentWorkspaceProfileCommand,
      DisableAgentWorkspaceProfileCommand,
      UninstallAgentWorkspaceProfileCommand,
    ]);
  });
});
