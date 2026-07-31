import {
  type ExecutionContext,
  type GitHubAgentAutomationOutcome,
  type GitHubAgentAutomationStore,
  type GitHubAgentTaskSummary,
  type GitHubAgentThreadFeedbackState,
  toRepositoryContext,
} from "@appaloft/application";
import { type Kysely } from "kysely";
import { type Database } from "../schema";
import { resolveRepositoryExecutor } from "./shared";

function tenantId(context: ExecutionContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function now(): string {
  return new Date().toISOString();
}

export class PgGitHubAgentAutomationStore implements GitHubAgentAutomationStore {
  constructor(private readonly db: Kysely<Database>) {}

  async claimDelivery(
    context: ExecutionContext,
    input: { sourceEventId: string; deliveryId: string },
  ): Promise<
    | { claimed: true }
    | { claimed: false; missingSourceEvent?: true; outcome?: GitHubAgentAutomationOutcome }
  > {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));
    const at = now();
    const claimed = await executor
      .updateTable("source_events")
      .set({ agent_automation_claimed_at: at })
      .where("id", "=", input.sourceEventId)
      .where("source_kind", "=", "github")
      .where("delivery_id", "=", input.deliveryId)
      .where("agent_automation_claimed_at", "is", null)
      .returning("id")
      .executeTakeFirst();
    if (claimed) return { claimed: true };

    const existing = await executor
      .selectFrom("source_events")
      .select(["agent_automation_claimed_at", "agent_automation_outcome"])
      .where("id", "=", input.sourceEventId)
      .where("source_kind", "=", "github")
      .where("delivery_id", "=", input.deliveryId)
      .executeTakeFirst();
    if (!existing) return { claimed: false, missingSourceEvent: true };
    const outcome = existing.agent_automation_outcome
      ? outcomeFromJson(existing.agent_automation_outcome)
      : undefined;
    return { claimed: false, ...(outcome ? { outcome } : {}) };
  }

  async recordOutcome(
    context: ExecutionContext,
    outcome: GitHubAgentAutomationOutcome,
  ): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));
    const updated = await executor
      .updateTable("source_events")
      .set({ agent_automation_outcome: outcome as unknown as Record<string, unknown> })
      .where("id", "=", outcome.sourceEventId)
      .where("source_kind", "=", "github")
      .where("delivery_id", "=", outcome.deliveryId)
      .where("agent_automation_claimed_at", "is not", null)
      .returning("id")
      .executeTakeFirst();
    if (!updated) {
      throw new Error(`Verified SourceEvent ${outcome.sourceEventId} was not claimed`);
    }
  }

  async claimReviewExecution(context: ExecutionContext, executionKey: string): Promise<boolean> {
    const inserted = await resolveRepositoryExecutor(this.db, toRepositoryContext(context))
      .insertInto("github_agent_review_executions")
      .values({
        tenant_id: tenantId(context),
        execution_key: executionKey,
        claimed_at: now(),
      })
      .onConflict((conflict) => conflict.columns(["tenant_id", "execution_key"]).doNothing())
      .returning("execution_key")
      .executeTakeFirst();
    return Boolean(inserted);
  }

  async currentTask(
    context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentTaskSummary | undefined> {
    const row = await resolveRepositoryExecutor(this.db, toRepositoryContext(context))
      .selectFrom("github_agent_thread_tasks")
      .select("task")
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", threadKey)
      .executeTakeFirst();
    return row ? taskFromJson(row.task) : undefined;
  }

  async currentTaskFeedback(
    context: ExecutionContext,
    threadKey: string,
  ): Promise<GitHubAgentThreadFeedbackState | undefined> {
    const row = await resolveRepositoryExecutor(this.db, toRepositoryContext(context))
      .selectFrom("github_agent_thread_tasks")
      .select("feedback_state")
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", threadKey)
      .executeTakeFirst();
    return row?.feedback_state ? feedbackFromJson(row.feedback_state) : undefined;
  }

  async setCurrentTask(
    context: ExecutionContext,
    threadKey: string,
    task: GitHubAgentTaskSummary,
  ): Promise<void> {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));
    const at = now();
    await executor
      .insertInto("github_agent_thread_tasks")
      .values({
        tenant_id: tenantId(context),
        thread_key: threadKey,
        task: task as unknown as Record<string, unknown>,
        updated_at: at,
      })
      .onConflict((conflict) =>
        conflict.columns(["tenant_id", "thread_key"]).doUpdateSet({
          task: task as unknown as Record<string, unknown>,
          updated_at: at,
        }),
      )
      .execute();
  }

  async setCurrentTaskFeedback(
    context: ExecutionContext,
    threadKey: string,
    feedback: GitHubAgentThreadFeedbackState,
  ): Promise<void> {
    await resolveRepositoryExecutor(this.db, toRepositoryContext(context))
      .updateTable("github_agent_thread_tasks")
      .set({
        feedback_state: feedback as unknown as Record<string, unknown>,
        updated_at: now(),
      })
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", threadKey)
      .execute();
  }

  async relatedPullRequestTask(
    context: ExecutionContext,
    input: { repositoryId: string; pullRequestNumber: number },
  ): Promise<GitHubAgentTaskSummary | undefined> {
    const row = await resolveRepositoryExecutor(this.db, toRepositoryContext(context))
      .selectFrom("github_agent_thread_tasks")
      .select("task")
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", relatedPullRequestKey(input))
      .executeTakeFirst();
    return row ? taskFromJson(row.task) : undefined;
  }

  async linkPullRequestTask(
    context: ExecutionContext,
    input: {
      repositoryId: string;
      pullRequestNumber: number;
      task: GitHubAgentTaskSummary;
    },
  ): Promise<boolean> {
    const executor = resolveRepositoryExecutor(this.db, toRepositoryContext(context));
    const key = relatedPullRequestKey(input);
    const inserted = await executor
      .insertInto("github_agent_thread_tasks")
      .values({
        tenant_id: tenantId(context),
        thread_key: key,
        task: input.task as unknown as Record<string, unknown>,
        updated_at: now(),
      })
      .onConflict((conflict) => conflict.columns(["tenant_id", "thread_key"]).doNothing())
      .returning("thread_key")
      .executeTakeFirst();
    if (inserted) return true;
    const existing = await executor
      .selectFrom("github_agent_thread_tasks")
      .select("task")
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", key)
      .executeTakeFirst();
    const task = existing ? taskFromJson(existing.task) : undefined;
    if (task?.taskId !== input.task.taskId || task.workspaceId !== input.task.workspaceId) {
      return false;
    }
    await executor
      .updateTable("github_agent_thread_tasks")
      .set({
        task: input.task as unknown as Record<string, unknown>,
        updated_at: now(),
      })
      .where("tenant_id", "=", tenantId(context))
      .where("thread_key", "=", key)
      .execute();
    return true;
  }
}

