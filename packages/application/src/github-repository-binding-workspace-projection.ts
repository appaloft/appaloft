import {
  CreatedAt,
  ProjectId,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  type Result,
} from "@appaloft/core";

import { type RepositoryContext } from "./execution-context";
import { type GitHubAgentConfigurationRepository } from "./github-agent-configuration";
import {
  type RepositoryBindingRecord,
  type RepositoryBindingRepository,
} from "./repository-binding";

function githubIdentity(repositoryFullName: string): string | undefined {
  const identity = RepositoryIdentity.create(`github.com/${repositoryFullName}`);
  return identity.isOk() ? identity.value.value.toLowerCase() : undefined;
}

/**
 * Projects an active GitHub App Repository Binding into the connector-neutral
 * Repository Binding port consumed by Workspace Open.
 *
 * Explicit connector-neutral bindings remain authoritative. Conflicting or
 * ambiguous GitHub projections fail closed by returning no active binding.
 */
export class GitHubRepositoryBindingWorkspaceProjection implements RepositoryBindingRepository {
  constructor(
    private readonly repositoryBindings: RepositoryBindingRepository,
    private readonly githubConfiguration: GitHubAgentConfigurationRepository,
  ) {}

  async findByIdentity(
    context: RepositoryContext,
    repositoryIdentity: string,
  ): Promise<RepositoryBindingRecord | null> {
    const requested = RepositoryIdentity.create(repositoryIdentity);
    if (requested.isErr()) return null;

    const explicit = await this.repositoryBindings.findByIdentity(context, requested.value.value);
    const matches = (await this.githubConfiguration.listRepositoryBindings(context)).filter(
      (candidate) =>
        candidate.status === "active" &&
        githubIdentity(candidate.repositoryFullNameSnapshot) ===
          requested.value.value.toLowerCase(),
    );
    if (matches.length > 1) return null;

    const github = matches[0];
    if (explicit) {
      const state = explicit.binding.toState();
      if (state.status === "active" && github && state.projectId.value !== github.projectId) {
        return null;
      }
      return explicit;
    }
    if (!github) return null;

    const projectId = ProjectId.create(github.projectId);
    const createdAt = CreatedAt.create(github.createdAt);
    if (projectId.isErr() || createdAt.isErr()) return null;

    return {
      binding: ProjectRepositoryBinding.rehydrate({
        id: ProjectRepositoryBindingId.rehydrate(`rbd_github_${github.providerRepositoryId}`),
        repositoryIdentity: requested.value,
        projectId: projectId.value,
        status: "active",
        createdAt: createdAt.value,
      }),
    };
  }

  save(context: RepositoryContext, binding: ProjectRepositoryBinding): Promise<Result<void>> {
    return this.repositoryBindings.save(context, binding);
  }
}
