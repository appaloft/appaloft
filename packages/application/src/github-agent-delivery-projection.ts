import { type AgentTaskRunDescriptor } from "./agent-task-run";
import {
  type GitHubAgentReviewFinding,
  type GitHubAgentTaskFeedbackDetails,
  type GitHubAgentTaskSummary,
  type GitHubAgentTrigger,
} from "./github-agent-automation";

export interface GitHubAgentTaskEvent {
  type: string;
  data: Record<string, unknown>;
}

export function projectAgentTaskRunToGitHubTaskSummary(
  task: AgentTaskRunDescriptor,
  input: {
    taskUrl: string;
    status?: GitHubAgentTaskSummary["status"];
    feedback?: Partial<GitHubAgentTaskFeedbackDetails>;
  },
): GitHubAgentTaskSummary {
  return {
    taskId: task.taskRunId,
    workspaceId: task.workspaceId,
    activeRunId: task.activeRunId,
    status: input.status ?? githubAgentTaskStatus(task.status),
    taskUrl: input.taskUrl,
    sessionRecovery: task.sessionRecovery,
    feedback: {
      ...projectAgentTaskFeedback(task),
      ...(input.feedback ?? {}),
    },
  };
}

export function projectGitHubAgentReviewFromTaskEvents(
  events: readonly GitHubAgentTaskEvent[],
  taskUrl: string,
): { summary: string; findings: GitHubAgentReviewFinding[] } {
  const findings: GitHubAgentReviewFinding[] = [];
  const messages: string[] = [];
  for (const event of events.slice(-200)) {
    for (const key of ["summary", "message", "text", "output"] as const) {
      const value = event.data[key];
      if (typeof value === "string") messages.push(redactGitHubAgentText(value));
    }
    const values = Array.isArray(event.data.findings) ? event.data.findings : [];
    for (const value of values) {
      if (!value || typeof value !== "object" || findings.length >= 50) continue;
      const finding = value as Record<string, unknown>;
      if (
        typeof finding.path === "string" &&
        Number.isSafeInteger(finding.line) &&
        Number(finding.line) > 0 &&
        typeof finding.body === "string"
      ) {
        findings.push({
          path: finding.path,
          line: Number(finding.line),
          body: redactGitHubAgentText(finding.body).slice(0, 4_000),
          severity:
            finding.severity === "failure" || finding.severity === "warning"
              ? finding.severity
              : "notice",
        });
      }
    }
  }
  const content = messages.filter(Boolean).join("\n\n").slice(-28_000);
  return {
    summary:
      content || `Review completed without structured narrative output. [Open Task](${taskUrl})`,
    findings,
  };
}

export function renderGitHubAgentPullRequestBody(input: {
  trigger: GitHubAgentTrigger;
  task: AgentTaskRunDescriptor;
  taskUrl: string;
}): string {
  const checks =
    input.task.checks.length > 0
      ? input.task.checks
          .slice(0, 50)
          .map(
            (check) =>
              `- ${check.status === "passed" ? "✅" : "❌"} ${redactGitHubAgentText(check.name).slice(0, 200)}`,
          )
          .join("\n")
      : "- No checks recorded";
  return [
    "## Appaloft Agent Task",
    "",
    `Source: ${input.trigger.thread.kind} #${input.trigger.thread.number}`,
    `[Task details](${input.taskUrl})`,
    "",
    "### Checks",
    checks,
    "",
    "### Diff",
    redactGitHubAgentText(input.task.changes?.stat || "No diff summary recorded.").slice(0, 2_000),
    ...(input.task.developmentPreview
      ? [
          "",
          "### Preview",
          `[Private preview](${input.task.developmentPreview.url}) (expires ${input.task.developmentPreview.expiresAt})`,
        ]
      : []),
    "",
    "This pull request is not automatically merged.",
  ]
    .join("\n")
    .slice(0, 16_000);
}

function projectAgentTaskFeedback(task: AgentTaskRunDescriptor): GitHubAgentTaskFeedbackDetails {
  const failed = ["checks-failed", "failed", "cancelled"].includes(task.status);
  const delivery = task.delivery
    ? {
        kind: "pull-request" as const,
        status: "delivered" as const,
        ...(task.delivery.pullRequestUrl ? { url: task.delivery.pullRequestUrl } : {}),
      }
    : task.status === "delivering"
      ? {
          kind: "pull-request" as const,
          status: "pending" as const,
        }
      : undefined;
  return {
    phase: githubAgentTaskPhase(task.status),
    checks: task.checks.slice(0, 12).map((check) => ({
      name: redactGitHubAgentText(check.name).slice(0, 200),
      status: check.status,
      ...(!check.redacted && check.output
        ? { summary: redactGitHubAgentText(check.output).slice(0, 800) }
        : {}),
    })),
    ...(task.changes
      ? {
          diff: {
            stat: redactGitHubAgentText(task.changes.stat).slice(0, 2_000),
            ...(!task.changes.redacted && task.changes.patch
              ? { patch: redactGitHubAgentText(task.changes.patch).slice(0, 8_000) }
              : {}),
            truncated: task.changes.truncated || (task.changes.patch?.length ?? 0) > 8_000,
            redacted: task.changes.redacted,
          },
        }
      : {}),
    ...(task.developmentPreview
      ? {
          preview: {
            url: task.developmentPreview.url,
            visibility: task.developmentPreview.visibility,
            expiresAt: task.developmentPreview.expiresAt,
          },
        }
      : {}),
    ...(delivery ? { delivery } : {}),
    cleanup: {
      workspace: task.status === "stopped" ? "sleeping" : "active",
      ...(task.developmentPreview ? { preview: "active" as const } : {}),
    },
    ...(failed
      ? {
          failure: {
            ...(task.failure?.phase ? { code: task.failure.phase } : {}),
            summary: redactGitHubAgentText(
              task.failure?.message ??
                (task.status === "checks-failed"
                  ? "One or more required checks failed."
                  : `The Agent Task ended with status ${task.status}.`),
            ).slice(0, 1_200),
            retryable: task.failure?.retryable ?? false,
          },
        }
      : {}),
  };
}

function githubAgentTaskStatus(
  status: AgentTaskRunDescriptor["status"],
): GitHubAgentTaskSummary["status"] {
  if (["running", "finalizing", "delivering"].includes(status)) return "running";
  if (status === "stopped") return "stopped";
  if (["checks-failed", "failed", "cancelled"].includes(status)) return "failed";
  return "completed";
}

function githubAgentTaskPhase(status: AgentTaskRunDescriptor["status"]): string {
  switch (status) {
    case "running":
      return "agent-running";
    case "finalizing":
      return "checks-and-preview";
    case "stopped":
      return "stopped-resumable";
    case "awaiting-approval":
      return "awaiting-delivery";
    case "approved":
    case "delivering":
      return "delivering";
    case "delivered":
      return "delivered";
    case "checks-failed":
      return "checks-failed";
    case "failed":
    case "cancelled":
      return "failed";
  }
}

export function redactGitHubAgentText(value: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) =>
      /(?:api[_-]?key|authorization|credential|password|private[_-]?key|secret|token)\s*[:=]/iu.test(
        line,
      )
        ? "[REDACTED]"
        : line,
    )
    .join("\n")
    .replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/gu, "[REDACTED]");
}
