import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { CreatedAt, UpdatedAt } from "../shared/temporal";

type GitHubAutomationEvent =
  | "issue_comment"
  | "pull_request_review_comment"
  | "issues"
  | "pull_request";
type GitHubAutomationAction = "created" | "labeled" | "ready_for_review" | "synchronize" | "closed";

const safeReference = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,511}$/u;
const secretMaterial =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{12,})|\b(?:api[_-]?key|password|private[_-]?key|secret|token)\s*[:=])/iu;

function requiredText(value: string, label: string, max = 512): Result<string> {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    return err(
      domainError.validation(`${label} is required and must be at most ${max} characters`),
    );
  }
  if (secretMaterial.test(normalized)) {
    return err(domainError.validation(`${label} cannot contain secret material`));
  }
  return ok(normalized);
}

function reference(value: string, label: string): Result<string> {
  return requiredText(value, label).andThen((normalized) =>
    safeReference.test(normalized)
      ? ok(normalized)
      : err(domainError.validation(`${label} must be a safe reference`)),
  );
}

function numericProviderId(value: string, label: string): Result<string> {
  const normalized = value.trim();
  return /^[1-9]\d*$/u.test(normalized)
    ? ok(normalized)
    : err(domainError.validation(`${label} must be a positive numeric provider id`));
}

function uniqueReferences(values: readonly string[], label: string): Result<string[]> {
  const normalized: string[] = [];
  for (const value of values) {
    const parsed = reference(value, label);
    if (parsed.isErr()) return err(parsed.error);
    normalized.push(parsed.value);
  }
  return ok([...new Set(normalized)].sort());
}

class GitHubAutomationIdentifier extends IdentifierValue {
  protected constructor(value: string) {
    super(value);
  }
}

export class RepositoryBindingId extends GitHubAutomationIdentifier {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RepositoryBindingId> {
    return reference(value, "Repository Binding ID").map(
      (normalized) => new RepositoryBindingId(normalized),
    );
  }

  static rehydrate(value: string): RepositoryBindingId {
    return new RepositoryBindingId(value.trim());
  }
}

export type RepositoryBindingStatus = "active" | "revoked";

export interface RepositoryBindingSnapshot {
  id: string;
  tenantId: string;
  projectId: string;
  provider: "github";
  installationConnectionId: string;
  providerRepositoryId: string;
  repositoryFullNameSnapshot: string;
  defaultBranchSnapshot?: string;
  privateSnapshot?: boolean;
  status: RepositoryBindingStatus;
  createdAt: string;
  updatedAt?: string;
  revokedAt?: string;
}

interface RepositoryBindingState {
  id: RepositoryBindingId;
  tenantId: string;
  projectId: string;
  provider: "github";
  installationConnectionId: string;
  providerRepositoryId: string;
  repositoryFullNameSnapshot: string;
  defaultBranchSnapshot?: string;
  privateSnapshot?: boolean;
  status: RepositoryBindingStatus;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  revokedAt?: UpdatedAt;
}

export class RepositoryBinding extends AggregateRoot<RepositoryBindingState, RepositoryBindingId> {
  private constructor(state: RepositoryBindingState) {
    super(state);
  }

  static create(input: {
    id: string;
    tenantId: string;
    projectId: string;
    installationConnectionId: string;
    providerRepositoryId: string;
    repositoryFullNameSnapshot: string;
    defaultBranchSnapshot?: string;
    privateSnapshot?: boolean;
    createdAt: CreatedAt;
  }): Result<RepositoryBinding> {
    const id = RepositoryBindingId.create(input.id);
    if (id.isErr()) return err(id.error);
    const tenantId = reference(input.tenantId, "Repository Binding tenant ID");
    if (tenantId.isErr()) return err(tenantId.error);
    const projectId = reference(input.projectId, "Repository Binding Project ID");
    if (projectId.isErr()) return err(projectId.error);
    const connectionId = reference(
      input.installationConnectionId,
      "Repository Binding installation Connection ID",
    );
    if (connectionId.isErr()) return err(connectionId.error);
    const repositoryId = numericProviderId(
      input.providerRepositoryId,
      "Repository Binding provider repository ID",
    );
    if (repositoryId.isErr()) return err(repositoryId.error);
    const fullName = requiredText(
      input.repositoryFullNameSnapshot,
      "Repository Binding full name snapshot",
    );
    if (fullName.isErr() || !/^[^/\s]+\/[^/\s]+$/u.test(fullName.value)) {
      return err(
        fullName.isErr()
          ? fullName.error
          : domainError.validation("Repository Binding full name must be owner/repository"),
      );
    }
    const defaultBranch = input.defaultBranchSnapshot
      ? requiredText(input.defaultBranchSnapshot, "Repository Binding default branch")
      : ok(undefined);
    if (defaultBranch.isErr()) return err(defaultBranch.error);

    const binding = new RepositoryBinding({
      id: id.value,
      tenantId: tenantId.value,
      projectId: projectId.value,
      provider: "github",
      installationConnectionId: connectionId.value,
      providerRepositoryId: repositoryId.value,
      repositoryFullNameSnapshot: fullName.value,
      ...(defaultBranch.value ? { defaultBranchSnapshot: defaultBranch.value } : {}),
      ...(typeof input.privateSnapshot === "boolean"
        ? { privateSnapshot: input.privateSnapshot }
        : {}),
      status: "active",
      createdAt: input.createdAt,
    });
    binding.recordDomainEvent("repository_binding.created", input.createdAt, {
      provider: "github",
      projectId: projectId.value,
      providerRepositoryId: repositoryId.value,
    });
    return ok(binding);
  }

