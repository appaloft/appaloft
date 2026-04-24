import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type ProjectId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { ProjectLifecycleStatusValue } from "../shared/state-machine";
import { type ArchivedAt, type CreatedAt, type UpdatedAt } from "../shared/temporal";
import {
  type ArchiveReason,
  type DescriptionText,
  type ProjectName,
  ProjectSlug,
} from "../shared/text-values";

export interface ProjectState {
  id: ProjectId;
  name: ProjectName;
  slug: ProjectSlug;
  description?: DescriptionText;
  lifecycleStatus: ProjectLifecycleStatusValue;
  archivedAt?: ArchivedAt;
  archiveReason?: ArchiveReason;
  createdAt: CreatedAt;
}

export interface ProjectVisitor<TContext, TResult> {
  visitProject(project: Project, context: TContext): TResult;
}

function projectArchivedError(input: {
  projectId: ProjectId;
  commandName: string;
  projectSlug: ProjectSlug;
  archivedAt?: ArchivedAt;
}) {
  return domainError.projectArchived("Archived projects cannot accept new mutations", {
    phase: "project-lifecycle-guard",
    projectId: input.projectId.value,
    projectSlug: input.projectSlug.value,
    lifecycleStatus: "archived",
    commandName: input.commandName,
    ...(input.archivedAt ? { archivedAt: input.archivedAt.value } : {}),
  });
}

export class Project extends AggregateRoot<ProjectState> {
  private constructor(state: ProjectState) {
    super(state);
  }

  static create(input: {
    id: ProjectId;
    name: ProjectName;
    description?: DescriptionText;
    createdAt: CreatedAt;
  }): Result<Project> {
    return ProjectSlug.fromName(input.name).map((slug) => {
      const project = new Project({
        id: input.id,
        name: input.name,
        slug,
        lifecycleStatus: ProjectLifecycleStatusValue.active(),
        createdAt: input.createdAt,
        ...(input.description ? { description: input.description } : {}),
      });

      project.recordDomainEvent("project.created", input.createdAt, {
        slug: slug.value,
      });

      return project;
    });
  }

  static rehydrate(state: ProjectState): Project {
    return new Project({
      ...state,
      lifecycleStatus: state.lifecycleStatus ?? ProjectLifecycleStatusValue.active(),
      ...(state.archivedAt ? { archivedAt: state.archivedAt } : {}),
      ...(state.archiveReason ? { archiveReason: state.archiveReason } : {}),
    });
  }

  accept<TContext, TResult>(
    visitor: ProjectVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitProject(this, context);
  }

  toState(): ProjectState {
    return { ...this.state };
  }

  ensureCanAcceptMutation(commandName: string): Result<void> {
    if (this.state.lifecycleStatus.isArchived()) {
      return err(
        projectArchivedError({
          projectId: this.state.id,
          commandName,
          projectSlug: this.state.slug,
          ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt } : {}),
        }),
      );
    }

    return ok(undefined);
  }

  rename(input: { name: ProjectName; renamedAt: UpdatedAt }): Result<{ changed: boolean }> {
    const lifecycleGuard = this.ensureCanAcceptMutation("projects.rename");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    const slug = ProjectSlug.fromName(input.name);
    if (slug.isErr()) {
      return err(slug.error);
    }

    if (this.state.name.equals(input.name) && this.state.slug.equals(slug.value)) {
      return ok({ changed: false });
    }

    const previousName = this.state.name;
    const previousSlug = this.state.slug;
    this.state.name = input.name;
    this.state.slug = slug.value;

    this.recordDomainEvent("project-renamed", input.renamedAt, {
      projectId: this.state.id.value,
      previousName: previousName.value,
      nextName: input.name.value,
      previousSlug: previousSlug.value,
      nextSlug: slug.value.value,
      renamedAt: input.renamedAt.value,
    });

    return ok({ changed: true });
  }

  archive(input: { archivedAt: ArchivedAt; reason?: ArchiveReason }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isArchived()) {
      return ok({ changed: false });
    }

    const lifecycleStatus = this.state.lifecycleStatus.archive();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.archivedAt = input.archivedAt;
    if (input.reason) {
      this.state.archiveReason = input.reason;
    } else {
      delete this.state.archiveReason;
    }

    this.recordDomainEvent("project-archived", input.archivedAt, {
      projectId: this.state.id.value,
      projectSlug: this.state.slug.value,
      archivedAt: input.archivedAt.value,
      ...(input.reason ? { reason: input.reason.value } : {}),
    });

    return ok({ changed: true });
  }
}
