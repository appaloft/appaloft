import {
  type AgentAdapterKind,
  type AgentCredentialAuthMode,
  type DomainError,
  domainError,
  err,
  githubReviewExecutionKey,
  ok,
  type Result,
} from "@appaloft/core";
import { type ExecutionContext } from "./execution-context";
import { createCoordinationOwner, mutationCoordinationPolicies } from "./mutation-coordination";
import { type MutationCoordinator } from "./ports";

export type GitHubAgentCommand =
  | { kind: "fix"; instruction?: string }
  | { kind: "review"; instruction?: string }
  | { kind: "status" }
  | { kind: "steer"; instruction: string }
  | { kind: "stop" }
  | { kind: "resume" }
  | { kind: "new"; profile: string };

export interface GitHubAgentThreadRequest {
  title: string;
  body?: string;
}

export interface GitHubAgentTrigger {
  provider: "github";
  sourceEventId: string;
  event: "issue_comment" | "pull_request_review_comment" | "issues" | "pull_request";
  action: "created" | "labeled" | "ready_for_review" | "synchronize" | "closed";
  deliveryId: string;
  installationId: string;
  repository: {
    id: string;
    fullName: string;
    defaultBranch?: string;
  };
  sender: { id: string; loginSnapshot?: string; typeSnapshot?: string };
  thread: { kind: "issue" | "pull-request"; number: number };
  threadRequest?: GitHubAgentThreadRequest;
  commentId?: string;
  command?: GitHubAgentCommand;
  label?: { id?: string; name: string };
  pullRequest?: {
    number: number;
    headSha: string;
    baseRef: string;
    headRepositoryId: string;
    headRepositoryFullName: string;
    fork: boolean;
  };
  source?: {
    ref: string;
    headSha: string;
  };
  receivedAt?: string;
}

export type GitHubAgentIntentAction =
  | "fix"
  | "review"
  | "preview"
  | "status"
  | "steer"
  | "stop"
  | "resume"
  | "new"
  | "cleanup";

export interface GitHubAgentIntent {
  action: GitHubAgentIntentAction;
  source: "manual" | "automation" | "lifecycle";
  mode: "review-only" | "write";
  instruction?: string;
  profile?: string;
}

export interface GitHubAgentActorSnapshot {
  githubUserId: string;
  appaloftUserId?: string;
  organizationId?: string;
  membershipRole?: string;
  repositoryPermission?: string;
  externalCollaborator: boolean;
}

export interface GitHubAgentTaskExecutionAuthorization {
  allowed: true;
  authorizationKind: "task-execution";
  actorSnapshot: GitHubAgentActorSnapshot;
  repositoryBindingId: string;
  projectId: string;
  ruleId?: string;
  agentProfileId: string;
  workspaceProfileInstallationId: string;
  sandboxTemplateId: string;
  serverPoolId: string;
  credentialConnectionId: string;
  mode: "review-only" | "write";
  maximumRuntimeSeconds: number;
  maximumRetries: number;
  previewPolicy: "disabled" | "private";
  pullRequestDeliveryPolicy: "none" | "manual-approval" | "create-or-update" | "review-only";
  authorizationReason: string;
}

export interface GitHubAgentLifecycleCleanupAuthorization {
  allowed: true;
  authorizationKind: "lifecycle-cleanup";
  actorSnapshot: GitHubAgentActorSnapshot;
  repositoryBindingId: string;
  projectId: string;
  ruleId?: string;
  authorizationReason: string;
}

export type GitHubAgentAllowedAuthorizationDecision =
  | GitHubAgentTaskExecutionAuthorization
  | GitHubAgentLifecycleCleanupAuthorization;

export type GitHubAgentAuthorizationDecision =
  | GitHubAgentAllowedAuthorizationDecision
  | {
      allowed: false;
      reasonCode: string;
      message: string;
      connectAgentUrl?: string;
      actorSnapshot: GitHubAgentActorSnapshot;
    };

export interface GitHubAgentAuthorizationPort {
  authorize(
    context: ExecutionContext,
    input: { trigger: GitHubAgentTrigger; intent: GitHubAgentIntent },
  ): Promise<Result<GitHubAgentAuthorizationDecision>>;
}

export interface GitHubAgentTriggerSourceResolverPort {
  resolve(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      intent: GitHubAgentIntent;
    },
  ): Promise<Result<GitHubAgentTrigger>>;
}

export type GitHubAgentTaskStatus =
  | "queued"
  | "running"
  | "stopped"
  | "completed"
  | "failed"
  | "needs-reconciliation"
  | "cleaned";