  static rehydrate(snapshot: RepositoryBindingSnapshot): RepositoryBinding {
    return new RepositoryBinding({
      id: RepositoryBindingId.rehydrate(snapshot.id),
      tenantId: snapshot.tenantId,
      projectId: snapshot.projectId,
      provider: "github",
      installationConnectionId: snapshot.installationConnectionId,
      providerRepositoryId: snapshot.providerRepositoryId,
      repositoryFullNameSnapshot: snapshot.repositoryFullNameSnapshot,
      ...(snapshot.defaultBranchSnapshot
        ? { defaultBranchSnapshot: snapshot.defaultBranchSnapshot }
        : {}),
      ...(typeof snapshot.privateSnapshot === "boolean"
        ? { privateSnapshot: snapshot.privateSnapshot }
        : {}),
      status: snapshot.status,
      createdAt: createdAt(snapshot.createdAt),
      ...(snapshot.updatedAt ? { updatedAt: updatedAt(snapshot.updatedAt) } : {}),
      ...(snapshot.revokedAt ? { revokedAt: updatedAt(snapshot.revokedAt) } : {}),
    });
  }

  matches(tenantId: string, providerRepositoryId: string): boolean {
    return (
      this.state.status === "active" &&
      this.state.tenantId === tenantId &&
      this.state.providerRepositoryId === providerRepositoryId
    );
  }

  revoke(at: UpdatedAt): Result<void> {
    if (this.state.status === "revoked") return ok(undefined);
    this.state.status = "revoked";
    this.state.updatedAt = at;
    this.state.revokedAt = at;
    this.recordDomainEvent("repository_binding.revoked", at, {
      projectId: this.state.projectId,
      providerRepositoryId: this.state.providerRepositoryId,
    });
    return ok(undefined);
  }

  toSnapshot(): RepositoryBindingSnapshot {
    return {
      id: this.id.value,
      tenantId: this.state.tenantId,
      projectId: this.state.projectId,
      provider: "github",
      installationConnectionId: this.state.installationConnectionId,
      providerRepositoryId: this.state.providerRepositoryId,
      repositoryFullNameSnapshot: this.state.repositoryFullNameSnapshot,
      ...(this.state.defaultBranchSnapshot
        ? { defaultBranchSnapshot: this.state.defaultBranchSnapshot }
        : {}),
      ...(typeof this.state.privateSnapshot === "boolean"
        ? { privateSnapshot: this.state.privateSnapshot }
        : {}),
      status: this.state.status,
      createdAt: this.state.createdAt.value,
      ...(this.state.updatedAt ? { updatedAt: this.state.updatedAt.value } : {}),
      ...(this.state.revokedAt ? { revokedAt: this.state.revokedAt.value } : {}),
    };
  }
}

export class ProjectAutomationRuleId extends GitHubAutomationIdentifier {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ProjectAutomationRuleId> {
    return reference(value, "Project Automation Rule ID").map(
      (normalized) => new ProjectAutomationRuleId(normalized),
    );
  }

  static rehydrate(value: string): ProjectAutomationRuleId {
    return new ProjectAutomationRuleId(value.trim());
  }
}

