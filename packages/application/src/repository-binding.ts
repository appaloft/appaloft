import {
  CreatedAt,
  domainError,
  err,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  type Result,
  UpdatedAt,
} from "@appaloft/core";

import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type Clock, type IdGenerator, type ProjectRepository } from "./ports";

export interface RepositoryBindingRecord {
  readonly binding: ProjectRepositoryBinding;
}

export interface RepositoryBindingRepository {
  findByIdentity(
    context: RepositoryContext,
    repositoryIdentity: string,
  ): Promise<RepositoryBindingRecord | null>;
  save(context: RepositoryContext, binding: ProjectRepositoryBinding): Promise<Result<void>>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function clone(binding: ProjectRepositoryBinding): ProjectRepositoryBinding {
  return ProjectRepositoryBinding.rehydrate(binding.toState());
}

export class InMemoryRepositoryBindingRepository implements RepositoryBindingRepository {
  private readonly bindings = new Map<string, ProjectRepositoryBinding>();

  async findByIdentity(
    context: RepositoryContext,
    repositoryIdentity: string,
  ): Promise<RepositoryBindingRecord | null> {
    const binding = this.bindings.get(`${tenantKey(context)}:${repositoryIdentity}`);
    return binding ? { binding: clone(binding) } : null;
  }

  async save(context: RepositoryContext, binding: ProjectRepositoryBinding): Promise<Result<void>> {
    this.bindings.set(
      `${tenantKey(context)}:${binding.toState().repositoryIdentity.value}`,
      clone(binding),
    );
    return ok(undefined);
  }
}

export interface RepositoryBindingReadModel {
  readonly bindingId: string;
  readonly repositoryIdentity: string;
  readonly projectId: string;
  readonly status: "active" | "unbound";
  readonly createdAt: string;
  readonly unboundAt?: string;
}

function readModel(binding: ProjectRepositoryBinding): RepositoryBindingReadModel {
  const state = binding.toState();
  return {
    bindingId: state.id.value,
    repositoryIdentity: state.repositoryIdentity.value,
    projectId: state.projectId.value,
    status: state.status,
    createdAt: state.createdAt.value,
    ...(state.unboundAt ? { unboundAt: state.unboundAt.value } : {}),
  };
}

export class RepositoryBindingService {
  constructor(
    private readonly dependencies: {
      repository: RepositoryBindingRepository;
      projects: ProjectRepository;
      clock: Clock;
      idGenerator: IdGenerator;
    },
  ) {}

  async bind(
    context: ExecutionContext,
    input: { repositoryIdentity: string; projectId: string },
  ): Promise<Result<RepositoryBindingReadModel>> {
    const identity = RepositoryIdentity.create(input.repositoryIdentity);
    if (identity.isErr()) return err(identity.error);
    const projectId = ProjectId.create(input.projectId);
    if (projectId.isErr()) return err(projectId.error);
    const repositoryContext = toRepositoryContext(context);
    const project = await this.dependencies.projects.findOne(
      repositoryContext,
      ProjectByIdSpec.create(projectId.value),
    );
    if (!project) return err(domainError.notFound("project", projectId.value.value));
    const existing = await this.dependencies.repository.findByIdentity(
      repositoryContext,
      identity.value.value,
    );
    if (
      existing?.binding.toState().status === "active" &&
      existing.binding.toState().projectId.value !== projectId.value.value
    ) {
      return err(
        domainError.conflict("Repository is already bound to another Project", {
          code: "repository_binding_project_conflict",
          repositoryIdentity: identity.value.value,
          projectId: existing.binding.toState().projectId.value,
        }),
      );
    }
    if (existing?.binding.toState().status === "active") {
      return ok(readModel(existing.binding));
    }
    const id = ProjectRepositoryBindingId.create(this.dependencies.idGenerator.next("rbd"));
    if (id.isErr()) return err(id.error);
    const createdAt = CreatedAt.create(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const binding = ProjectRepositoryBinding.bind({
      id: id.value,
      repositoryIdentity: identity.value,
      projectId: projectId.value,
      createdAt: createdAt.value,
    });
    if (binding.isErr()) return err(binding.error);
    const saved = await this.dependencies.repository.save(repositoryContext, binding.value);
    if (saved.isErr()) return err(saved.error);
    return ok(readModel(binding.value));
  }

  async show(
    context: ExecutionContext,
    input: { repositoryIdentity: string },
  ): Promise<Result<RepositoryBindingReadModel>> {
    const identity = RepositoryIdentity.create(input.repositoryIdentity);
    if (identity.isErr()) return err(identity.error);
    const found = await this.dependencies.repository.findByIdentity(
      toRepositoryContext(context),
      identity.value.value,
    );
    if (!found) {
      return err(domainError.notFound("RepositoryBinding", identity.value.value));
    }
    return ok(readModel(found.binding));
  }

  async unbind(
    context: ExecutionContext,
    input: { repositoryIdentity: string },
  ): Promise<Result<RepositoryBindingReadModel>> {
    const identity = RepositoryIdentity.create(input.repositoryIdentity);
    if (identity.isErr()) return err(identity.error);
    const repositoryContext = toRepositoryContext(context);
    const found = await this.dependencies.repository.findByIdentity(
      repositoryContext,
      identity.value.value,
    );
    if (!found) {
      return err(domainError.notFound("RepositoryBinding", identity.value.value));
    }
    const at = UpdatedAt.create(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const unbound = found.binding.unbind({ at: at.value });
    if (unbound.isErr()) return err(unbound.error);
    if (unbound.value.changed) {
      const saved = await this.dependencies.repository.save(repositoryContext, found.binding);
      if (saved.isErr()) return err(saved.error);
    }
    return ok(readModel(found.binding));
  }
}
