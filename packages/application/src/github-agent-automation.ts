import {
  type AgentAdapterKind,
  type AgentCredentialAuthMode,
  domainError,
  err,
  githubReviewExecutionKey,
  ok,
  type Result,
} from "@appaloft/core";
import { type ExecutionContext } from "./execution-context";

export type GitHubAgentCommand =
  | { kind: "fix"; instruction?: string }
  | { kind: "review"; instruction?: string }
  | { kind: "status" }
  | { kind: "steer"; instruction: string }
  | { kind: "stop" }
  | { kind: "resume" }
  | { kind: "new"; profile: string };

export interface GitHubAgentTrigger {
  provider: "github";
  sourceEventId: string;
  event: "issue_comment" | "pull_request_review_comment" | "issues" | "pull_request";
  action: "created" | "labeled" | "ready_for_review" | "synchronize" | "closed";
  deliveryId: string;
  installationId: string;
  repository: { id: string; fullName: string };
  sender: { id: string; loginSnapshot?: string; typeSnapshot?: string };
  thread: { kind: "issue" | "pull-request"; number: number };
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

export type GitHubAgentAuthorizationDecision =
  | {
      allowed: true;
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

export interface GitHubAgentTaskPort {
  startOrResume(
    context: ExecutionContext,
    input: {
      trigger: GitHubAgentTrigger;
      intent: GitHubAgentIntent;
      authorization: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>;
      current?: GitHubAgentTaskSummary;
    },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  status(
    context: ExecutionContext,
    input: GitHubAgentTaskSummary,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  steer(
    context: ExecutionContext,
    input: GitHubAgentTaskSummary & { instruction: string },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  stop(
    context: ExecutionContext,
    input: GitHubAgentTaskSummary,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  resume(
    context: ExecutionContext,
    input: GitHubAgentTaskSummary,
  ): Promise<Result<GitHubAgentTaskSummary>>;
  replace(
    context: ExecutionContext,
    input: {
      current: GitHubAgentTaskSummary;
      profile: string;
      trigger: GitHubAgentTrigger;
      authorization: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>;
    },
  ): Promise<Result<GitHubAgentTaskSummary>>;
  cleanup(
    context: ExecutionContext,
    input: GitHubAgentTaskSummary,
  ): Promise<Result<GitHubAgentTaskSummary>>;
}

export interface GitHubAgentFeedbackState {
  reactionId?: string;
  statusCommentId?: string;
  checkRunId?: string;
  reviewId?: string;
  pullRequestId?: string;
}

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
  actorSnapshot?: GitHubAgentActorSnapshot;
  authorization?: {
    repositoryBindingId: string;
    projectId: string;
    ruleId?: string;
    agentProfileId: string;
    credentialConnectionId: string;
    mode: "review-only" | "write";
    reason: string;
  };
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
  setCurrentTask(
    context: ExecutionContext,
    threadKey: string,
    task: GitHubAgentTaskSummary,
  ): Promise<void>;
}

export class InMemoryGitHubAgentAutomationStore implements GitHubAgentAutomationStore {
  private readonly deliveries = new Map<string, GitHubAgentAutomationOutcome | null>();
  private readonly reviewExecutions = new Set<string>();
  private readonly currentTasks = new Map<string, GitHubAgentTaskSummary>();

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

  async setCurrentTask(
    _context: ExecutionContext,
    threadKey: string,
    task: GitHubAgentTaskSummary,
  ): Promise<void> {
    this.currentTasks.set(threadKey, { ...task });
  }
}

export interface GitHubAgentAutomationDependencies {
  store: GitHubAgentAutomationStore;
  authorization: GitHubAgentAuthorizationPort;
  tasks: GitHubAgentTaskPort;
  feedback: GitHubAgentFeedbackPort;
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

    const intent = intentFromTrigger(trigger);
    if (!intent) {
      return this.finish(context, {
        status: "ignored",
        sourceEventId: trigger.sourceEventId,
        deliveryId: trigger.deliveryId,
        reasonCode: "github_agent_trigger_not_matched",
        message: "The GitHub event does not match an Appaloft command or automation trigger.",
      });
    }

    if (trigger.pullRequest?.fork) {
      return this.reject(context, trigger, {
        allowed: false,
        reasonCode: "github_fork_pull_request_denied",
        message: "Fork pull requests are not eligible for Agent execution.",
        actorSnapshot: {
          githubUserId: trigger.sender.id,
          externalCollaborator: true,
        },
      });
    }

    const authorization = await this.dependencies.authorization.authorize(context, {
      trigger,
      intent,
    });
    if (authorization.isErr()) return err(authorization.error);
    if (!authorization.value.allowed) {
      return this.reject(context, trigger, authorization.value);
    }

    const allowed = authorization.value;
    const threadKey = githubAgentThreadKey(trigger);
    const current = await this.dependencies.store.currentTask(context, threadKey);

    if (intent.action === "review" && intent.source === "automation" && trigger.pullRequest) {
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
          actorSnapshot: { ...allowed.actorSnapshot },
          authorization: authorizationSnapshot(allowed),
        });
      }
    }

    if (intent.action === "cleanup") {
      if (!current) {
        return this.finish(context, {
          status: "ignored",
          sourceEventId: trigger.sourceEventId,
          deliveryId: trigger.deliveryId,
          reasonCode: "github_agent_task_not_found",
          message: "No linked Agent Task requires cleanup.",
          actorSnapshot: { ...allowed.actorSnapshot },
          authorization: authorizationSnapshot(allowed),
        });
      }
      const task = await this.dependencies.tasks.cleanup(context, current);
      if (task.isErr()) return err(task.error);
      await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
      return this.updateAndFinish(context, trigger, allowed, task.value);
    }

    if (intent.action === "status") {
      return current
        ? this.control(context, trigger, allowed, current, "status")
        : this.noCurrentTask(context, trigger, allowed);
    }
    if (intent.action === "steer") {
      return current
        ? this.control(context, trigger, allowed, current, "steer", intent.instruction)
        : this.noCurrentTask(context, trigger, allowed);
    }
    if (intent.action === "stop") {
      return current
        ? this.control(context, trigger, allowed, current, "stop")
        : this.noCurrentTask(context, trigger, allowed);
    }
    if (intent.action === "resume") {
      return current
        ? this.control(context, trigger, allowed, current, "resume")
        : this.noCurrentTask(context, trigger, allowed);
    }
    if (intent.action === "new") {
      if (!current || !intent.profile) {
        return this.noCurrentTask(context, trigger, allowed);
      }
      const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
      if (acknowledged.isErr()) return err(acknowledged.error);
      const task = await this.dependencies.tasks.replace(context, {
        current,
        profile: intent.profile,
        trigger,
        authorization: allowed,
      });
      if (task.isErr()) return err(task.error);
      await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
      return this.updateAndFinish(context, trigger, allowed, task.value, acknowledged.value);
    }

    const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
    if (acknowledged.isErr()) return err(acknowledged.error);
    const task = await this.dependencies.tasks.startOrResume(context, {
      trigger,
      intent,
      authorization: allowed,
      ...(current ? { current } : {}),
    });
    if (task.isErr()) return err(task.error);
    await this.dependencies.store.setCurrentTask(context, threadKey, task.value);
    return this.updateAndFinish(context, trigger, allowed, task.value, acknowledged.value);
  }

  private async control(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    authorization: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>,
    current: GitHubAgentTaskSummary,
    action: "status" | "steer" | "stop" | "resume",
    instruction?: string,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const acknowledged = await this.dependencies.feedback.acknowledge(context, { trigger });
    if (acknowledged.isErr()) return err(acknowledged.error);
    const controlled =
      action === "status"
        ? await this.dependencies.tasks.status(context, current)
        : action === "steer" && instruction
          ? await this.dependencies.tasks.steer(context, { ...current, instruction })
          : action === "stop"
            ? await this.dependencies.tasks.stop(context, current)
            : await this.dependencies.tasks.resume(context, current);
    if (controlled.isErr()) return err(controlled.error);
    await this.dependencies.store.setCurrentTask(
      context,
      githubAgentThreadKey(trigger),
      controlled.value,
    );
    return this.updateAndFinish(
      context,
      trigger,
      authorization,
      controlled.value,
      acknowledged.value,
    );
  }

  private async noCurrentTask(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    authorization: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const decision: Extract<GitHubAgentAuthorizationDecision, { allowed: false }> = {
      allowed: false,
      reasonCode: "github_agent_task_not_found",
      message: "No current Agent Task is linked to this GitHub thread.",
      actorSnapshot: authorization.actorSnapshot,
    };
    return this.reject(context, trigger, decision);
  }

  private async reject(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    decision: Extract<GitHubAgentAuthorizationDecision, { allowed: false }>,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const feedback = await this.dependencies.feedback.reject(context, {
      trigger,
      reasonCode: decision.reasonCode,
      message: decision.message,
      ...(decision.connectAgentUrl ? { connectAgentUrl: decision.connectAgentUrl } : {}),
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
      actorSnapshot: { ...decision.actorSnapshot },
    });
  }

  private async updateAndFinish(
    context: ExecutionContext,
    trigger: GitHubAgentTrigger,
    authorization: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>,
    task: GitHubAgentTaskSummary,
    feedbackState?: GitHubAgentFeedbackState,
  ): Promise<Result<GitHubAgentAutomationOutcome>> {
    const feedback = await this.dependencies.feedback.update(context, {
      trigger,
      task,
      ...(feedbackState ? { existing: feedbackState } : {}),
    });
    if (feedback.isErr()) return err(feedback.error);
    return this.finish(context, {
      status: "accepted",
      sourceEventId: trigger.sourceEventId,
      deliveryId: trigger.deliveryId,
      task: { ...task },
      feedback: feedback.value,
      actorSnapshot: { ...authorization.actorSnapshot },
      authorization: authorizationSnapshot(authorization),
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

function intentFromTrigger(trigger: GitHubAgentTrigger): GitHubAgentIntent | null {
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
        return { action: "fix", source: "automation", mode: "write" };
      case "appaloft:review":
        return { action: "review", source: "automation", mode: "review-only" };
      case "appaloft:preview":
        return { action: "preview", source: "automation", mode: "write" };
    }
  }
  if (
    trigger.event === "pull_request" &&
    (trigger.action === "ready_for_review" || trigger.action === "synchronize")
  ) {
    return { action: "review", source: "automation", mode: "review-only" };
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

function authorizationSnapshot(
  decision: Extract<GitHubAgentAuthorizationDecision, { allowed: true }>,
): NonNullable<GitHubAgentAutomationOutcome["authorization"]> {
  return {
    repositoryBindingId: decision.repositoryBindingId,
    projectId: decision.projectId,
    ...(decision.ruleId ? { ruleId: decision.ruleId } : {}),
    agentProfileId: decision.agentProfileId,
    credentialConnectionId: decision.credentialConnectionId,
    mode: decision.mode,
    reason: decision.authorizationReason,
  };
}

function cloneOutcome(outcome: GitHubAgentAutomationOutcome): GitHubAgentAutomationOutcome {
  return {
    ...outcome,
    ...(outcome.task ? { task: { ...outcome.task } } : {}),
    ...(outcome.feedback ? { feedback: { ...outcome.feedback } } : {}),
    ...(outcome.actorSnapshot ? { actorSnapshot: { ...outcome.actorSnapshot } } : {}),
    ...(outcome.authorization ? { authorization: { ...outcome.authorization } } : {}),
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
  return ok(undefined);
}