export interface ProjectAutomationRuleTrigger {
  event: GitHubAutomationEvent;
  action: GitHubAutomationAction;
  label?: string;
}

export type ProjectAutomationTaskAction = "fix" | "review" | "preview";
export type ProjectAutomationActorPolicy = "manual-linked-member" | "project-automation-identity";
export type ProjectAutomationMode = "review-only" | "write";
export type ProjectAutomationPreviewPolicy = "disabled" | "private";
export type ProjectAutomationPullRequestDeliveryPolicy =
  | "none"
  | "manual-approval"
  | "create-or-update"
  | "review-only";

export interface ProjectAutomationRuleSnapshot {
  id: string;
  tenantId: string;
  projectId: string;
  repositoryBindingId: string;
  name: string;
  trigger: ProjectAutomationRuleTrigger;
  taskAction: ProjectAutomationTaskAction;
  actorPolicy: ProjectAutomationActorPolicy;
  automationIdentityRef?: string;
  agentProfileId: string;
  workspaceProfileInstallationId: string;
  sandboxTemplateId: string;
  serverPoolId: string;
  mode: ProjectAutomationMode;
  maximumRuntimeSeconds: number;
  maximumRetries: number;
  previewPolicy: ProjectAutomationPreviewPolicy;
  pullRequestDeliveryPolicy: ProjectAutomationPullRequestDeliveryPolicy;
  rerunReviewOnSynchronize: boolean;
  status: "enabled" | "disabled";
  revision: number;
  createdAt: string;
  updatedAt?: string;
}

interface ProjectAutomationRuleState
  extends Omit<ProjectAutomationRuleSnapshot, "id" | "createdAt" | "updatedAt"> {
  id: ProjectAutomationRuleId;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
}

export interface ProjectAutomationRuleMatch {
  repositoryBindingId: string;
  event: GitHubAutomationEvent;
  action: GitHubAutomationAction;
  label?: string;
}

export class ProjectAutomationRule extends AggregateRoot<
  ProjectAutomationRuleState,
  ProjectAutomationRuleId
