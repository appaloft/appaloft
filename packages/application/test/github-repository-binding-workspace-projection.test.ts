import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ProjectId,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  UpdatedAt,
} from "@appaloft/core";

import {
  createExecutionContext,
  GitHubRepositoryBindingWorkspaceProjection,
  InMemoryGitHubAgentConfigurationRepository,
  InMemoryRepositoryBindingRepository,
  toRepositoryContext,
} from "../src";

const context = toRepositoryContext(
  createExecutionContext({
    entrypoint: "http",
    requestId: "req_github_binding_projection",
    tenant: { tenantId: "tenant_a" },
  }),
);

function githubBinding(projectId = "project_a") {
  return {
    id: "grb_1",
    tenantId: "tenant_a",
    projectId,
    provider: "github" as const,
    installationConnectionId: "conn_github_installation",
    providerRepositoryId: "123456",
    repositoryFullNameSnapshot: "Appaloft/Agent-Sandbox-Smoke",
    defaultBranchSnapshot: "main",
    privateSnapshot: true,
    status: "active" as const,
    createdAt: "2026-07-29T00:00:00.000Z",
  };
}

async function explicitBinding(
  repository: InMemoryRepositoryBindingRepository,
  input: { projectId: string; status?: "active" | "unbound" },
) {
  const binding = ProjectRepositoryBinding.bind({
    id: ProjectRepositoryBindingId.rehydrate("rbd_explicit"),
    repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Appaloft/Agent-Sandbox-Smoke"),
    projectId: ProjectId.rehydrate(input.projectId),
    createdAt: CreatedAt.rehydrate("2026-07-29T00:00:00.000Z"),
  })._unsafeUnwrap();
  if (input.status === "unbound") {
    binding.unbind({ at: UpdatedAt.rehydrate("2026-07-29T00:01:00.000Z") })._unsafeUnwrap();
  }
  await repository.save(context, binding);
}

describe("GitHub Repository Binding Workspace projection", () => {
  test("[GH-AUTO-BIND-004][WS-OPEN-BIND-005] exposes an active GitHub binding to Workspace Open", async () => {
    const repository = new InMemoryRepositoryBindingRepository();
    const github = new InMemoryGitHubAgentConfigurationRepository();
    await github.saveRepositoryBinding(context, githubBinding());
    const projection = new GitHubRepositoryBindingWorkspaceProjection(repository, github);

    const found = await projection.findByIdentity(
      context,
      "github.com/Appaloft/Agent-Sandbox-Smoke",
    );

    expect(found?.binding.toState()).toMatchObject({
      projectId: { value: "project_a" },
      status: "active",
      repositoryIdentity: {
        value: "github.com/Appaloft/Agent-Sandbox-Smoke",
      },
    });
  });

  test("[GH-AUTO-AUTHZ-006] fails closed when explicit and GitHub bindings disagree", async () => {
    const repository = new InMemoryRepositoryBindingRepository();
    const github = new InMemoryGitHubAgentConfigurationRepository();
    await explicitBinding(repository, { projectId: "project_b" });
    await github.saveRepositoryBinding(context, githubBinding("project_a"));
    const projection = new GitHubRepositoryBindingWorkspaceProjection(repository, github);

    expect(
      await projection.findByIdentity(context, "github.com/Appaloft/Agent-Sandbox-Smoke"),
    ).toBeNull();
  });

  test("[WS-OPEN-BIND-005] preserves an explicit unbind over a GitHub projection", async () => {
    const repository = new InMemoryRepositoryBindingRepository();
    const github = new InMemoryGitHubAgentConfigurationRepository();
    await explicitBinding(repository, { projectId: "project_a", status: "unbound" });
    await github.saveRepositoryBinding(context, githubBinding());
    const projection = new GitHubRepositoryBindingWorkspaceProjection(repository, github);

    expect(
      (
        await projection.findByIdentity(context, "github.com/Appaloft/Agent-Sandbox-Smoke")
      )?.binding.toState().status,
    ).toBe("unbound");
  });
});
