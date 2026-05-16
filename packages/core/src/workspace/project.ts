import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { OrganizationId, type ProjectId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { ProjectLifecycleStatusValue } from "../shared/state-machine";
import {
  type ArchivedAt,
  type CreatedAt,
  type DeletedAt,
  type UpdatedAt,
} from "../shared/temporal";
import {
  type ArchiveReason,
  type DescriptionText,
  type ProjectName,
  ProjectSlug,
} from "../shared/text-values";

export interface ProjectState {
  id: ProjectId;
  organizationId?: OrganizationId;
  name: ProjectName;
  slug: ProjectSlug;
  description?: DescriptionText;
  lifecycleStatus: ProjectLifecycleStatusValue;
  archivedAt?: ArchivedAt;
  archiveReason?: ArchiveReason;
  deletedAt?: DeletedAt;
  createdAt: CreatedAt;
}

export interface ProjectVisitor<TContext, TResult> {
  visitProject(project: Project, context: TContext): TResult;
}

export const defaultSelfHostedOrganizationId = "org_self_hosted";

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
    organizationId?: OrganizationId;
    name: ProjectName;
    description?: DescriptionText;
    createdAt: CreatedAt;
  }): Result<Project> {
    return ProjectSlug.fromName(input.name).map((slug) => {
      const project = new Project({
        id: input.id,
        organizationId:
          input.organizationId ?? OrganizationId.rehydrate(defaultSelfHostedOrganizationId),
        name: input.name,
        slug,
        lifecycleStatus: ProjectLifecycleStatusValue.active(),
        createdAt: input.createdAt,
        ...(input.description ? { description: input.description } : {}),
      });

      project.recordDomainEvent("project.created", input.createdAt, {
        organizationId: project.toState().organizationId?.value ?? defaultSelfHostedOrganizationId,
        slug: slug.value,
      });

      return project;
    });
  }

  static rehydrate(state: ProjectState): Project {
    return new Project({
      ...state,
      organizationId:
        state.organizationId ?? OrganizationId.rehydrate(defaultSelfHostedOrganizationId),
      lifecycleStatus: state.lifecycleStatus ?? ProjectLifecycleStatusValue.active(),
      ...(state.archivedAt ? { archivedAt: state.archivedAt } : {}),
      ...(state.archiveReason ? { archiveReason: state.archiveReason } : {}),
      ...(state.deletedAt ? { deletedAt: state.deletedAt } : {}),
    });
  }

  accept<TContext, TResult>(
    visitor: ProjectVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitProject(this, context);
  }

  get id(): ProjectId {
    return this.state.id;
  }

  toState(): ProjectState {
    return { ...this.state };
  }

  ensureCanAcceptMutation(commandName: string): Result<void> {
    if (this.state.lifecycleStatus.isDeleted()) {
      const error = domainError.notFound("project", this.state.id.value);
      return err({
        ...error,
        details: {
          ...(error.details ?? {}),
          phase: "project-lifecycle-guard",
          projectId: this.state.id.value,
          projectSlug: this.state.slug.value,
          lifecycleStatus: "deleted",
          commandName,
        },
      });
    }

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

  restore(input: { restoredAt: UpdatedAt }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isActive()) {
      return ok({ changed: false });
    }

    const lifecycleStatus = this.state.lifecycleStatus.restore();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    const previousArchivedAt = this.state.archivedAt;
    const previousArchiveReason = this.state.archiveReason;
    this.state.lifecycleStatus = lifecycleStatus.value;
    delete this.state.archivedAt;
    delete this.state.archiveReason;

    this.recordDomainEvent("project-restored", input.restoredAt, {
      projectId: this.state.id.value,
      projectSlug: this.state.slug.value,
      restoredAt: input.restoredAt.value,
      ...(previousArchivedAt ? { previousArchivedAt: previousArchivedAt.value } : {}),
      ...(previousArchiveReason ? { previousArchiveReason: previousArchiveReason.value } : {}),
    });

    return ok({ changed: true });
  }

  delete(input: { deletedAt: DeletedAt }): Result<{ changed: boolean }> {
    if (this.state.lifecycleStatus.isDeleted()) {
      return ok({ changed: false });
    }

    const lifecycleStatus = this.state.lifecycleStatus.delete();
    if (lifecycleStatus.isErr()) {
      return err(lifecycleStatus.error);
    }

    this.state.lifecycleStatus = lifecycleStatus.value;
    this.state.deletedAt = input.deletedAt;

    this.recordDomainEvent("project-deleted", input.deletedAt, {
      projectId: this.state.id.value,
      projectSlug: this.state.slug.value,
      deletedAt: input.deletedAt.value,
      ...(this.state.archivedAt ? { archivedAt: this.state.archivedAt.value } : {}),
      ...(this.state.archiveReason ? { archiveReason: this.state.archiveReason.value } : {}),
    });

    return ok({ changed: true });
  }

  setDescription(input: {
    description?: DescriptionText;
    changedAt: UpdatedAt;
  }): Result<{ changed: boolean }> {
    const lifecycleGuard = this.ensureCanAcceptMutation("projects.set-description");
    if (lifecycleGuard.isErr()) {
      return err(lifecycleGuard.error);
    }

    const previousDescription = this.state.description;
    const nextDescription = input.description;

    if (
      (!previousDescription && !nextDescription) ||
      (previousDescription && nextDescription && previousDescription.equals(nextDescription))
    ) {
      return ok({ changed: false });
    }

    if (nextDescription) {
      this.state.description = nextDescription;
    } else {
      delete this.state.description;
    }

    this.recordDomainEvent("project-description-set", input.changedAt, {
      projectId: this.state.id.value,
      projectSlug: this.state.slug.value,
      changedAt: input.changedAt.value,
      ...(previousDescription ? { previousDescription: previousDescription.value } : {}),
      ...(nextDescription ? { nextDescription: nextDescription.value } : {}),
    });

    return ok({ changed: true });
  }
}