> {
  private constructor(state: ProjectAutomationRuleState) {
    super(state);
  }

  static create(
    input: Omit<
      ProjectAutomationRuleSnapshot,
      "status" | "revision" | "createdAt" | "updatedAt" | "rerunReviewOnSynchronize"
    > & {
      rerunReviewOnSynchronize?: boolean;
      createdAt: CreatedAt;
    },
  ): Result<ProjectAutomationRule> {
    const id = ProjectAutomationRuleId.create(input.id);
    if (id.isErr()) return err(id.error);
    const refs = [
      [input.tenantId, "Automation Rule tenant ID"],
      [input.projectId, "Automation Rule Project ID"],
      [input.repositoryBindingId, "Automation Rule Repository Binding ID"],
      [input.agentProfileId, "Automation Rule Agent Profile ID"],
      [input.workspaceProfileInstallationId, "Automation Rule Workspace Profile installation ID"],
      [input.sandboxTemplateId, "Automation Rule Sandbox Template ID"],
      [input.serverPoolId, "Automation Rule Server pool ID"],
    ] as const;
    for (const [value, label] of refs) {
      const parsed = reference(value, label);
      if (parsed.isErr()) return err(parsed.error);
    }
    const name = requiredText(input.name, "Automation Rule name", 160);
    if (name.isErr()) return err(name.error);
    if (!validTrigger(input.trigger)) {
      return err(domainError.validation("Automation Rule trigger event/action/label is invalid"));
    }
    if (
      !Number.isInteger(input.maximumRuntimeSeconds) ||
      input.maximumRuntimeSeconds < 60 ||
      input.maximumRuntimeSeconds > 86_400 ||
      !Number.isInteger(input.maximumRetries) ||
      input.maximumRetries < 0 ||
      input.maximumRetries > 10
    ) {
      return err(domainError.validation("Automation Rule execution limits are invalid"));
    }
    if (input.actorPolicy === "project-automation-identity" && !input.automationIdentityRef) {
      return err(
        domainError.validation("Automated rules require an automation identity reference"),
      );
    }
    if (input.automationIdentityRef) {
      const automationIdentity = reference(
        input.automationIdentityRef,
        "Automation Rule identity reference",
      );
      if (automationIdentity.isErr()) return err(automationIdentity.error);
    }
    if (
      input.taskAction === "review" &&
      (input.mode !== "review-only" ||
        input.previewPolicy !== "disabled" ||
        input.pullRequestDeliveryPolicy !== "review-only")
    ) {
      return err(
        domainError.invariant(
          "Review automation must be review-only with Preview disabled and review-only delivery",
        ),
      );
    }
    if (input.taskAction !== "review" && input.mode === "review-only") {
      return err(domainError.invariant("Fix and Preview automation require write mode"));
    }
    if (input.rerunReviewOnSynchronize && input.taskAction !== "review") {
      return err(
        domainError.invariant("Synchronize reruns are supported only for Review automation"),
      );
    }

    const rule = new ProjectAutomationRule({
      id: id.value,
      tenantId: input.tenantId.trim(),
      projectId: input.projectId.trim(),
      repositoryBindingId: input.repositoryBindingId.trim(),
      name: name.value,
      trigger: { ...input.trigger },
      taskAction: input.taskAction,
      actorPolicy: input.actorPolicy,
      ...(input.automationIdentityRef
        ? { automationIdentityRef: input.automationIdentityRef.trim() }
        : {}),
      agentProfileId: input.agentProfileId.trim(),
      workspaceProfileInstallationId: input.workspaceProfileInstallationId.trim(),
      sandboxTemplateId: input.sandboxTemplateId.trim(),
      serverPoolId: input.serverPoolId.trim(),
      mode: input.mode,
      maximumRuntimeSeconds: input.maximumRuntimeSeconds,
      maximumRetries: input.maximumRetries,
      previewPolicy: input.previewPolicy,
      pullRequestDeliveryPolicy: input.pullRequestDeliveryPolicy,
      rerunReviewOnSynchronize: input.rerunReviewOnSynchronize ?? false,
      status: "enabled",
      revision: 1,
      createdAt: input.createdAt,
    });
    rule.recordDomainEvent("project_automation_rule.created", input.createdAt, {
      projectId: input.projectId,
      repositoryBindingId: input.repositoryBindingId,
      taskAction: input.taskAction,
    });
    return ok(rule);
  }

  static rehydrate(snapshot: ProjectAutomationRuleSnapshot): ProjectAutomationRule {
    const { id, createdAt: createdAtValue, updatedAt: updatedAtValue, ...state } = snapshot;
    return new ProjectAutomationRule({
      ...state,
      id: ProjectAutomationRuleId.rehydrate(id),
      trigger: { ...state.trigger },
      createdAt: createdAt(createdAtValue),
      ...(updatedAtValue ? { updatedAt: updatedAt(updatedAtValue) } : {}),
    });
  }

  matches(input: ProjectAutomationRuleMatch): boolean {
    if (
      this.state.status !== "enabled" ||
      this.state.repositoryBindingId !== input.repositoryBindingId
    ) {
      return false;
    }
    const triggerMatches =
      this.state.trigger.event === input.event &&
      this.state.trigger.action === input.action &&
      (this.state.trigger.action !== "labeled" ||
        this.state.trigger.label?.toLowerCase() === input.label?.toLowerCase());
    if (triggerMatches) return true;
    return (
      this.state.rerunReviewOnSynchronize &&
      this.state.taskAction === "review" &&
      input.event === "pull_request" &&
      input.action === "synchronize"
    );
  }

  disable(at: UpdatedAt): Result<void> {
    if (this.state.status === "disabled") return ok(undefined);
    this.state.status = "disabled";
    this.state.revision += 1;
    this.state.updatedAt = at;
    this.recordDomainEvent("project_automation_rule.disabled", at, {
      projectId: this.state.projectId,
      revision: this.state.revision,
    });
    return ok(undefined);
  }

  toSnapshot(): ProjectAutomationRuleSnapshot {
    return {
      id: this.id.value,
      tenantId: this.state.tenantId,
      projectId: this.state.projectId,
      repositoryBindingId: this.state.repositoryBindingId,
      name: this.state.name,
      trigger: { ...this.state.trigger },
      taskAction: this.state.taskAction,
      actorPolicy: this.state.actorPolicy,
      ...(this.state.automationIdentityRef
        ? { automationIdentityRef: this.state.automationIdentityRef }
        : {}),
      agentProfileId: this.state.agentProfileId,
      workspaceProfileInstallationId: this.state.workspaceProfileInstallationId,
      sandboxTemplateId: this.state.sandboxTemplateId,
      serverPoolId: this.state.serverPoolId,
      mode: this.state.mode,
      maximumRuntimeSeconds: this.state.maximumRuntimeSeconds,
      maximumRetries: this.state.maximumRetries,
      previewPolicy: this.state.previewPolicy,
      pullRequestDeliveryPolicy: this.state.pullRequestDeliveryPolicy,
      rerunReviewOnSynchronize: this.state.rerunReviewOnSynchronize,
      status: this.state.status,
      revision: this.state.revision,
      createdAt: this.state.createdAt.value,
      ...(this.state.updatedAt ? { updatedAt: this.state.updatedAt.value } : {}),
    };
  }
}

