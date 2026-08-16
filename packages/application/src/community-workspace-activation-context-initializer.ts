import {
  domainError,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentName,
  err,
  ok,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ResourceByEnvironmentAndSlugSpec,
  ResourceName,
  ResourceSlug,
  type Result,
} from "@appaloft/core";

import { type AgentAdapterInstallationService } from "./agent-adapter";
import { type WorkspaceActivationContextDisposition } from "./agent-workspace-open";
import { type WorkspaceActivationContextInitializerPort } from "./agent-workspace-open-preflight";
import {
  type AgentWorkspaceProfileInstallationService,
  type AgentWorkspaceProfileRegistryRepository,
} from "./agent-workspace-profile";
import { type CommandBus } from "./cqrs";
import { type ExecutionContext, toRepositoryContext } from "./execution-context";
import { CreateEnvironmentCommand } from "./operations/environments/create-environment.command";
import { ConfigureProjectWorkspaceProfileCommand } from "./operations/projects/configure-project-workspace-profile.command";
import { CreateProjectCommand } from "./operations/projects/create-project.command";
import { CreateResourceCommand } from "./operations/resources/create-resource.command";
import {
  type EnvironmentRepository,
  type ProjectRepository,
  type ResourceRepository,
} from "./ports";
import { type RepositoryBindingRepository } from "./repository-binding";
import { BindProjectRepositoryCommand } from "./repository-binding-messages";

export interface CommunityRemoteWorkspaceDefaultProfileConfig {
  readonly adapterManifest: unknown;
  readonly profileManifest: unknown;
}

type CommunityWorkspaceActivationInitializationResult = Result<{
  readonly project: WorkspaceActivationContextDisposition;
  readonly repositoryBinding: WorkspaceActivationContextDisposition;
  readonly profile: WorkspaceActivationContextDisposition;
}>;

