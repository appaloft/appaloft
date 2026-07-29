import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BindRepositoryCommand,
  type Command,
  type CommandBus,
  CreateAgentProfileCommand,
  CreateAutomationRuleCommand,
  createExecutionContext,
  DisableAgentProfileCommand,
  DisableAutomationRuleCommand,
  type ExecutionContextFactory,
  ListAgentProfilesQuery,
  ListAutomationRulesQuery,
  ListRepositoryBindingsQuery,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("GitHub Agent automation CLI", () => {
  test("[GH-AUTO-SURFACE-019] dispatches binding, rule, and profile management through shared messages", async () => {
    const commands: Command<unknown>[] = [];
    const queries: Query<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: Command<T>) => {
        commands.push(command as Command<unknown>);
        return ok({} as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: Query<T>) => {
        queries.push(query as Query<unknown>);
        return ok([] as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({ ...input, requestId: "req_github_agent_cli_test" }),
    };
    const { createCliProgram } = await import("../src");
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });
    const directory = mkdtempSync(join(tmpdir(), "appaloft-github-agent-cli-"));
    temporaryDirectories.push(directory);
    const bindingPath = join(directory, "binding.json");
    const rulePath = join(directory, "rule.json");
    const profilePath = join(directory, "profile.json");
    writeFileSync(
      bindingPath,
      JSON.stringify({
        projectId: "project_a",
        installationConnectionId: "conn_github_installation",
        providerRepositoryId: "123456",
        repositoryFullNameSnapshot: "appaloft/agent-sandbox-smoke",
        defaultBranchSnapshot: "main",
        privateSnapshot: true,
      }),
    );
    writeFileSync(
      rulePath,
      JSON.stringify({
        projectId: "project_a",
        repositoryBindingId: "grb_a",
        name: "Review ready pull requests",
        trigger: { event: "pull_request", action: "ready_for_review" },
        taskAction: "review",
        actorPolicy: "project-automation-identity",
        automationIdentityRef: "automation_identity_a",
        agentProfileId: "agp_review",
        workspaceProfileInstallationId: "awpi_review",
        sandboxTemplateId: "sandbox_template_review",
        serverPoolId: "server_pool_a",
        mode: "review-only",
        maximumRuntimeSeconds: 3600,
        maximumRetries: 2,
        previewPolicy: "disabled",
        pullRequestDeliveryPolicy: "review-only",
        rerunReviewOnSynchronize: false,
      }),
    );
    writeFileSync(
      profilePath,
      JSON.stringify({
        name: "OpenCode fix",
        adapter: "opencode",
        adapterInstallationId: "aai_opencode",
        adapterVersion: "1.0.0",
        capabilities: ["write", "resume-fallback"],
        defaultModel: "agent-default",
        credentialConnectionId: "conn_agent_opencode",
        workspaceProfileInstallationId: "awpi_opencode",
        sandboxTemplateId: "sandbox_template_opencode",
        maximumRuntimeSeconds: 3600,
        maximumRetries: 2,
        maximumOutputBytes: 262144,
      }),
    );

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "github-agent",
        "repository",
        "bind",
        bindingPath,
      ]);
      await program.parseAsync([
        "node",
        "appaloft",
        "github-agent",
        "repository",
        "list",
        "--project-id",
        "project_a",
      ]);
      await program.parseAsync(["node", "appaloft", "github-agent", "rule", "create", rulePath]);
      await program.parseAsync([
        "node",
        "appaloft",
        "github-agent",
        "rule",
        "list",
        "--project-id",
        "project_a",
      ]);
      await program.parseAsync(["node", "appaloft", "github-agent", "rule", "disable", "gar_a"]);
      await program.parseAsync([
        "node",
        "appaloft",
        "github-agent",
        "profile",
        "create",
        profilePath,
      ]);
      await program.parseAsync(["node", "appaloft", "github-agent", "profile", "list"]);
      await program.parseAsync(["node", "appaloft", "github-agent", "profile", "disable", "agp_a"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands.map((command) => command.constructor)).toEqual([
      BindRepositoryCommand,
      CreateAutomationRuleCommand,
      DisableAutomationRuleCommand,
      CreateAgentProfileCommand,
      DisableAgentProfileCommand,
    ]);
    expect(queries.map((query) => query.constructor)).toEqual([
      ListRepositoryBindingsQuery,
      ListAutomationRulesQuery,
      ListAgentProfilesQuery,
    ]);
    expect((commands[0] as BindRepositoryCommand).input.providerRepositoryId).toBe("123456");
    expect((commands[1] as CreateAutomationRuleCommand).input.mode).toBe("review-only");
    expect((commands[3] as CreateAgentProfileCommand).input.adapter).toBe("opencode");
  });
});
