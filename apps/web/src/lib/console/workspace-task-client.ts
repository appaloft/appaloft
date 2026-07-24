import { orpcClient } from "$lib/orpc";

export type BrowserAgentTaskResult = {
  schemaVersion: "agent-task-run/v1";
  taskRunId: string;
  runId: string;
  runtimeId: string;
  workspaceId: string;
  status: string;
  checks: {
    name: string;
    required: boolean;
    status: "passed" | "failed";
    exitCode: number;
    output: string;
    truncated: boolean;
    redacted: boolean;
  }[];
  changes?: {
    status: string;
    stat: string;
    patch: string;
    truncated: boolean;
    redacted: boolean;
  };
  developmentPreview?: {
    exposureId: string;
    port: number;
    visibility: "private" | "organization" | "public";
    url: string;
    expiresAt: string;
  };
  delivery?: {
    remote: string;
    branch: string;
    commitSha: string;
    pullRequestUrl?: string;
  };
};

export type BrowserAgentRunEvent = {
  eventId: string;
  runId: string;
  sequence: number;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
};

export type BrowserWorkspaceTasks = {
  run(input: {
    task: string;
    context?: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
    idempotencyKey?: string;
    checks?: { name: string; argv: readonly string[]; required?: boolean }[];
    preview?: {
      startArgv: readonly string[];
      port: number;
      visibility?: "private" | "organization" | "public";
      expiresAt?: string;
    };
    immutableReview?: boolean;
    sourceRoot?: string;
  }): Promise<BrowserAgentTaskResult>;
  list(): Promise<{ readonly items: readonly BrowserAgentTaskResult[] }>;
  show(taskRunId: string): Promise<BrowserAgentTaskResult>;
  resume(taskRunId: string): Promise<BrowserAgentTaskResult>;
  cancel(taskRunId: string): Promise<BrowserAgentTaskResult>;
  approve(taskRunId: string): Promise<BrowserAgentTaskResult>;
  events(
    runId: string,
    input?: { afterSequence?: number; limit?: number },
  ): Promise<{
    readonly items: readonly BrowserAgentRunEvent[];
    readonly nextSequence: number | null;
  }>;
  deliver(
    taskRunId: string,
    input: {
      branch: string;
      commitMessage: string;
      remote?: string;
      pullRequest?: { provider: "github"; title: string; body?: string; base?: string };
    },
  ): Promise<BrowserAgentTaskResult>;
};

export function createBrowserWorkspaceTasks(
  workspaceId: string,
  runtimeId: string,
): BrowserWorkspaceTasks {
  return {
    run: (input) =>
      orpcClient.sandboxes.agentTasks.create({
        workspaceId,
        runtimeId,
        task: input.task,
        runContext: input.context ?? { mode: "fresh" },
        idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
        checks:
          input.checks?.map((check) => ({
            name: check.name,
            argv: [...check.argv],
            required: check.required !== false,
          })) ?? [],
        ...(input.preview
          ? {
              preview: {
                startArgv: [...input.preview.startArgv],
                port: input.preview.port,
                visibility: input.preview.visibility ?? "private",
                ...(input.preview.expiresAt ? { expiresAt: input.preview.expiresAt } : {}),
              },
            }
          : {}),
        immutableReview: input.immutableReview === true,
        sourceRoot: input.sourceRoot?.trim() || ".",
      }) as Promise<BrowserAgentTaskResult>,
    list: () =>
      orpcClient.sandboxes.agentTasks.list({
        workspaceId,
        runtimeId,
      }) as unknown as Promise<{ readonly items: readonly BrowserAgentTaskResult[] }>,
    show: (taskRunId) =>
      orpcClient.sandboxes.agentTasks.show({
        workspaceId,
        taskRunId,
      }) as Promise<BrowserAgentTaskResult>,
    resume: (taskRunId) =>
      orpcClient.sandboxes.agentTasks.resume({
        workspaceId,
        taskRunId,
      }) as Promise<BrowserAgentTaskResult>,
    cancel: (taskRunId) =>
      orpcClient.sandboxes.agentTasks.cancel({
        workspaceId,
        taskRunId,
      }) as Promise<BrowserAgentTaskResult>,
    approve: (taskRunId) =>
      orpcClient.sandboxes.agentTasks.approve({
        workspaceId,
        taskRunId,
      }) as Promise<BrowserAgentTaskResult>,
    events: (runId, input = {}) =>
      orpcClient.sandboxes.agents.runs.events({
        runId,
        ...(input.afterSequence !== undefined ? { afterSequence: input.afterSequence } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      }),
    deliver: (taskRunId, input) =>
      orpcClient.sandboxes.agentTasks.deliver({
        workspaceId,
        taskRunId,
        branch: input.branch,
        commitMessage: input.commitMessage,
        remote: input.remote ?? "origin",
        ...(input.pullRequest ? { pullRequest: input.pullRequest } : {}),
      }) as Promise<BrowserAgentTaskResult>,
  };
}