function projectNameForRepository(repositoryIdentity: string): Result<ProjectName> {
  const normalized = repositoryIdentity
    .replace(/^https?:\/\//u, "")
    .replace(/\.git$/u, "")
    .replace(/[^A-Za-z0-9._/-]+/gu, "-")
    .slice(-100);
  return ProjectName.create(normalized || "Workspace Project");
}

export class CommunityWorkspaceActivationContextInitializer
  implements WorkspaceActivationContextInitializerPort
{
  private readonly pending = new Map<
    string,
    Promise<CommunityWorkspaceActivationInitializationResult>
  >();

  constructor(
    private readonly dependencies: {
      readonly commandBus: Pick<CommandBus, "execute">;
      readonly projects: ProjectRepository;
      readonly environments: EnvironmentRepository;
      readonly resources: ResourceRepository;
      readonly repositoryBindings: RepositoryBindingRepository;
      readonly adapters: AgentAdapterInstallationService;
      readonly profiles: AgentWorkspaceProfileInstallationService;
      readonly profileRepository: AgentWorkspaceProfileRegistryRepository;
      readonly defaultProfile?: CommunityRemoteWorkspaceDefaultProfileConfig;
    },
  ) {}

  async ensure(
    context: ExecutionContext,
    input: Parameters<WorkspaceActivationContextInitializerPort["ensure"]>[1],
  ): Promise<CommunityWorkspaceActivationInitializationResult> {
    const tenantId = context.tenant?.tenantId ?? "tenant_instance";
    const key = `${tenantId}\0${input.repositoryIdentity}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.ensureUnlocked(context, input).finally(() => {
      if (this.pending.get(key) === operation) this.pending.delete(key);
    });
    this.pending.set(key, operation);
    return operation;
  }

  private async ensureUnlocked(
    context: ExecutionContext,
    input: Parameters<WorkspaceActivationContextInitializerPort["ensure"]>[1],
  ): Promise<CommunityWorkspaceActivationInitializationResult> {
    if (!this.dependencies.defaultProfile) {
      return err(
        domainError.conflict("Community remote Workspace default Profile is not configured", {
          code: "workspace_activation_initializer_unavailable",
          guidance: "Install an OpenCode or Pi Adapter, then retry appaloft code.",
        }),
      );
    }
    const repositoryContext = toRepositoryContext(context);
    let binding = await this.dependencies.repositoryBindings.findByIdentity(
      repositoryContext,
      input.repositoryIdentity,
    );
    let projectDisposition: WorkspaceActivationContextDisposition = "reused";
    let bindingDisposition: WorkspaceActivationContextDisposition = "reused";
    let projectId: string;

    if (binding?.binding.toState().status === "active") {
      projectId = binding.binding.toState().projectId.value;
    } else {
      const name = projectNameForRepository(input.repositoryIdentity);
      if (name.isErr()) return err(name.error);
      const slug = ProjectSlug.fromName(name.value);
      if (slug.isErr()) return err(slug.error);
      let project = await this.dependencies.projects.findOne(
        repositoryContext,
        ProjectBySlugSpec.create(slug.value),
      );
      if (!project) {
        const command = CreateProjectCommand.create({
          name: name.value.value,
          ...(context.tenant?.organizationId
            ? { organizationId: context.tenant.organizationId }
            : {}),
        });
        if (command.isErr()) return err(command.error);
        const created = await this.dependencies.commandBus.execute(context, command.value);
        if (created.isOk()) {
          projectId = created.value.id;
          projectDisposition = "created";
        } else {
          project = await this.dependencies.projects.findOne(
            repositoryContext,
            ProjectBySlugSpec.create(slug.value),
          );
          if (!project) return err(created.error);
          projectId = project.id.value;
        }
      } else {
        projectId = project.id.value;
      }
      const bind = BindProjectRepositoryCommand.create({
        repositoryIdentity: input.repositoryIdentity,
        projectId,
      });
      if (bind.isErr()) return err(bind.error);
      const bound = await this.dependencies.commandBus.execute(context, bind.value);
      binding = await this.dependencies.repositoryBindings.findByIdentity(
        repositoryContext,
        input.repositoryIdentity,
      );
      if (bound.isErr()) {
        if (
          binding?.binding.toState().status !== "active" ||
          binding.binding.toState().projectId.value !== projectId
        ) {
          return err(bound.error);
        }
        bindingDisposition = "reused";
      } else {
        bindingDisposition = "created";
      }
      if (binding?.binding.toState().status !== "active") {
        return err(
          domainError.conflict("Workspace Repository Binding was not persisted", {
            code: "workspace_activation_context_conflict",
          }),
        );
      }
    }

    const project = await this.dependencies.projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(ProjectId.rehydrate(projectId)),
    );
    if (project?.toState().lifecycleStatus.value !== "active") {
      return err(
        domainError.conflict("Workspace activation Project is unavailable", {
          code: "workspace_activation_context_conflict",
        }),
      );
    }
    const environment = await this.ensureLocalEnvironment(context, projectId);
    if (environment.isErr()) return err(environment.error);
    const resource = await this.ensureDefaultResource(context, projectId, input.repository);
    if (resource.isErr()) return err(resource.error);
    if (project.toState().defaultWorkspaceProfileInstallationId) {
      return ok({
        project: projectDisposition,
        repositoryBinding: bindingDisposition,
        profile: "reused",
      });
    }

    const profileValidation = this.dependencies.profiles.validate({
      manifest: this.dependencies.defaultProfile.profileManifest,
    });
    if (profileValidation.isErr()) return err(profileValidation.error);
    const existingProfile = await this.dependencies.profileRepository.findInstallationByDefinition(
      repositoryContext,
      profileValidation.value.definitionDigest,
    );
    const adapter = await this.dependencies.adapters.install(context, {
      manifest: this.dependencies.defaultProfile.adapterManifest,
    });
    if (adapter.isErr()) return err(adapter.error);
    const profile = await this.dependencies.profiles.install(context, {
      manifest: this.dependencies.defaultProfile.profileManifest,
    });
    if (profile.isErr()) return err(profile.error);
    const configure = ConfigureProjectWorkspaceProfileCommand.create({
      projectId,
      profileInstallationId: profile.value.installationId,
    });
    if (configure.isErr()) return err(configure.error);
    const configured = await this.dependencies.commandBus.execute(context, configure.value);
    if (configured.isErr()) {
      const concurrentlyConfiguredProject = await this.dependencies.projects.findOne(
        repositoryContext,
        ProjectByIdSpec.create(ProjectId.rehydrate(projectId)),
      );
      if (
        concurrentlyConfiguredProject?.toState().defaultWorkspaceProfileInstallationId?.value !==
        profile.value.installationId
      ) {
        return err(configured.error);
      }
    }
    return ok({
      project: projectDisposition,
      repositoryBinding: bindingDisposition,
      profile: existingProfile ? "reused" : "created",
    });
  }

  async ensureLocalEnvironment(
    context: ExecutionContext,
    projectId: string,
  ): Promise<Result<void>> {
    const name = EnvironmentName.create("local");
    if (name.isErr()) return err(name.error);
    const existing = await this.dependencies.environments.findOne(
      toRepositoryContext(context),
      EnvironmentByProjectAndNameSpec.create(ProjectId.rehydrate(projectId), name.value),
    );
    if (existing) return ok(undefined);
    const created = CreateEnvironmentCommand.create({
      projectId,
      name: "local",
      kind: "local",
    });
    if (created.isErr()) return err(created.error);
    const executed = await this.dependencies.commandBus.execute(context, created.value);
    if (executed.isOk()) return ok(undefined);
    const raced = await this.dependencies.environments.findOne(
      toRepositoryContext(context),
      EnvironmentByProjectAndNameSpec.create(ProjectId.rehydrate(projectId), name.value),
    );
    return raced ? ok(undefined) : err(executed.error);
  }

  async ensureDefaultResource(
    context: ExecutionContext,
    projectId: string,
    repository: string,
  ): Promise<Result<void>> {
    const environmentReady = await this.ensureLocalEnvironment(context, projectId);
    if (environmentReady.isErr()) return err(environmentReady.error);
    const environmentName = EnvironmentName.create("local");
    if (environmentName.isErr()) return err(environmentName.error);
    const environment = await this.dependencies.environments.findOne(
      toRepositoryContext(context),
      EnvironmentByProjectAndNameSpec.create(ProjectId.rehydrate(projectId), environmentName.value),
    );
    if (!environment) {
      return err(
        domainError.conflict("Workspace activation Environment is unavailable", {
          code: "workspace_activation_context_conflict",
        }),
      );
    }
    const resourceName = ResourceName.create("app");
    if (resourceName.isErr()) return err(resourceName.error);
    const slug = ResourceSlug.fromName(resourceName.value);
    if (slug.isErr()) return err(slug.error);
    const existing = await this.dependencies.resources.findOne(
      toRepositoryContext(context),
      ResourceByEnvironmentAndSlugSpec.create(
        ProjectId.rehydrate(projectId),
        EnvironmentId.rehydrate(environment.id.value),
        slug.value,
      ),
    );
    if (existing) return ok(undefined);
    const created = CreateResourceCommand.create({
      projectId,
      environmentId: environment.id.value,
      name: "app",
      kind: "application",
      source: {
        kind: "remote-git",
        locator: repository,
      },
    });
    if (created.isErr()) return err(created.error);
    const executed = await this.dependencies.commandBus.execute(context, created.value);
    if (executed.isOk()) return ok(undefined);
    const raced = await this.dependencies.resources.findOne(
      toRepositoryContext(context),
      ResourceByEnvironmentAndSlugSpec.create(
        ProjectId.rehydrate(projectId),
        EnvironmentId.rehydrate(environment.id.value),
        slug.value,
      ),
    );
    return raced ? ok(undefined) : err(executed.error);
  }
}