export interface GitHubAgentTaskFeedbackDetails {
  phase?: string;
  checks?: Array<{
    name: string;
    status: "passed" | "failed" | "skipped";
    summary?: string;
  }>;
  diff?: {
    stat: string;
    patch?: string;
    truncated: boolean;
    redacted: boolean;
  };
  preview?: {
    url: string;
    visibility: "private" | "organization" | "public";
    expiresAt: string;
  };
  delivery?: {
    kind: "pull-request" | "review" | "none";
    status: "pending" | "delivered" | "failed";
    url?: string;
  };
  cleanup?: {
    workspace: "active" | "sleeping" | "cleaned";
    preview?: "active" | "expired" | "cleaned";
  };
  failure?: {
    code?: string;
    summary: string;
    retryable: boolean;
  };
}

export interface GitHubAgentTaskSummary {
  taskId: string;
  workspaceId: string;
  activeRunId?: string;
  status: GitHubAgentTaskStatus;
  taskUrl: string;
  sessionRecovery: "new" | "native" | "fallback" | "none";
  feedback?: GitHubAgentTaskFeedbackDetails;
}

export interface GitHubAgentTaskReference {
  taskId: string;
  workspaceId: string;
}

export interface GitHubRepositoryWorkspaceMaterializerPort {
  materialize(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      workspaceId: string;
      mode: "review-only" | "write";
    },
  ): Promise<Result<void>>;
}

