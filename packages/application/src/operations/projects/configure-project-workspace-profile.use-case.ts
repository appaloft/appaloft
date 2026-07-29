import {
  AgentWorkspaceProfileInstallationId,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertProjectSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type AgentWorkspaceProfileRegistryRepository } from "../../agent-workspace-profile";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ProjectRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ConfigureProjectWorkspaceProfileCommandInput } from "./configure-project-workspace-profile.schema";

@injectable()
export class ConfigureProjectWorkspaceProfileUseCase {
  constructor(
    @inject(tokens.projectRepository)
    private readonly projectRepository: ProjectRepository,
    @inject(tokens.agentWorkspaceProfileRegistryRepository)
    private readonly profileRepository: AgentWorkspaceProfileRegistryRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureProjectWorkspaceProfileCommandInput,
  ): Promise<Result<{ projectId: string; profileInstallationId: string }>> {
    const self = this;
    const repositoryContext = toRepositoryContext(context);
    return safeTry(async function* () {
      const projectId = yield* ProjectId.create(input.projectId);
      const profileInstallationId = yield* AgentWorkspaceProfileInstallationId.create(
        input.profileInstallationId,
      );
      const [project, profile] = await Promise.all([
        self.projectRepository.findOne(repositoryContext, ProjectByIdSpec.create(projectId)),
        self.profileRepository.findInstallation(repositoryContext, profileInstallationId.value),
      ]);
      if (!project) return err(domainError.notFound("project", projectId.value));
      if (!profile) {
        return err(
          domainError.notFound("AgentWorkspaceProfileInstallation", profileInstallationId.value),
        );
      }
      const available = profile.assertAvailableForNewWorkspace();
      if (available.isErr()) return err(available.error);
      const configuredAt = yield* UpdatedAt.create(self.clock.now());
      const configured = yield* project.configureWorkspaceProfile({
        profileInstallationId,
        configuredAt,
      });
      if (configured.changed) {
        await self.projectRepository.upsert(
          repositoryContext,
          project,
          UpsertProjectSpec.fromProject(project),
        );
        await publishDomainEventsAndReturn(context, self.eventBus, self.logger, project, undefined);
      }
      return ok({
        projectId: projectId.value,
        profileInstallationId: profileInstallationId.value,
      });
    });
  }
}
