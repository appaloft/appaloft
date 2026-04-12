import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type DestinationId,
  type EnvironmentId,
  type ProjectId,
  type ResourceId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type ResourceKindValue, type ResourceServiceKindValue } from "../shared/state-machine";
import { type CreatedAt } from "../shared/temporal";
import {
  type DescriptionText,
  type ResourceName,
  type ResourceServiceName,
  ResourceSlug,
} from "../shared/text-values";

export interface ResourceServiceState {
  name: ResourceServiceName;
  kind: ResourceServiceKindValue;
}

export interface ResourceState {
  id: ResourceId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  destinationId?: DestinationId;
  name: ResourceName;
  slug: ResourceSlug;
  kind: ResourceKindValue;
  services: ResourceServiceState[];
  createdAt: CreatedAt;
  description?: DescriptionText;
}

export interface ResourceVisitor<TContext, TResult> {
  visitResource(resource: Resource, context: TContext): TResult;
}

export class Resource extends AggregateRoot<ResourceState> {
  private constructor(state: ResourceState) {
    super(state);
  }

  static create(input: {
    id: ResourceId;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    destinationId?: DestinationId;
    name: ResourceName;
    kind: ResourceKindValue;
    services?: ResourceServiceState[];
    createdAt: CreatedAt;
    description?: DescriptionText;
  }): Result<Resource> {
    return ResourceSlug.fromName(input.name).andThen((slug) => {
      const services = input.services ?? [];
      if (input.kind.value !== "compose-stack" && services.length > 1) {
        return err(
          domainError.validation("Only compose-stack resources can declare multiple services"),
        );
      }

      const resource = new Resource({
        id: input.id,
        projectId: input.projectId,
        environmentId: input.environmentId,
        ...(input.destinationId ? { destinationId: input.destinationId } : {}),
        name: input.name,
        slug,
        kind: input.kind,
        services: [...services],
        createdAt: input.createdAt,
        ...(input.description ? { description: input.description } : {}),
      });
      resource.recordDomainEvent("resource.created", input.createdAt, {
        projectId: input.projectId.value,
        environmentId: input.environmentId.value,
        ...(input.destinationId ? { destinationId: input.destinationId.value } : {}),
        kind: input.kind.value,
      });
      return ok(resource);
    });
  }

  static rehydrate(state: ResourceState): Resource {
    return new Resource({
      ...state,
      services: [...state.services],
    });
  }

  accept<TContext, TResult>(
    visitor: ResourceVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitResource(this, context);
  }

  toState(): ResourceState {
    return {
      ...this.state,
      services: [...this.state.services],
    };
  }
}
