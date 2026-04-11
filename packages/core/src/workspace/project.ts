import { AggregateRoot } from "../shared/entity";
import { type ProjectId } from "../shared/identifiers";
import { type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import { type DescriptionText, type ProjectName, ProjectSlug } from "../shared/text-values";

export interface ProjectState {
  id: ProjectId;
  name: ProjectName;
  slug: ProjectSlug;
  description?: DescriptionText;
  createdAt: CreatedAt;
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
    return new Project(state);
  }

  toState(): ProjectState {
    return { ...this.state };
  }
}
