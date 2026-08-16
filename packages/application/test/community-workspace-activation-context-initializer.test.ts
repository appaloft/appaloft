import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";
import { createExecutionContext } from "../src";
import { CommunityWorkspaceActivationContextInitializer } from "../src/community-workspace-activation-context-initializer";
import { CreateEnvironmentCommand } from "../src/operations/environments/create-environment.command";

const defaultProfile = {
  adapterManifest: { adapter: true },
  profileManifest: { profile: true },
};

describe("Community occupancy initializer", () => {
  test("[WS-REMOTE-PROFILE-008] fails closed when appaloft-remote is not configured", async () => {
    const initializer = new CommunityWorkspaceActivationContextInitializer({
      commandBus: {
        execute: async () => {
          throw new Error("unused");
        },
      },
      projects: { findOne: async () => null, upsert: async () => undefined },
      environments: { findOne: async () => null, upsert: async () => undefined },
      repositoryBindings: {
        findByIdentity: async () => null,
        save: async () => undefined,
      } as never,
      adapters: {
        install: async () => {
          throw new Error("unused");
        },
      } as never,
      profiles: {
        validate: () => {
          throw new Error("unused");
        },
        install: async () => {
          throw new Error("unused");
        },
      } as never,
      profileRepository: { findInstallationByDefinition: async () => null } as never,
    });

    const result = await initializer.ensure(
      createExecutionContext({
        requestId: "req_community_init",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "tenant_1" },
      }),
      {
        repository: "https://github.com/acme/api.git",
        repositoryIdentity: "github.com/acme/api",
        missing: "repository-binding",
      },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.details?.code).toBe("workspace_activation_initializer_unavailable");
  });

  test("[WS-REMOTE-ENV-040] creates Environment local when the occupancy Project has none", async () => {
    const executed: unknown[] = [];
    const initializer = new CommunityWorkspaceActivationContextInitializer({
      commandBus: {
        execute: async (_context: unknown, command: unknown) => {
          executed.push(command);
          return ok({ id: "env_created" });
        },
      } as never,
      projects: {
        findOne: async () =>
          ({
            id: { value: "prj_demo" },
            toState: () => ({
              lifecycleStatus: { value: "active" },
              defaultWorkspaceProfileInstallationId: { value: "awpi_demo" },
            }),
          }) as never,
        upsert: async () => undefined,
      },
      environments: { findOne: async () => null, upsert: async () => undefined },
      repositoryBindings: {
        findByIdentity: async () => ({
          binding: {
            toState: () => ({
              status: "active",
              projectId: { value: "prj_demo" },
            }),
          },
        }),
        save: async () => undefined,
      } as never,
      adapters: { install: async () => ok({ installationId: "aai_demo" }) } as never,
      profiles: {
        validate: () => ok({ definitionDigest: "sha256:demo" }),
        install: async () => ok({ installationId: "awpi_demo" }),
      } as never,
      profileRepository: { findInstallationByDefinition: async () => ({}) } as never,
      defaultProfile,
    });

    const result = await initializer.ensure(
      createExecutionContext({
        requestId: "req_occupancy_env_create",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "tenant_1" },
      }),
      {
        repository: "https://github.com/octocat/Hello-World.git",
        repositoryIdentity: "github.com/octocat/Hello-World",
        missing: "repository-binding",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(executed).toHaveLength(1);
    expect(executed[0]).toBeInstanceOf(CreateEnvironmentCommand);
    expect(executed[0]).toMatchObject({
      projectId: "prj_demo",
      name: "local",
      kind: "local",
    });
  });

  test("[WS-REMOTE-ENV-041] reuses existing Environment local without create", async () => {
    const executed: unknown[] = [];
    const initializer = new CommunityWorkspaceActivationContextInitializer({
      commandBus: {
        execute: async (_context: unknown, command: unknown) => {
          executed.push(command);
          return ok({ id: "unused" });
        },
      } as never,
      projects: {
        findOne: async () =>
          ({
            id: { value: "prj_demo" },
            toState: () => ({
              lifecycleStatus: { value: "active" },
              defaultWorkspaceProfileInstallationId: { value: "awpi_demo" },
            }),
          }) as never,
        upsert: async () => undefined,
      },
      environments: {
        findOne: async () => ({ id: { value: "env_local" } }),
        upsert: async () => undefined,
      } as never,
      repositoryBindings: {
        findByIdentity: async () => ({
          binding: {
            toState: () => ({
              status: "active",
              projectId: { value: "prj_demo" },
            }),
          },
        }),
        save: async () => undefined,
      } as never,
      adapters: { install: async () => ok({ installationId: "aai_demo" }) } as never,
      profiles: {
        validate: () => ok({ definitionDigest: "sha256:demo" }),
        install: async () => ok({ installationId: "awpi_demo" }),
      } as never,
      profileRepository: { findInstallationByDefinition: async () => ({}) } as never,
      defaultProfile,
    });

    const result = await initializer.ensure(
      createExecutionContext({
        requestId: "req_occupancy_env_reuse",
        entrypoint: "cli",
        actor: { kind: "user", id: "usr_1" },
        tenant: { tenantId: "tenant_1" },
      }),
      {
        repository: "https://github.com/octocat/Hello-World.git",
        repositoryIdentity: "github.com/octocat/Hello-World",
        missing: "repository-binding",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(executed).toHaveLength(0);
  });
});