function validTrigger(trigger: ProjectAutomationRuleTrigger): boolean {
  if (
    !(
      (trigger.event === "issue_comment" && trigger.action === "created") ||
      (trigger.event === "pull_request_review_comment" && trigger.action === "created") ||
      (trigger.event === "issues" && trigger.action === "labeled") ||
      (trigger.event === "pull_request" &&
        (trigger.action === "labeled" ||
          trigger.action === "ready_for_review" ||
          trigger.action === "synchronize" ||
          trigger.action === "closed"))
    )
  ) {
    return false;
  }
  return trigger.action === "labeled"
    ? Boolean(trigger.label?.trim() && trigger.label.length <= 160)
    : !trigger.label;
}

export function githubReviewExecutionKey(input: {
  providerRepositoryId: string;
  pullRequestNumber: number;
  headSha: string;
  ruleId: string;
}): string {
  return [
    "github-review",
    input.providerRepositoryId.trim(),
    String(input.pullRequestNumber),
    input.headSha.trim().toLowerCase(),
    input.ruleId.trim(),
  ].join(":");
}

export class AgentProfileId extends GitHubAutomationIdentifier {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentProfileId> {
    return reference(value, "Agent Profile ID").map((normalized) => new AgentProfileId(normalized));
  }

  static rehydrate(value: string): AgentProfileId {
    return new AgentProfileId(value.trim());
  }
}

export type AgentAdapterKind = "codex" | "opencode" | "pi";

export interface AgentProfileSnapshot {
  id: string;
  tenantId: string;
  name: string;
  adapter: AgentAdapterKind;
  adapterInstallationId: string;
  adapterVersion: string;
  capabilities: string[];
  defaultModel: string;
  credentialConnectionId: string;
  workspaceProfileInstallationId: string;
  sandboxTemplateId: string;
  maximumRuntimeSeconds: number;
  maximumRetries: number;
  maximumOutputBytes: number;
  status: "enabled" | "disabled";
  revision: number;
  createdAt: string;
  updatedAt?: string;
}

interface AgentProfileState extends Omit<AgentProfileSnapshot, "id" | "createdAt" | "updatedAt"> {
  id: AgentProfileId;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
}

export class AgentProfile extends AggregateRoot<AgentProfileState, AgentProfileId> {
  private constructor(state: AgentProfileState) {
    super(state);
  }

