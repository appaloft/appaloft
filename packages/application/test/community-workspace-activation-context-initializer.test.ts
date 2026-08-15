import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "../src";
import { CommunityWorkspaceActivationContextInitializer } from "../src/community-workspace-activation-context-initializer";

describe("Community occupancy initializer", () => {
  test("[WS-REMOTE-PROFILE-008] fails closed when appaloft-remote is not configured", async () => {
    const initializer = new CommunityWorkspaceActivationContextInitializer({
      commandBus: {
        execute: async () => {
          throw new Error("unused");
        },
      },
      projects: { findOne: async () => null, upsert: async () => undefined },
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
});
