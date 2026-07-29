import {
  AgentProfile,
  type AgentProfileSnapshot,
  CreatedAt,
  domainError,
  err,
  ok,
  ProjectAutomationRule,
  type ProjectAutomationRuleSnapshot,
  RepositoryBinding,
  type RepositoryBindingSnapshot,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type Clock, type IdGenerator } from "./ports";

export interface GitHubAgentConfigurationRepository {
  saveRepositoryBinding(
    context: RepositoryContext,
    value: RepositoryBindingSnapshot,
  ): Promise<Result<void>>;
  findRepositoryBinding(
    context: RepositoryContext,
    id: string,
  ): Promise<RepositoryBindingSnapshot | undefined>;
  listRepositoryBindings(
    context: RepositoryContext,
    projectId?: string,
  ): Promise<RepositoryBindingSnapshot[]>;
  saveAutomationRule(
    context: RepositoryContext,
    value: ProjectAutomationRuleSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>>;
  findAutomationRule(
    context: RepositoryContext,
    id: string,
  ): Promise<ProjectAutomationRuleSnapshot | undefined>;
  listAutomationRules(
    context: RepositoryContext,
    projectId?: string,
  ): Promise<ProjectAutomationRuleSnapshot[]>;
  saveAgentProfile(
    context: RepositoryContext,
    value: AgentProfileSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>>;
  findAgentProfile(
    context: RepositoryContext,
    id: string,
  ): Promise<AgentProfileSnapshot | undefined>;
  listAgentProfiles(context: RepositoryContext): Promise<AgentProfileSnapshot[]>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryGitHubAgentConfigurationRepository
  implements GitHubAgentConfigurationRepository
{
  private readonly bindings = new Map<string, RepositoryBindingSnapshot>();
  private readonly rules = new Map<string, ProjectAutomationRuleSnapshot>();
  private readonly profiles = new Map<string, AgentProfileSnapshot>();

  private key(context: RepositoryContext, id: string): string {
    return `${tenantKey(context)}:${id}`;
  }

  async saveRepositoryBinding(
    context: RepositoryContext,
    value: RepositoryBindingSnapshot,
  ): Promise<Result<void>> {
    const duplicate = [...this.bindings.entries()].find(
      ([key, candidate]) =>
        key.startsWith(`${tenantKey(context)}:`) &&
        candidate.provider === value.provider &&
        candidate.providerRepositoryId === value.providerRepositoryId &&
        candidate.id !== value.id,
    );
    if (duplicate) {
      return err(domainError.conflict("GitHub repository is already bound in this tenant"));
    }
    this.bindings.set(this.key(context, value.id), clone(value));
    return ok(undefined);
  }

  async findRepositoryBinding(context: RepositoryContext, id: string) {
    const value = this.bindings.get(this.key(context, id));
    return value ? clone(value) : undefined;
  }

  async listRepositoryBindings(context: RepositoryContext, projectId?: string) {
    return [...this.bindings.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${tenantKey(context)}:`) && (!projectId || value.projectId === projectId),
      )
      .map(([, value]) => clone(value));
  }

  async saveAutomationRule(
    context: RepositoryContext,
    value: ProjectAutomationRuleSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const key = this.key(context, value.id);
    const current = this.rules.get(key);
    if (
      (expectedRevision === null && current) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    ) {
      return err(domainError.conflict("Automation Rule changed concurrently"));
    }
    this.rules.set(key, clone(value));
    return ok(undefined);
  }

  async findAutomationRule(context: RepositoryContext, id: string) {
    const value = this.rules.get(this.key(context, id));
    return value ? clone(value) : undefined;
  }

  async listAutomationRules(context: RepositoryContext, projectId?: string) {
    return [...this.rules.entries()]
      .filter(
        ([key, value]) =>
          key.startsWith(`${tenantKey(context)}:`) && (!projectId || value.projectId === projectId),
      )
      .map(([, value]) => clone(value));
  }

  async saveAgentProfile(
    context: RepositoryContext,
    value: AgentProfileSnapshot,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const key = this.key(context, value.id);
    const current = this.profiles.get(key);
    if (
      (expectedRevision === null && current) ||
      (expectedRevision !== null && current?.revision !== expectedRevision)
    ) {
      return err(domainError.conflict("Agent Profile changed concurrently"));
    }
    this.profiles.set(key, clone(value));
    return ok(undefined);
  }

  async findAgentProfile(context: RepositoryContext, id: string) {
    const value = this.profiles.get(this.key(context, id));
    return value ? clone(value) : undefined;
  }

  async listAgentProfiles(context: RepositoryContext) {
    return [...this.profiles.entries()]
      .filter(([key]) => key.startsWith(`${tenantKey(context)}:`))
      .map(([, value]) => clone(value));
  }
}

export interface GitHubAgentConfigurationServiceDependencies {
  repository: GitHubAgentConfigurationRepository;
  clock: Clock;
  idGenerator: IdGenerator;
}

export class GitHubAgentConfigurationService {
  constructor(private readonly dependencies: GitHubAgentConfigurationServiceDependencies) {}

  async bindRepository(
    context: ExecutionContext,
    input: Omit<
      RepositoryBindingSnapshot,
      "id" | "tenantId" | "provider" | "status" | "createdAt" | "updatedAt" | "revokedAt"
    >,
  ): Promise<Result<RepositoryBindingSnapshot>> {
    const createdAt = CreatedAt.create(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const binding = RepositoryBinding.create({
      id: this.dependencies.idGenerator.next("grb"),
      tenantId: tenantKey(toRepositoryContext(context)),
      projectId: input.projectId,
      installationConnectionId: input.installationConnectionId,
      providerRepositoryId: input.providerRepositoryId,
      repositoryFullNameSnapshot: input.repositoryFullNameSnapshot,
      ...(input.defaultBranchSnapshot
        ? { defaultBranchSnapshot: input.defaultBranchSnapshot }
        : {}),
      ...(typeof input.privateSnapshot === "boolean"
        ? { privateSnapshot: input.privateSnapshot }
        : {}),
      createdAt: createdAt.value,
    });
    if (binding.isErr()) return err(binding.error);
    const snapshot = binding.value.toSnapshot();
    const saved = await this.dependencies.repository.saveRepositoryBinding(
      toRepositoryContext(context),
      snapshot,
    );
    return saved.isErr() ? err(saved.error) : ok(snapshot);
  }

  async listRepositoryBindings(context: ExecutionContext, projectId?: string) {
    return ok(
      await this.dependencies.repository.listRepositoryBindings(
        toRepositoryContext(context),
        projectId,
      ),
    );
  }

  async createAutomationRule(
    context: ExecutionContext,
    input: Omit<
      ProjectAutomationRuleSnapshot,
      "id" | "tenantId" | "status" | "revision" | "createdAt" | "updatedAt"
    >,
  ): Promise<Result<ProjectAutomationRuleSnapshot>> {
    const createdAt = CreatedAt.create(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const rule = ProjectAutomationRule.create({
      ...input,
      id: this.dependencies.idGenerator.next("gar"),
      tenantId: tenantKey(toRepositoryContext(context)),
      createdAt: createdAt.value,
    });
    if (rule.isErr()) return err(rule.error);
    const snapshot = rule.value.toSnapshot();
    const saved = await this.dependencies.repository.saveAutomationRule(
      toRepositoryContext(context),
      snapshot,
      null,
    );
    return saved.isErr() ? err(saved.error) : ok(snapshot);
  }

  async listAutomationRules(context: ExecutionContext, projectId?: string) {
    return ok(
      await this.dependencies.repository.listAutomationRules(
        toRepositoryContext(context),
        projectId,
      ),
    );
  }

  async disableAutomationRule(
    context: ExecutionContext,
    id: string,
  ): Promise<Result<ProjectAutomationRuleSnapshot>> {
    const repositoryContext = toRepositoryContext(context);
    const snapshot = await this.dependencies.repository.findAutomationRule(repositoryContext, id);
    if (!snapshot) return err(domainError.notFound("ProjectAutomationRule", id));
    const at = UpdatedAt.create(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const rule = ProjectAutomationRule.rehydrate(snapshot);
    const disabled = rule.disable(at.value);
    if (disabled.isErr()) return err(disabled.error);
    const next = rule.toSnapshot();
    const saved = await this.dependencies.repository.saveAutomationRule(
      repositoryContext,
      next,
      snapshot.revision,
    );
    return saved.isErr() ? err(saved.error) : ok(next);
  }

  async createAgentProfile(
    context: ExecutionContext,
    input: Omit<
      AgentProfileSnapshot,
      "id" | "tenantId" | "status" | "revision" | "createdAt" | "updatedAt"
    >,
  ): Promise<Result<AgentProfileSnapshot>> {
    const createdAt = CreatedAt.create(this.dependencies.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const profile = AgentProfile.create({
      ...input,
      id: this.dependencies.idGenerator.next("agp"),
      tenantId: tenantKey(toRepositoryContext(context)),
      createdAt: createdAt.value,
    });
    if (profile.isErr()) return err(profile.error);
    const snapshot = profile.value.toSnapshot();
    const saved = await this.dependencies.repository.saveAgentProfile(
      toRepositoryContext(context),
      snapshot,
      null,
    );
    return saved.isErr() ? err(saved.error) : ok(snapshot);
  }

  async listAgentProfiles(context: ExecutionContext) {
    return ok(await this.dependencies.repository.listAgentProfiles(toRepositoryContext(context)));
  }

  async disableAgentProfile(
    context: ExecutionContext,
    id: string,
  ): Promise<Result<AgentProfileSnapshot>> {
    const repositoryContext = toRepositoryContext(context);
    const snapshot = await this.dependencies.repository.findAgentProfile(repositoryContext, id);
    if (!snapshot) return err(domainError.notFound("AgentProfile", id));
    const at = UpdatedAt.create(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const profile = AgentProfile.rehydrate(snapshot);
    const disabled = profile.disable(at.value);
    if (disabled.isErr()) return err(disabled.error);
    const next = profile.toSnapshot();
    const saved = await this.dependencies.repository.saveAgentProfile(
      repositoryContext,
      next,
      snapshot.revision,
    );
    return saved.isErr() ? err(saved.error) : ok(next);
  }
}