  static create(
    input: Omit<AgentProfileSnapshot, "status" | "revision" | "createdAt" | "updatedAt"> & {
      createdAt: CreatedAt;
    },
  ): Result<AgentProfile> {
    const id = AgentProfileId.create(input.id);
    if (id.isErr()) return err(id.error);
    const refs = [
      [input.tenantId, "Agent Profile tenant ID"],
      [input.adapterInstallationId, "Agent Profile Adapter installation ID"],
      [input.credentialConnectionId, "Agent Profile credential Connection ID"],
      [input.workspaceProfileInstallationId, "Agent Profile Workspace Profile installation ID"],
      [input.sandboxTemplateId, "Agent Profile Sandbox Template ID"],
    ] as const;
    for (const [value, label] of refs) {
      const parsed = reference(value, label);
      if (parsed.isErr()) return err(parsed.error);
    }
    const name = requiredText(input.name, "Agent Profile name", 160);
    if (name.isErr()) return err(name.error);
    const version = requiredText(input.adapterVersion, "Agent Profile Adapter version", 160);
    if (version.isErr()) return err(version.error);
    const model = requiredText(input.defaultModel, "Agent Profile default model", 256);
    if (model.isErr()) return err(model.error);
    const capabilities = uniqueReferences(input.capabilities, "Agent Profile capability");
    if (capabilities.isErr() || capabilities.value.length === 0) {
      return err(
        capabilities.isErr()
          ? capabilities.error
          : domainError.validation("Agent Profile requires at least one capability"),
      );
    }
    if (
      !Number.isInteger(input.maximumRuntimeSeconds) ||
      input.maximumRuntimeSeconds < 60 ||
      input.maximumRuntimeSeconds > 86_400 ||
      !Number.isInteger(input.maximumRetries) ||
      input.maximumRetries < 0 ||
      input.maximumRetries > 10 ||
      !Number.isInteger(input.maximumOutputBytes) ||
      input.maximumOutputBytes < 1_024 ||
      input.maximumOutputBytes > 1_048_576
    ) {
      return err(domainError.validation("Agent Profile execution limits are invalid"));
    }

    const profile = new AgentProfile({
      id: id.value,
      tenantId: input.tenantId.trim(),
      name: name.value,
      adapter: input.adapter,
      adapterInstallationId: input.adapterInstallationId.trim(),
      adapterVersion: version.value,
      capabilities: capabilities.value,
      defaultModel: model.value,
      credentialConnectionId: input.credentialConnectionId.trim(),
      workspaceProfileInstallationId: input.workspaceProfileInstallationId.trim(),
      sandboxTemplateId: input.sandboxTemplateId.trim(),
      maximumRuntimeSeconds: input.maximumRuntimeSeconds,
      maximumRetries: input.maximumRetries,
      maximumOutputBytes: input.maximumOutputBytes,
      status: "enabled",
      revision: 1,
      createdAt: input.createdAt,
    });
    profile.recordDomainEvent("agent_profile.created", input.createdAt, {
      adapter: input.adapter,
      adapterInstallationId: input.adapterInstallationId,
    });
    return ok(profile);
  }

  static rehydrate(snapshot: AgentProfileSnapshot): AgentProfile {
    const { id, createdAt: createdAtValue, updatedAt: updatedAtValue, ...state } = snapshot;
    return new AgentProfile({
      ...state,
      id: AgentProfileId.rehydrate(id),
      capabilities: [...state.capabilities],
      createdAt: createdAt(createdAtValue),
      ...(updatedAtValue ? { updatedAt: updatedAt(updatedAtValue) } : {}),
    });
  }

  disable(at: UpdatedAt): Result<void> {
    if (this.state.status === "disabled") return ok(undefined);
    this.state.status = "disabled";
    this.state.revision += 1;
    this.state.updatedAt = at;
    this.recordDomainEvent("agent_profile.disabled", at, {
      adapter: this.state.adapter,
      revision: this.state.revision,
    });
    return ok(undefined);
  }

  toSnapshot(): AgentProfileSnapshot {
    return {
      id: this.id.value,
      tenantId: this.state.tenantId,
      name: this.state.name,
      adapter: this.state.adapter,
      adapterInstallationId: this.state.adapterInstallationId,
      adapterVersion: this.state.adapterVersion,
      capabilities: [...this.state.capabilities],
      defaultModel: this.state.defaultModel,
      credentialConnectionId: this.state.credentialConnectionId,
      workspaceProfileInstallationId: this.state.workspaceProfileInstallationId,
      sandboxTemplateId: this.state.sandboxTemplateId,
      maximumRuntimeSeconds: this.state.maximumRuntimeSeconds,
      maximumRetries: this.state.maximumRetries,
      maximumOutputBytes: this.state.maximumOutputBytes,
      status: this.state.status,
      revision: this.state.revision,
      createdAt: this.state.createdAt.value,
      ...(this.state.updatedAt ? { updatedAt: this.state.updatedAt.value } : {}),
    };
  }
}

export type AgentCredentialAuthMode =
  | "agent-native-account"
  | "agent-native-api-key"
  | "existing-server-config"
  | "appaloft-managed-provider";
export type AgentCredentialConnectionStatus =
  | "pending"
  | "connected"
  | "expired"
  | "failed"
  | "revoked"
  | "unsupported";

export interface AgentCredentialConnectionMetadata {
  connectionId: string;
  owner: { kind: "user" | "organization"; id: string };
  agent: AgentAdapterKind;
  authMode: AgentCredentialAuthMode;
  status: AgentCredentialConnectionStatus;
  encryptedCredentialReference: string;
  expiresAt?: string;
  lastValidatedAt?: string;
  allowedProjectIds: string[];
  allowedProfileIds: string[];
  unattendedUse: "denied" | "personal-owner-opt-in" | "organization-automation";
  existingServerIsolation?: {
    serverPoolId: string;
    homeScope: "owner";
    portable: false;
  };
  redacted: true;
}