function relatedPullRequestKey(input: { repositoryId: string; pullRequestNumber: number }): string {
  return ["github-related-pull-request", input.repositoryId, String(input.pullRequestNumber)].join(
    ":",
  );
}

function outcomeFromJson(value: Record<string, unknown>): GitHubAgentAutomationOutcome | undefined {
  if (
    (value.status !== "accepted" && value.status !== "denied" && value.status !== "ignored") ||
    typeof value.sourceEventId !== "string" ||
    typeof value.deliveryId !== "string"
  ) {
    return undefined;
  }
  return structuredClone(value) as unknown as GitHubAgentAutomationOutcome;
}

function taskFromJson(value: Record<string, unknown>): GitHubAgentTaskSummary | undefined {
  if (
    typeof value.taskId !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.taskUrl !== "string" ||
    (value.status !== "queued" &&
      value.status !== "running" &&
      value.status !== "stopped" &&
      value.status !== "completed" &&
      value.status !== "failed" &&
      value.status !== "needs-reconciliation" &&
      value.status !== "cleaned") ||
    (value.sessionRecovery !== "new" &&
      value.sessionRecovery !== "native" &&
      value.sessionRecovery !== "fallback" &&
      value.sessionRecovery !== "none")
  ) {
    return undefined;
  }
  return {
    taskId: value.taskId,
    workspaceId: value.workspaceId,
    ...(typeof value.activeRunId === "string" ? { activeRunId: value.activeRunId } : {}),
    status: value.status,
    taskUrl: value.taskUrl,
    sessionRecovery: value.sessionRecovery,
  };
}

function feedbackFromJson(
  value: Record<string, unknown>,
): GitHubAgentThreadFeedbackState | undefined {
  const state: GitHubAgentThreadFeedbackState = {};
  for (const key of ["statusCommentId", "checkRunId", "reviewId", "pullRequestId"] as const) {
    const id = value[key];
    if (id !== undefined && typeof id !== "string") return undefined;
    if (typeof id === "string") state[key] = id;
  }
  return state;
}
