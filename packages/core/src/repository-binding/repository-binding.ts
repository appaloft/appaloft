import { AggregateRoot } from "../shared/entity";
import { type ProjectId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { type RepositoryBindingId, type RepositoryIdentity } from "./values";

export interface RepositoryBindingState {
  id: RepositoryBindingId;
  repositoryIdentity: RepositoryIdentity;
  projectId: ProjectId;
  status: "active" | "unbound";
  createdAt: CreatedAt;
  unboundAt?: UpdatedAt;
}

export class RepositoryBinding extends AggregateRoot<RepositoryBindingState> {
  private constructor(state: RepositoryBindingState) {
    super(state);
  }

  static bind(
    input: Omit<RepositoryBindingState, "status" | "unboundAt">,
  ): Result<RepositoryBinding> {
    const binding = new RepositoryBinding({ ...input, status: "active" });
    binding.recordDomainEvent("repository-binding.bound", input.createdAt, {
      repositoryIdentity: input.repositoryIdentity.value,
      projectId: input.projectId.value,
    });
    return ok(binding);
  }

  static rehydrate(state: RepositoryBindingState): RepositoryBinding {
    return new RepositoryBinding({ ...state });
  }

  unbind(input: { at: UpdatedAt }): Result<{ changed: boolean }> {
    if (this.state.status === "unbound") return ok({ changed: false });
    this.state.status = "unbound";
    this.state.unboundAt = input.at;
    this.recordDomainEvent("repository-binding.unbound", input.at, {
      repositoryIdentity: this.state.repositoryIdentity.value,
      projectId: this.state.projectId.value,
    });
    return ok({ changed: true });
  }

  toState(): RepositoryBindingState {
    return { ...this.state };
  }
}