export function createAgentCredentialConnectionMetadata(
  input: Omit<AgentCredentialConnectionMetadata, "redacted" | "existingServerIsolation"> & {
    existingServerIsolation?: {
      serverPoolId: string;
      homeScope: "owner" | "global";
      portable: false;
    };
  },
): Result<AgentCredentialConnectionMetadata> {
  const connectionId = reference(input.connectionId, "Agent credential Connection ID");
  if (connectionId.isErr()) return err(connectionId.error);
  const ownerId = reference(input.owner.id, "Agent credential owner ID");
  if (ownerId.isErr()) return err(ownerId.error);
  const encryptedReference = reference(
    input.encryptedCredentialReference,
    "Agent encrypted credential reference",
  );
  if (
    encryptedReference.isErr() ||
    secretMaterial.test(input.encryptedCredentialReference) ||
    /(?:^|\/)root(?:\/|$)/iu.test(input.encryptedCredentialReference)
  ) {
    return err(
      encryptedReference.isErr()
        ? encryptedReference.error
        : domainError.validation(
            "Agent encrypted credential reference must be opaque and owner isolated",
          ),
    );
  }
  const projects = uniqueReferences(input.allowedProjectIds, "Allowed Project ID");
  if (projects.isErr() || projects.value.length === 0) {
    return err(
      projects.isErr()
        ? projects.error
        : domainError.validation("Agent credential requires an allowed Project"),
    );
  }
  const profiles = uniqueReferences(input.allowedProfileIds, "Allowed Agent Profile ID");
  if (profiles.isErr() || profiles.value.length === 0) {
    return err(
      profiles.isErr()
        ? profiles.error
        : domainError.validation("Agent credential requires an allowed Profile"),
    );
  }
  if (input.authMode === "agent-native-account" && input.agent !== "codex") {
    return err(
      domainError.validation("Agent native account mode is supported only by declared adapters"),
    );
  }
  if (input.authMode === "appaloft-managed-provider" && input.status !== "unsupported") {
    return err(domainError.invariant("Appaloft managed provider must remain unsupported in V1"));
  }
  if (input.authMode === "existing-server-config") {
    if (
      input.existingServerIsolation?.homeScope !== "owner" ||
      input.existingServerIsolation?.portable !== false
    ) {
      return err(
        domainError.invariant(
          "Existing server config requires a non-portable owner-scoped HOME and Server pool",
        ),
      );
    }
    const pool = reference(
      input.existingServerIsolation.serverPoolId,
      "Existing server config Server pool ID",
    );
    if (pool.isErr()) return err(pool.error);
  } else if (input.existingServerIsolation) {
    return err(
      domainError.validation(
        "Existing server isolation is valid only for existing-server-config auth mode",
      ),
    );
  }
  if (input.unattendedUse === "organization-automation" && input.owner.kind !== "organization") {
    return err(
      domainError.invariant("Organization automation credentials require organization ownership"),
    );
  }
  if (input.unattendedUse === "personal-owner-opt-in" && input.owner.kind !== "user") {
    return err(domainError.invariant("Personal opt-in credentials require user ownership"));
  }
  for (const date of [input.expiresAt, input.lastValidatedAt]) {
    if (date && Number.isNaN(new Date(date).getTime())) {
      return err(domainError.validation("Agent credential timestamps must be ISO date-times"));
    }
  }

  return ok({
    connectionId: connectionId.value,
    owner: { kind: input.owner.kind, id: ownerId.value },
    agent: input.agent,
    authMode: input.authMode,
    status: input.status,
    encryptedCredentialReference: encryptedReference.value,
    ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt).toISOString() } : {}),
    ...(input.lastValidatedAt
      ? { lastValidatedAt: new Date(input.lastValidatedAt).toISOString() }
      : {}),
    allowedProjectIds: projects.value,
    allowedProfileIds: profiles.value,
    unattendedUse: input.unattendedUse,
    ...(input.existingServerIsolation
      ? {
          existingServerIsolation: {
            serverPoolId: input.existingServerIsolation.serverPoolId.trim(),
            homeScope: "owner",
            portable: false,
          },
        }
      : {}),
    redacted: true,
  });
}

function createdAt(value: string): CreatedAt {
  return CreatedAt.rehydrate(value);
}

function updatedAt(value: string): UpdatedAt {
  return UpdatedAt.rehydrate(value);
}