export interface GitHubAgentTaskPort {
  startOrResume(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      intent: GitHubAgentIntent;
      authorization: GitHubAgentTaskExecutionAuthorization;
      current?: GitHubAgentTaskSummary;
    },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  status(
    context: ExecutionContext,
    input: GitHubAgentTaskReference,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  steer(
    context: ExecutionContext,
    input: GitHubAgentTaskReference & { instruction: string },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  stop(
    context: ExecutionContext,
    input: GitHubAgentTaskReference,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  resume(
    context: ExecutionContext,
    input: GitHubAgentTaskReference,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  replace(
    context: ExecutionContext,
    input: {
      current: GitHubAgentTaskSummary;
      profile: string;
      trigger: GitHubAgentTrigger;
      authorization: GitHubAgentTaskExecutionAuthorization;
    },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  cleanup(
    context: ExecutionContext,
    input: GitHubAgentTaskReference,
  ): Promise<Result<GitHubAgentTaskSummary>>;
}

export interface GitHubAgentFeedbackState {
  reactionId?: string;
  statusCommentId?: string;
  checkRunId?: string;
  reviewId?: string;
  pullRequestId?: string;
}

export type GitHubAgentThreadFeedbackState = Omit<GitHubAgentFeedbackState, "reactionId">;

export interface GitHubAgentFeedbackPort {
  acknowledge(
    context: ExecutionContext,
    input: { trigger: GitHubAgentTrigger; existing?: GitHubAgentFeedbackState },
  ): Promise<Result<GitHubAgentFeedbackState>>;
  update(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      task: GitHubAgentTaskSummary;
      existing?: GitHubAgentFeedbackState;
    },
  ): Promise<Result<GitHubAgentFeedbackState>>;
  reject(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      reasonCode: string;
      message: string;
      connectAgentUrl?: string;
      existing?: GitHubAgentFeedbackState;
    },
  ): Promise<Result<GitHubAgentFeedbackState>>;
}

export interface GitHubAgentReviewFinding {
  path: string;
  line: number;
  body: string;
  severity: "notice" | "warning" | "failure";
}

export interface GitHubAgentReviewDeliveryResult {
  reviewId: string;
  reviewUrl?: string;
  duplicate: boolean;
}

export interface GitHubAgentReviewDeliveryPort {
  submit(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      expectedHeadSha: string;
      contentDigest: string;
      summary: string;
      findings: GitHubAgentReviewFinding[];
    },
  ): Promise<Result<GitHubAgentReviewDeliveryResult>>;
}

export interface AgentCredentialEnrollmentPort {
  beginNativeEnrollment(
    context: ExecutionContext,
    input: {
      owner: { kind: "user" | "organization"; id: string };
      agent: AgentAdapterKind;
      authMode: Extract<AgentCredentialAuthMode, "agent-native-account" | "agent-native-api-key">;
      returnUrl: string;
      allowedProjectIds: readonly string[];
      allowedProfileIds: readonly string[];
      serverPoolId: string;
      unattendedUse: "denied" | "personal-owner-opt-in" | "organization-automation";
    },
  ): Promise<
    Result<{
      connectionId: string;
      flow: "browser" | "device" | "secret-input";
      verificationUrl?: string;
      userCode?: string;
      expiresAt?: string;
    }>
  >;
  refresh(context: ExecutionContext, connectionId: string): Promise<Result<void>>;
  revoke(context: ExecutionContext, connectionId: string): Promise<Result<void>>;
}

export interface AgentCredentialResolverPort {
  resolveForTask(
    context: ExecutionContext,
    input: {
      connectionId: string;
      projectId: string;
      agentProfileId: string;
      owner: { kind: "user" | "organization"; id: string };
      use: "manual" | "automation";
      untrustedCode: boolean;
      serverPoolId: string;
    },
  ): Promise<
    Result<{
      credentialLeaseId: string;
      authMode: AgentCredentialAuthMode;
      ownerScopedHomeRef: string;
      expiresAt: string;
    }>
  >;
}

export interface GitHubAgentAutomationOutcome {
  status: "accepted" | "denied" | "ignored";
  sourceEventId: string;
  deliveryId: string;
  duplicate?: true;
  reasonCode?: string;
  message?: string;
  connectAgentUrl?: string;
  task?: GitHubAgentTaskSummary;
  feedback?: GitHubAgentFeedbackState;
  intent?: GitHubAgentIntent;
  actorSnapshot?: GitHubAgentActorSnapshot;
  authorization?: GitHubAgentAllowedAuthorizationDecision;
  trigger?: GitHubAgentTrigger;
}

export interface GitHubAgentAutomationStore {
  claimDelivery(
    context: ExecutionContext,
    input: { sourceEventId: string; deliveryId: string },
  ): Promise<
    | { claimed: true }
    | { claimed: false; missingSourceEvent?: true; outcome?: GitHubAgentAutomationOutcome }
  >;
  recordOutcome(context: ExecutionContext, outcome: GitHubAgentAutomationOutcome): Promise<void>;
  claimReviewExecution(context: ExecutionContext, executionKey: string): Promise<boolean>;
  currentTask(
    context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentTaskSummary | undefined>;
  currentTaskFeedback(
    context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentThreadFeedbackState | undefined>;
  setCurrentTask(
    context: ExecutionContext,
    threadKey: string,
    task: GitHubAgentTaskSummary,
  ): Promise<void>;
  setCurrentTaskFeedback(
    context: ExecutionContext,
    threadKey: string,
    feedback: GitHubAgentThreadFeedbackState,
  ): Promise<void>;
  relatedPullRequestTask(
    context: ExecutionContext,
    input: { repositoryId: string; pullRequestNumber: number },
  ): Promise<GitHubAgentTaskSummary | undefined>;
  linkPullRequestTask(
    context: ExecutionContext,
    input: {
      repositoryId: string;
      pullRequestNumber: number;
      task: GitHubAgentTaskSummary;
    },
  ): Promise<boolean>;
}

export class InMemoryGitHubAgentAutomationStore implements GitHubAgentAutomationStore {
  private readonly deliveries = new Map<string, GitHubAgentAutomationOutcome | null>();
  private readonly reviewExecutions = new Set<string>();
  private readonly currentTasks = new Map<string, GitHubAgentTaskSummary>();
  private readonly currentTaskFeedbackStates = new Map<string, GitHubAgentThreadFeedbackState>();

  async claimDelivery(
    _context: ExecutionContext,
    input: { sourceEventId: string; deliveryId: string },
  ): Promise<
    | { claimed: true }
    | { claimed: false; missingSourceEvent?: true; outcome?: GitHubAgentAutomationOutcome }
  > {
    const key = `${input.sourceEventId}:${input.deliveryId}`;
    if (this.deliveries.has(key)) {
      const outcome = this.deliveries.get(key);
      return {
        claimed: false,
        ...(outcome ? { outcome: cloneOutcome(outcome) } : {}),
      };
    }
    this.deliveries.set(key, null);
    return { claimed: true };
  }

  async recordOutcome(
    _context: ExecutionContext,
    outcome: GitHubAgentAutomationOutcome,
  ): Promise<void> {
    this.deliveries.set(`${outcome.sourceEventId}:${outcome.deliveryId}`, cloneOutcome(outcome));
  }

  async claimReviewExecution(_context: ExecutionContext, executionKey: string): Promise<boolean> {
    if (this.reviewExecutions.has(executionKey)) return false;
    this.reviewExecutions.add(executionKey);
    return true;
  }

  async currentTask(
    _context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentTaskSummary | undefined> {
    const task = this.currentTasks.get(threadKey);
    return task ? { ...task } : undefined;
  }

  async currentTaskFeedback(
    _context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentThreadFeedbackState | undefined> {
    const feedback = this.currentTaskFeedbackStates.get(threadKey);
    return feedback ? { ...feedback } : undefined;
  }

  async setCurrentTask(
    _context: ExecutionContext,
    threadKey: string,
    task: GitHubAgentTaskSummary,
  ): Promise<void> {
    this.currentTasks.set(threadKey, { ...task });
  }

  async setCurrentTaskFeedback(
    _context: ExecutionContext,
    threadKey: string,
    feedback: GitHubAgentThreadFeedbackState,
  ): Promise<void> {
    if (this.currentTasks.has(threadKey)) {
      this.currentTaskFeedbackStates.set(threadKey, { ...feedback });
    }
  }

  async relatedPullRequestTask(
    _context: ExecutionContext,
    input: { repositoryId: string; pullRequestNumber: number },
  ): Promise<GitHubAgentTaskSummary | undefined> {
    const task = this.currentTasks.get(githubAgentRelatedPullRequestKey(input));
    return task ? { ...task } : undefined;
  }

  async linkPullRequestTask(
    _context: ExecutionContext,
    input: {
      repositoryId: string;
      pullRequestNumber: number;
      task: GitHubAgentTaskSummary;
    },
  ): Promise<boolean> {
    const key = githubAgentRelatedPullRequestKey(input);
    const current = this.currentTasks.get(key);
    if (
      current &&
      (current.taskId !== input.task.taskId || current.workspaceId !== input.task.workspaceId)
    ) {
      return false;
    }
    this.currentTasks.set(key, { ...input.task });
    return true;
  }
}

export interface GitHubAgentAutomationDependencies {
  store: GitHubAgentAutomationStore;
  mutationCoordinator: MutationCoordinator;
  authorization: GitHubAgentAuthorizationPort;
  tasks: GitHubAgentTaskPort;
  feedback: GitHubAgentFeedbackPort;
  sourceResolver?: GitHubAgentTriggerSourceResolverPort;
}

export class GitHubAgentAutomationService {
  constructor(private readonly dependencies: GitHubAgentAutomationDependencies) {}

  async handle(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const safeTrigger = assertGitHubAgentTriggerSafe(trigger);
    if (safeTrigger.isErr()) return err(safeTrigger.error);
    const claimed = await this.dependencies.store.claimDelivery(context, {
      sourceEventId: trigger.sourceEventId,
      deliveryId: trigger.deliveryId,
    });
    if (!claimed.claimed) {
      if (claimed.missingSourceEvent) {
        return err(
          domainError.validation(
            "GitHub Agent trigger requires a verified SourceEvent before automation dispatch",
          ),
        );
      }
      return ok(
        claimed.outcome
          ? { ...cloneOutcome(claimed.outcome), duplicate: true }
          : {
              status: "ignored",
              sourceEventId: trigger.sourceEventId,
              deliveryId: trigger.deliveryId,
              duplicate: true,
              reasonCode: "github_delivery_processing",
              message: "This GitHub delivery is already being processed.",
            },
      );
    }

    const intent = resolveGitHubAgentIntent(trigger);
    if (!intent) {
      return this.finish(context, {
        status: "ignored",
        sourceEventId: trigger.sourceEventId,
        deliveryId: trigger.deliveryId,
        reasonCode: "github_agent_trigger_not_matched",
        message: "The GitHub event does not match an Appaloft command or automation trigger.",
      });
    }

    if (this.dependencies.sourceResolver) {
      const resolved = await this.dependencies.sourceResolver.resolve(context, {
        trigger,
        intent,
      });
      if (resolved.isErr()) return err(resolved.error);
      trigger = resolved.value;
      const resolvedTriggerSafe = assertGitHubAgentTriggerSafe(trigger);
      if (resolvedTriggerSafe.isErr()) return err(resolvedTriggerSafe.error);
    }

    if (trigger.pullRequest?.fork) {
      return this.reject(
        context,
        trigger,
        {
          allowed: false,
          reasonCode: "github_fork_pull_request_denied",
          message: "Fork pull requests are not eligible for Agent execution.",
          actorSnapshot: {
            githubUserId: trigger.sender.id,
            externalCollaborator: true,
          },
        },
        intent,
      );
    }

    const authorization = await this.dependencies.authorization.authorize(context, {
      trigger,
      intent,
    });
    if (authorization.isErr()) return err(authorization.error);
    if (!authorization.value.allowed) {
      return this.reject(context, trigger, authorization.value, intent);
    }

    const allowed = authorization.value;
    const threadKey = githubAgentThreadKey(trigger);
    const current = await this.dependencies.store.currentTask(context, threadKey);
    const currentFeedback = current
      ? await this.dependencies.store.currentTaskFeedback(context, threadKey)
      : undefined;
    const related =
      intent.action === "cleanup" && trigger.thread.kind === "pull-request"
        ? await this.dependencies.store.relatedPullRequestTask(context, {
            repositoryId: trigger.repository.id,
            pullRequestNumber: trigger.thread.number,
          })
        : undefined;

    if (
      intent.action === "review" &&
      intent.source === "automation" &&
      trigger.pullRequest &&
      allowed.authorizationKind === "task-execution"
    ) {
      const reviewKey = githubReviewExecutionKey({
        providerRepositoryId: trigger.repository.id,
        pullRequestNumber: trigger.pullRequest.number,
        headSha: trigger.pullRequest.headSha,
        ruleId: allowed.ruleId ?? "automation-rule-unresolved",
      });
      const reviewClaimed = await this.dependencies.store.claimReviewExecution(context, reviewKey);
      if (!reviewClaimed) {
        return this.finish(context, {
          status: "ignored",
          sourceEventId: trigger.sourceEventId,
          deliveryId: trigger.deliveryId,
          reasonCode: "github_review_execution_duplicate",
          message: "This pull request head has already been reviewed by the matching rule.",
          intent: cloneIntent(intent),
          actorSnapshot: { ...allowed.actorSnapshot },
          authorization: cloneAllowedAuthorization(allowed),
        });
      }
    }

    if (intent.action === "cleanup") {
      const targets = uniqueTasks([current, related]);
      if (targets.length === 0) {
        return this.finish(context, {
          status: "ignored",
          sourceEventId: trigger.sourceEventId,
          deliveryId: trigger.deliveryId,
          reasonCode: "github_agent_task_not_found",
          message: "No linked Agent Task requires cleanup.",
          intent: cloneIntent(intent),
          actorSnapshot: { ...allowed.actorSnapshot },
          authorization: cloneAllowedAuthorization(allowed),
        });
      }
      const cleanedTasks: GitHubAgentTaskSummary[] = [];
      for (const target of targets) {
        const task = await this.dependencies.tasks.cleanup(context, target);
        if (task.isErr()) return err(task.error);
        cleanedTasks.push(task.value);
        if (current?.taskId === target.taskId && current.workspaceId === target.workspaceId) {
          await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
        }
        if (
          related?.taskId === target.taskId &&
          related.workspaceId === target.workspaceId &&
          trigger.thread.kind === "pull-request"
        ) {
          const linked = await this.dependencies.store.linkPullRequestTask(context, {
            repositoryId: trigger.repository.id,
            pullRequestNumber: trigger.thread.number,
            task: task.value,
          });
          if (!linked) {
            return err(
              domainError.conflict("GitHub pull request is linked to a different Agent Task"),
            );
          }
        }
      }
      const primary =
        cleanedTasks.find(
          (task) => task.taskId === related?.taskId && task.workspaceId === related.workspaceId,
        ) ?? cleanedTasks[0];
      if (!primary) {
        return err(domainError.invariant("GitHub Agent cleanup produced no Task result"));
      }
      return this.updateAndFinish(
        context,
        trigger,
        intent,
        allowed,
        primary,
        sameGitHubAgentTask(current, primary) ? currentFeedback : undefined,
      );
    }

    if (allowed.authorizationKind !== "task-execution") {
      return err(
        domainError.invariant(
          "GitHub Agent lifecycle authorization cannot start or control an Agent Task",
        ),
      );
    }

    if (intent.action === "status") {
      return this.control(context, trigger, intent, allowed, "status");
    }
    if (intent.action === "steer") {
      return this.control(context, trigger, intent, allowed, "steer", intent.instruction);
    }
    if (intent.action === "stop") {
      return this.control(context, trigger, intent, allowed, "stop");
    }
    if (intent.action === "resume") {
      return this.control(context, trigger, intent, allowed, "resume");
    }
    if (intent.action === "new") {
      if (!current || !intent.profile) {
        return this.noCurrentTask(context, trigger, intent, allowed);
      }
      const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
      if (acknowledged.isErr()) return err(acknowledged.error);
      const task = await this.dependencies.tasks.replace(context, {
        current,
        profile: intent.profile,
        trigger,
        authorization: allowed,
      });
      if (task.isErr()) {
        return this.rejectTaskFailure(
          context,
          trigger,
          intent,
          allowed,
          task.error,
          acknowledged.value,
        );
      }
      await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
      return this.updateAndFinish(
        context,
        trigger,
        intent,
        allowed,
        task.value,
        acknowledged.value,
      );
    }

    const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
    if (acknowledged.isErr()) return err(acknowledged.error);
    const task = await this.dependencies.tasks.startOrResume(context, {
      trigger,
      intent,
      authorization: allowed,
      ...(current ? { current } : {}),
    });
    if (task.isErr()) {
      return this.rejectTaskFailure(
        context,
        trigger,
        intent,
        allowed,
        task.error,
        acknowledged.value,
      );
    }
    await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
    return this.updateAndFinish(context, trigger, intent, allowed, task.value, {
      ...(sameGitHubAgentTask(current, task.value) ? (currentFeedback ?? {}) : {}),
      ...acknowledged.value,
    });
  }

  private async control(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    intent: GitHubAgentIntent,
    authorization: GitHubAgentTaskExecutionAuthorization,
    action: "status" | "steer" | "stop" | "resume",
    instruction?: string,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
    if (acknowledged.isErr()) return err(acknowledged.error);
    const threadKey = githubAgentThreadKey(trigger);
    return this.dependencies.mutationCoordinator.runExclusive({
      context,
      policy: mutationCoordinationPolicies.githubAgentThreadControl,
      scope: {
        kind: "github-agent-thread",
        key: `${context.tenant?.tenantId ?? "tenant_instance"}:${threadKey}`,
      },
      owner: createCoordinationOwner(context, `github-agent-${action}`),
      work: async (lease) => {
        const current = await this.dependencies.store.currentTask(context, threadKey);
        if (!current) return this.noCurrentTask(context, trigger, intent, authorization);
        const currentFeedback = await this.dependencies.store.currentTaskFeedback(
          context,
          threadKey,
        );
        const controlled =
          action === "status"
            ? await this.dependencies.tasks.status(context, current)
            : action === "steer" && instruction
              ? await this.dependencies.tasks.steer(context, { ...current, instruction })
              : action === "stop"
                ? await this.dependencies.tasks.stop(context, current)
                : await this.dependencies.tasks.resume(context, current);
        if (controlled.isErr()) return err(controlled.error);
        const ownership = await lease?.assertOwned();
        if (ownership?.isErr()) return err(ownership.error);
        await this.dependencies.store.setCurrentTask(context, threadKey, controlled.value);
        return this.updateAndFinish(context, trigger, intent, authorization, controlled.value, {
          ...(currentFeedback ?? {}),
          ...acknowledged.value,
        });
      },
    });
  }

  private async noCurrentTask(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    intent: GitHubAgentIntent,
    authorization: GitHubAgentTaskExecutionAuthorization,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const decision: Extract<GitHubAgentAuthorizationDecision, { allowed: false }> = {
      allowed: false,
      reasonCode: "github_agent_task_not_found",
      message: "No current Agent Task is linked to this GitHub thread.",
      actorSnapshot: authorization.actorSnapshot,
    };
    return this.reject(context, trigger, decision, intent);
  }

  private async reject(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    decision: Extract<GitHubAgentAuthorizationDecision, { allowed: false }>,
    intent?: GitHubAgentIntent,
    feedbackState?: GitHubAgentFeedbackState,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const feedback = await this.dependencies.feedback.reject(context, {
      trigger,
      reasonCode: decision.reasonCode,
      message: decision.message,
      ...(decision.connectAgentUrl ? { connectAgentUrl: decision.connectAgentUrl } : {}),
      ...(feedbackState ? { existing: feedbackState } : {}),
    });
    if (feedback.isErr()) return err(feedback.error);
    return this.finish(context, {
      status: "denied",
      sourceEventId: trigger.sourceEventId,
      deliveryId: trigger.deliveryId,
      reasonCode: decision.reasonCode,
      message: decision.message,
      ...(decision.connectAgentUrl ? { connectAgentUrl: decision.connectAgentUrl } : {}),
      feedback: feedback.value,
      ...(intent ? { intent: cloneIntent(intent) } : {}),
      actorSnapshot: { ...decision.actorSnapshot },
    });
  }

  private rejectTaskFailure(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    intent: GitHubAgentIntent,
    authorization: GitHubAgentTaskExecutionAuthorization,
    failure: DomainError,
    feedbackState: GitHubAgentFeedbackState,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const detailCode = typeof failure.details?.code === "string" ? failure.details.code.trim() : "";
    return this.reject(
      context,
      trigger,
      {
        allowed: false,
        reasonCode: detailCode || failure.code,
        message: failure.message,
        actorSnapshot: authorization.actorSnapshot,
      },
      intent,
      feedbackState,
    );
  }

  private async updateAndFinish(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    intent: GitHubAgentIntent,
    authorization: GitHubAgentAllowedAuthorizationDecision,
    task: GitHubAgentTaskSummary,
    feedbackState?: GitHubAgentFeedbackState,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const feedback = await this.dependencies.feedback.update(context, {
      trigger,
      task,
      ...(feedbackState ? { existing: feedbackState } : {}),
    });
    if (feedback.isErr()) return err(feedback.error);
    await this.dependencies.store.setCurrentTaskFeedback(
      context,
      githubAgentThreadKey(trigger),
      threadFeedbackState(feedback.value),
    );
    return this.finish(context, {
      status: "accepted",
      sourceEventId: trigger.sourceEventId,
      deliveryId: trigger.deliveryId,
      task: { ...task },
      feedback: feedback.value,
      intent: cloneIntent(intent),
      actorSnapshot: { ...authorization.actorSnapshot },
      authorization: cloneAllowedAuthorization(authorization),
      trigger: cloneTrigger(trigger),
    });
  }

  private async finish(
    context: ExecutionContext,
    outcome: GitHubAgentAutomationOutcome,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    await this.dependencies.store.recordOutcome(context, outcome);
    return ok(cloneOutcome(outcome));
  }
}

function threadFeedbackState(feedback: GitHubAgentFeedbackState): GitHubAgentThreadFeedbackState {
  const { reactionId: _reactionId, ...state } = feedback;
  return state;
}

function sameGitHubAgentTask(
  left: GitHubAgentTaskSummary | undefined,
  right: GitHubAgentTaskSummary,
): boolean {
  return left?.taskId === right.taskId && left.workspaceId === right.workspaceId;
}

export function resolveGitHubAgentIntent(trigger: GitHubAgentTrigger): GitHubAgentIntent | null {
  if (trigger.command) {
    switch (trigger.command.kind) {
      case "fix":
        return {
          action: "fix",
          source: "manual",
          mode: "write",
          ...(trigger.command.instruction ? { instruction: trigger.command.instruction } : {}),
        };
      case "review":
        return {
          action: "review",
          source: "manual",
          mode: "review-only",
          ...(trigger.command.instruction ? { instruction: trigger.command.instruction } : {}),
        };
      case "steer":
        return {
          action: "steer",
          source: "manual",
          mode: "write",
          instruction: trigger.command.instruction,
        };
      case "new":
        return {
          action: "new",
          source: "manual",
          mode: "write",
          profile: trigger.command.profile,
        };
      case "status":
      case "stop":
      case "resume":
        return { action: trigger.command.kind, source: "manual", mode: "write" };
    }
  }

  if (trigger.action === "labeled" && trigger.label) {
    switch (trigger.label.name.toLowerCase()) {
      case "appaloft:fix":
        return {
          action: "fix",
          source: "automation",
          mode: "write",
          ...(trigger.threadRequest
            ? { instruction: githubAgentThreadRequestInstruction(trigger.threadRequest) }
            : {}),
        };
      case "appaloft:review":
        return {
          action: "review",
          source: "automation",
          mode: "review-only",
          ...(trigger.threadRequest
            ? { instruction: githubAgentThreadRequestInstruction(trigger.threadRequest) }
            : {}),
        };
      case "appaloft:preview":
        return {
          action: "preview",
          source: "automation",
          mode: "write",
          ...(trigger.threadRequest
            ? { instruction: githubAgentThreadRequestInstruction(trigger.threadRequest) }
            : {}),
        };
    }
  }
  if (
    trigger.event === "pull_request" &&
    (trigger.action === "ready_for_review" || trigger.action === "synchronize")
  ) {
    return {
      action: "review",
      source: "automation",
      mode: "review-only",
      ...(trigger.threadRequest
        ? { instruction: githubAgentThreadRequestInstruction(trigger.threadRequest) }
        : {}),
    };
  }
  if (trigger.event === "pull_request" && trigger.action === "closed") {
    return { action: "cleanup", source: "lifecycle", mode: "write" };
  }
  return null;
}

function githubAgentThreadKey(trigger: GitHubAgentTrigger): string {
  return [
    "github-thread",
    trigger.repository.id,
    trigger.thread.kind,
    String(trigger.thread.number),
  ].join(":");
}

function githubAgentRelatedPullRequestKey(input: {
  repositoryId: string;
  pullRequestNumber: number;
}): string {
  return ["github-related-pull-request", input.repositoryId, String(input.pullRequestNumber)].join(
    ":",
  );
}

function uniqueTasks(tasks: Array<GitHubAgentTaskSummary | undefined>): GitHubAgentTaskSummary[] {
  const unique = new Map<string, GitHubAgentTaskSummary>();
  for (const task of tasks) {
    if (task) unique.set(`${task.workspaceId}:${task.taskId}`, task);
  }
  return [...unique.values()];
}

function cloneOutcome(outcome: GitHubAgentAutomationOutcome): GitHubAgentAutomationOutcome {
  return {
    ...outcome,
    ...(outcome.task ? { task: { ...outcome.task } } : {}),
    ...(outcome.feedback ? { feedback: { ...outcome.feedback } } : {}),
    ...(outcome.intent ? { intent: cloneIntent(outcome.intent) } : {}),
    ...(outcome.actorSnapshot ? { actorSnapshot: { ...outcome.actorSnapshot } } : {}),
    ...(outcome.authorization
      ? { authorization: cloneAllowedAuthorization(outcome.authorization) }
      : {}),
    ...(outcome.trigger ? { trigger: cloneTrigger(outcome.trigger) } : {}),
  };
}

function cloneIntent(intent: GitHubAgentIntent): GitHubAgentIntent {
  return { ...intent };
}

function cloneTrigger(trigger: GitHubAgentTrigger): GitHubAgentTrigger {
  return {
    ...trigger,
    repository: { ...trigger.repository },
    sender: { ...trigger.sender },
    thread: { ...trigger.thread },
    ...(trigger.threadRequest ? { threadRequest: { ...trigger.threadRequest } } : {}),
    ...(trigger.command ? { command: { ...trigger.command } } : {}),
    ...(trigger.label ? { label: { ...trigger.label } } : {}),
    ...(trigger.pullRequest ? { pullRequest: { ...trigger.pullRequest } } : {}),
    ...(trigger.source ? { source: { ...trigger.source } } : {}),
  };
}

function cloneAllowedAuthorization(
  authorization: GitHubAgentAllowedAuthorizationDecision,
): GitHubAgentAllowedAuthorizationDecision {
  return {
    ...authorization,
    actorSnapshot: { ...authorization.actorSnapshot },
  };
}

export function assertGitHubAgentTriggerSafe(input: GitHubAgentTrigger): Result<void> {
  if (
    !/^[1-9]\d*$/u.test(input.installationId) ||
    !/^[1-9]\d*$/u.test(input.repository.id) ||
    !/^[1-9]\d*$/u.test(input.sender.id) ||
    !input.sourceEventId.trim() ||
    !input.deliveryId.trim()
  ) {
    return err(domainError.validation("GitHub Agent trigger numeric identity is invalid"));
  }
  if (input.source && !/^[0-9a-f]{40}$/u.test(input.source.headSha)) {
    return err(domainError.validation("GitHub Agent trigger source head SHA is invalid"));
  }
  if (input.threadRequest) {
    const request = assertGitHubAgentThreadRequestSafe(input.threadRequest);
    if (request.isErr()) return err(request.error);
  }
  return ok(undefined);
}

const githubAgentThreadRequestTitleLimit = 512;
const githubAgentThreadRequestBodyLimit = 16_384;
const githubAgentThreadRequestSecret =
  /(?:\b(?:api[_-]?key|password|private[_-]?key|secret|token|credential(?:connection)?id)\b\s*[:=]\s*\S|\b[A-Z][A-Z0-9_]{2,}\s*=\s*\S|\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,}|sk-[A-Za-z0-9_-]{12,})|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)/iu;

export function assertGitHubAgentThreadRequestSafe(input: GitHubAgentThreadRequest): Result<void> {
  const title = input.title.trim();
  const body = input.body?.trim();
  if (
    !title ||
    title.length > githubAgentThreadRequestTitleLimit ||
    (body !== undefined && body.length > githubAgentThreadRequestBodyLimit)
  ) {
    return err(domainError.validation("GitHub Agent thread request is missing or too long"));
  }
  if (
    githubAgentThreadRequestSecret.test(title) ||
    (body && githubAgentThreadRequestSecret.test(body))
  ) {
    return err(
      domainError.validation(
        "GitHub Agent thread request cannot contain credentials, secret material, or environment assignments",
      ),
    );
  }
  return ok(undefined);
}

function githubAgentThreadRequestInstruction(input: GitHubAgentThreadRequest): string {
  return input.body
    ? `GitHub request: ${input.title}\n\n${input.body}`
    : `GitHub request: ${input.title}`;
}
