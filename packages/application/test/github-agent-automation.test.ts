import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { domainError, err, ok } from "@appaloft/core";

import {
  createExecutionContext,
  type GitHubAgentAuthorizationPort,
  GitHubAgentAutomationService,
  type GitHubAgentFeedbackPort,
  type GitHubAgentTaskPort,
  type GitHubAgentTrigger,
  InMemoryGitHubAgentAutomationStore,
  resolveGitHubAgentIntent,
} from "../src";

function trigger(
  input: Partial<GitHubAgentTrigger> & Pick<GitHubAgentTrigger, "deliveryId">,
  includeDefaultCommand = true,
): GitHubAgentTrigger {
  const { deliveryId, ...overrides } = input;
  return {
    provider: "github",
    sourceEventId: `sevt_${deliveryId}`,
    event: "issue_comment",
    action: "created",
    deliveryId,
    installationId: "98765",
    repository: { id: "123456", fullName: "appaloft/agent-sandbox-smoke" },
    sender: { id: "303", loginSnapshot: "octocat", typeSnapshot: "User" },
    thread: { kind: "issue", number: 41 },
    ...(includeDefaultCommand
      ? { command: { kind: "fix", instruction: "this and create a preview" } as const }
      : {}),
    ...overrides,
  };
}

function allowedAuthorization(): GitHubAgentAuthorizationPort {
  return {
    authorize: async (_context, input) =>
      ok({
        allowed: true,
        authorizationKind: "task-execution",
        actorSnapshot: {
          githubUserId: input.trigger.sender.id,
          appaloftUserId: "user_303",
          organizationId: "org_test",
          membershipRole: "member",
          repositoryPermission: input.intent.mode === "write" ? "push" : "pull",
          externalCollaborator: false,
        },
        repositoryBindingId: "grb_test",
        projectId: "project_test",
        ...(input.intent.source === "automation" ? { ruleId: "gar_test" } : {}),
        agentProfileId: input.intent.profile ?? "agp_opencode",
        workspaceProfileInstallationId: "awpi_opencode",
        sandboxTemplateId: "sbt_opencode",
        serverPoolId: "pool_test",
        credentialConnectionId: "conn_agent",
        mode: input.intent.mode,
        maximumRuntimeSeconds: 3_600,
        maximumRetries: 2,
        previewPolicy: input.intent.action === "fix" ? "private" : "disabled",
        pullRequestDeliveryPolicy:
          input.intent.action === "review" ? "review-only" : "create-or-update",
        authorizationReason: "authorized",
      }),
  };
}

function taskPort() {
  const calls: string[] = [];
  const port: GitHubAgentTaskPort = {
    startOrResume: async (_context, input) => {
      calls.push(`start:${input.intent.action}:${input.trigger.thread.number}`);
      return ok({
        taskId: "task_1",
        workspaceId: "workspace_1",
        activeRunId: "run_1",
        status: "queued",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "native",
      });
    },
    status: async () =>
      ok({
        taskId: "task_1",
        workspaceId: "workspace_1",
        activeRunId: "run_1",
        status: "running",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "native",
      }),
    steer: async (_context, input) => {
      calls.push(`steer:${input.taskId}:${input.instruction}`);
      return ok({
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        activeRunId: "run_2",
        status: "running",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "native",
      });
    },
    stop: async (_context, input) => {
      calls.push(`stop:${input.taskId}`);
      return ok({
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        activeRunId: "run_1",
        status: "stopped",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "native",
      });
    },
    resume: async (_context, input) => {
      calls.push(`resume:${input.taskId}`);
      return ok({
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        activeRunId: "run_2",
        status: "running",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "fallback",
      });
    },
    replace: async (_context, input) => {
      calls.push(`replace:${input.current.taskId}:${input.profile}`);
      return ok({
        taskId: "task_2",
        workspaceId: "workspace_2",
        activeRunId: "run_3",
        status: "queued",
        taskUrl: "https://appaloft.test/tasks/task_2",
        sessionRecovery: "new",
      });
    },
    cleanup: async (_context, input) => {
      calls.push(`cleanup:${input.taskId}`);
      return ok({
        taskId: input.taskId,
        workspaceId: input.workspaceId,
        status: "cleaned",
        taskUrl: "https://appaloft.test/tasks/task_1",
        sessionRecovery: "none",
      });
    },
  };
  return { port, calls };
}

function feedbackPort() {
  const calls: string[] = [];
  const port: GitHubAgentFeedbackPort = {
    acknowledge: async (_context, input) => {
      calls.push(`ack:${input.trigger.deliveryId}`);
      return ok({ reactionId: "reaction_1" });
    },
    update: async (_context, input) => {
      calls.push(`update:${input.task.taskId}:${input.task.status}`);
      return ok({
        reactionId: "reaction_1",
        statusCommentId: "comment_1",
        checkRunId: "check_1",
      });
    },
    reject: async (_context, input) => {
      calls.push(`reject:${input.reasonCode}`);
      return ok({ statusCommentId: "comment_denied" });
    },
  };
  return { port, calls };
}

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_github_agent_automation",
});

describe("GitHub Agent automation service", () => {
  test("[GH-AUTO-RULE-006] automated rules preserve the bounded Issue or PR request", () => {
    const request = {
      title: "Keep the status API compatible",
      body: "Add a regression test and preserve the existing response shape.",
    };
    const labelIntent = resolveGitHubAgentIntent(
      trigger(
        {
          deliveryId: "delivery_label_context",
          event: "issues",
          action: "labeled",
          label: { id: "77", name: "appaloft:fix" },
          threadRequest: request,
        },
        false,
      ),
    );
    const readyIntent = resolveGitHubAgentIntent(
      trigger(
        {
          deliveryId: "delivery_ready_context",
          event: "pull_request",
          action: "ready_for_review",
          thread: { kind: "pull-request", number: 42 },
          pullRequest: {
            number: 42,
            headSha: "a".repeat(40),
            baseRef: "main",
            headRepositoryId: "123456",
            headRepositoryFullName: "appaloft/agent-sandbox-smoke",
            fork: false,
          },
          threadRequest: request,
        },
        false,
      ),
    );

    expect(labelIntent).toEqual({
      action: "fix",
      source: "automation",
      mode: "write",
      instruction:
        "GitHub request: Keep the status API compatible\n\nAdd a regression test and preserve the existing response shape.",
    });
    expect(readyIntent).toEqual({
      action: "review",
      source: "automation",
      mode: "review-only",
      instruction:
        "GitHub request: Keep the status API compatible\n\nAdd a regression test and preserve the existing response shape.",
    });
  });

  test("[GH-AUTO-DELIVERY-007][GH-AUTO-TASK-009] duplicate delivery returns the first task without duplicate compute or feedback", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      sourceResolver: {
        resolve: async (_context, value) =>
          ok({
            ...value.trigger,
            source: { ref: "main", headSha: "a".repeat(40) },
          }),
      },
      tasks: tasks.port,
      feedback: feedback.port,
    });
    const input = trigger({ deliveryId: "delivery_1" });

    const first = await service.handle(context, input);
    const duplicate = await service.handle(context, input);

    expect(first._unsafeUnwrap()).toMatchObject({
      status: "accepted",
      intent: { action: "fix", source: "manual", mode: "write" },
      authorization: {
        authorizationKind: "task-execution",
        workspaceProfileInstallationId: "awpi_opencode",
        sandboxTemplateId: "sbt_opencode",
        serverPoolId: "pool_test",
        maximumRuntimeSeconds: 3_600,
        maximumRetries: 2,
        previewPolicy: "private",
        pullRequestDeliveryPolicy: "create-or-update",
      },
      task: { taskId: "task_1", workspaceId: "workspace_1" },
      trigger: {
        deliveryId: "delivery_1",
        source: { ref: "main", headSha: "a".repeat(40) },
      },
    });
    expect(duplicate._unsafeUnwrap()).toEqual({
      ...first._unsafeUnwrap(),
      duplicate: true,
    });
    expect(tasks.calls).toEqual(["start:fix:41"]);
    expect(feedback.calls).toEqual(["ack:delivery_1", "update:task_1:queued"]);
  });

  test("[GH-AUTO-AUTHZ-008] a denied fork or missing credential records an actionable denial with zero compute", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const deniedAuthorization: GitHubAgentAuthorizationPort = {
      authorize: async () =>
        ok({
          allowed: false,
          reasonCode: "agent_credential_missing",
          message: "Connect an Agent credential before starting this task.",
          connectAgentUrl: "https://appaloft.test/settings/agent-credentials",
          actorSnapshot: {
            githubUserId: "303",
            organizationId: "org_test",
            externalCollaborator: false,
          },
        }),
    };
    const service = new GitHubAgentAutomationService({
      store,
      authorization: deniedAuthorization,
      tasks: tasks.port,
      feedback: feedback.port,
    });

    const denied = await service.handle(context, trigger({ deliveryId: "delivery_denied" }));
    const fork = await service.handle(
      context,
      trigger({
        deliveryId: "delivery_fork",
        thread: { kind: "pull-request", number: 42 },
        pullRequest: {
          number: 42,
          headSha: "abcdef",
          baseRef: "main",
          headRepositoryId: "999999",
          headRepositoryFullName: "fork-user/repo",
          fork: true,
        },
        command: { kind: "review" },
      }),
    );

    expect(denied._unsafeUnwrap()).toMatchObject({
      status: "denied",
      reasonCode: "agent_credential_missing",
      connectAgentUrl: "https://appaloft.test/settings/agent-credentials",
    });
    expect(fork._unsafeUnwrap()).toMatchObject({
      status: "denied",
      reasonCode: "github_fork_pull_request_denied",
    });
    expect(tasks.calls).toEqual([]);
    expect(feedback.calls).toEqual([
      "reject:agent_credential_missing",
      "reject:github_fork_pull_request_denied",
    ]);
  });

  test("[GH-AUTO-FEEDBACK-013][GH-AUTO-IDEMPOTENCY-003][GH-AUTO-TASK-010] records one bounded failure after task start", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const taskCalls: string[] = [];
    const feedbackCalls: Array<Record<string, unknown>> = [];
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: {
        ...taskPort().port,
        startOrResume: async () => {
          taskCalls.push("start");
          return err(
            domainError.conflict("Workspace placement is unavailable", {
              code: "workspace_placement_unavailable",
            }),
          );
        },
      },
      feedback: {
        acknowledge: async () => ok({ reactionId: "reaction_start_failure" }),
        update: async () => ok({}),
        reject: async (_context, input) => {
          feedbackCalls.push({
            reasonCode: input.reasonCode,
            message: input.message,
            existing: input.existing,
          });
          return ok({
            ...input.existing,
            statusCommentId: "comment_start_failure",
          });
        },
      },
    });
    const input = trigger({ deliveryId: "delivery_start_failure" });

    const failed = await service.handle(context, input);
    const duplicate = await service.handle(context, input);

    expect(failed._unsafeUnwrap()).toMatchObject({
      status: "denied",
      reasonCode: "workspace_placement_unavailable",
      message: "Workspace placement is unavailable",
      feedback: {
        reactionId: "reaction_start_failure",
        statusCommentId: "comment_start_failure",
      },
    });
    expect(duplicate._unsafeUnwrap()).toMatchObject({
      status: "denied",
      duplicate: true,
      reasonCode: "workspace_placement_unavailable",
    });
    expect(taskCalls).toEqual(["start"]);
    expect(feedbackCalls).toEqual([
      {
        reasonCode: "workspace_placement_unavailable",
        message: "Workspace placement is unavailable",
        existing: { reactionId: "reaction_start_failure" },
      },
    ]);
  });

  test("[GH-AUTO-BOUNDARY-021][GH-AUTO-AUTHZ-008] resolves PR identity and source before authorization or compute", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    let authorizationCalls = 0;
    const service = new GitHubAgentAutomationService({
      store,
      authorization: {
        authorize: async () => {
          authorizationCalls += 1;
          return allowedAuthorization().authorize(context, {
            trigger: trigger({ deliveryId: "unused" }),
            intent: { action: "review", source: "manual", mode: "review-only" },
          });
        },
      },
      sourceResolver: {
        resolve: async (_context, input) =>
          ok({
            ...input.trigger,
            pullRequest: {
              number: 42,
              headSha: "a".repeat(40),
              baseRef: "main",
              headRepositoryId: "999999",
              headRepositoryFullName: "outside/fork",
              fork: true,
            },
            source: { ref: "a".repeat(40), headSha: "a".repeat(40) },
          }),
      },
      tasks: tasks.port,
      feedback: feedback.port,
    });

    const result = await service.handle(
      context,
      trigger({
        deliveryId: "delivery_hydrated_fork",
        thread: { kind: "pull-request", number: 42 },
        command: { kind: "review" },
      }),
    );

    expect(result._unsafeUnwrap()).toMatchObject({
      status: "denied",
      reasonCode: "github_fork_pull_request_denied",
    });
    expect(authorizationCalls).toBe(0);
    expect(tasks.calls).toEqual([]);
  });

  test("[GH-AUTO-REVIEW-015] automatic review executes once per repository, PR, head, and rule", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: tasks.port,
      feedback: feedback.port,
    });
    const ready = trigger(
      {
        deliveryId: "delivery_ready",
        event: "pull_request",
        action: "ready_for_review",
        thread: { kind: "pull-request", number: 42 },
        pullRequest: {
          number: 42,
          headSha: "abcdef",
          baseRef: "main",
          headRepositoryId: "123456",
          headRepositoryFullName: "appaloft/agent-sandbox-smoke",
          fork: false,
        },
      },
      false,
    );
    const synchronize = { ...ready, deliveryId: "delivery_sync", action: "synchronize" as const };

    const first = await service.handle(context, ready);
    const second = await service.handle(context, synchronize);

    expect(first._unsafeUnwrap().status).toBe("accepted");
    expect(second._unsafeUnwrap()).toMatchObject({
      status: "ignored",
      reasonCode: "github_review_execution_duplicate",
    });
    expect(tasks.calls).toEqual(["start:review:42"]);
  });

  test("[GH-AUTO-CONTROL-010][GH-AUTO-SESSION-011] steer and resume target the same current Task and report fallback truthfully", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: tasks.port,
      feedback: feedback.port,
    });
    await service.handle(context, trigger({ deliveryId: "delivery_fix" }));

    const steered = await service.handle(
      context,
      trigger({
        deliveryId: "delivery_steer",
        command: { kind: "steer", instruction: "keep the existing API compatible" },
      }),
    );
    const resumed = await service.handle(
      context,
      trigger({ deliveryId: "delivery_resume", command: { kind: "resume" } }),
    );

    expect(steered._unsafeUnwrap()).toMatchObject({
      task: { taskId: "task_1", workspaceId: "workspace_1", activeRunId: "run_2" },
    });
    expect(resumed._unsafeUnwrap()).toMatchObject({
      task: {
        taskId: "task_1",
        workspaceId: "workspace_1",
        sessionRecovery: "fallback",
      },
    });
    expect(tasks.calls).toContain("steer:task_1:keep the existing API compatible");
    expect(tasks.calls).toContain("resume:task_1");
  });

  test("[GH-AUTO-FEEDBACK-013][GH-AUTO-CONTROL-010] control deliveries reuse the current Task feedback ids", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const updates: Array<{
      deliveryId: string;
      existing: Record<string, string>;
    }> = [];
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: tasks.port,
      feedback: {
        acknowledge: async (_executionContext, input) =>
          ok({ reactionId: `reaction_${input.trigger.deliveryId}` }),
        update: async (_executionContext, input) => {
          updates.push({
            deliveryId: input.trigger.deliveryId,
            existing: { ...(input.existing ?? {}) },
          });
          return ok({
            ...(input.existing ?? {}),
            statusCommentId: input.existing?.statusCommentId ?? "comment_1",
            checkRunId: input.existing?.checkRunId ?? "check_1",
          });
        },
        reject: async () => ok({}),
      },
    });

    await service.handle(context, trigger({ deliveryId: "delivery_fix_continuity" }));
    await service.handle(
      context,
      trigger({
        deliveryId: "delivery_steer_continuity",
        command: { kind: "steer", instruction: "preserve the public API" },
      }),
    );
    await service.handle(
      context,
      trigger({ deliveryId: "delivery_stop_continuity", command: { kind: "stop" } }),
    );
    await service.handle(
      context,
      trigger({ deliveryId: "delivery_resume_continuity", command: { kind: "resume" } }),
    );

    expect(updates).toEqual([
      {
        deliveryId: "delivery_fix_continuity",
        existing: { reactionId: "reaction_delivery_fix_continuity" },
      },
      {
        deliveryId: "delivery_steer_continuity",
        existing: {
          reactionId: "reaction_delivery_steer_continuity",
          statusCommentId: "comment_1",
          checkRunId: "check_1",
        },
      },
      {
        deliveryId: "delivery_stop_continuity",
        existing: {
          reactionId: "reaction_delivery_stop_continuity",
          statusCommentId: "comment_1",
          checkRunId: "check_1",
        },
      },
      {
        deliveryId: "delivery_resume_continuity",
        existing: {
          reactionId: "reaction_delivery_resume_continuity",
          statusCommentId: "comment_1",
          checkRunId: "check_1",
        },
      },
    ]);
  });

  test("[GH-AUTO-FEEDBACK-013][GH-AUTO-TASK-009] a newly selected Task does not inherit prior Task feedback ids", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    let startCount = 0;
    const updates: Array<{
      taskId: string;
      existing: Record<string, string>;
    }> = [];
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: {
        ...taskPort().port,
        startOrResume: async () => {
          startCount += 1;
          const suffix = String(startCount);
          return ok({
            taskId: `task_${suffix}`,
            workspaceId: `workspace_${suffix}`,
            activeRunId: `run_${suffix}`,
            status: "queued",
            taskUrl: `https://appaloft.test/tasks/task_${suffix}`,
            sessionRecovery: "new",
          });
        },
      },
      feedback: {
        acknowledge: async (_executionContext, input) =>
          ok({ reactionId: `reaction_${input.trigger.deliveryId}` }),
        update: async (_executionContext, input) => {
          updates.push({
            taskId: input.task.taskId,
            existing: { ...(input.existing ?? {}) },
          });
          return ok({
            ...(input.existing ?? {}),
            statusCommentId: `comment_${input.task.taskId}`,
            checkRunId: `check_${input.task.taskId}`,
          });
        },
        reject: async () => ok({}),
      },
    });

    await service.handle(context, trigger({ deliveryId: "delivery_first_task" }));
    await service.handle(context, trigger({ deliveryId: "delivery_second_task" }));

    expect(updates).toEqual([
      {
        taskId: "task_1",
        existing: { reactionId: "reaction_delivery_first_task" },
      },
      {
        taskId: "task_2",
        existing: { reactionId: "reaction_delivery_second_task" },
      },
    ]);
  });

  test("[GH-AUTO-CLEANUP-018] pull request close cleans only the linked current Task", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: tasks.port,
      feedback: feedback.port,
    });
    await service.handle(
      context,
      trigger({
        deliveryId: "delivery_pr_fix",
        thread: { kind: "pull-request", number: 42 },
        pullRequest: {
          number: 42,
          headSha: "abcdef",
          baseRef: "main",
          headRepositoryId: "123456",
          headRepositoryFullName: "appaloft/agent-sandbox-smoke",
          fork: false,
        },
      }),
    );

    const cleaned = await service.handle(
      context,
      trigger(
        {
          deliveryId: "delivery_pr_closed",
          event: "pull_request",
          action: "closed",
          thread: { kind: "pull-request", number: 42 },
          pullRequest: {
            number: 42,
            headSha: "abcdef",
            baseRef: "main",
            headRepositoryId: "123456",
            headRepositoryFullName: "appaloft/agent-sandbox-smoke",
            fork: false,
          },
        },
        false,
      ),
    );

    expect(cleaned._unsafeUnwrap()).toMatchObject({
      status: "accepted",
      task: { taskId: "task_1", status: "cleaned" },
    });
    expect(tasks.calls).toContain("cleanup:task_1");
  });

  test("[GH-AUTO-FIX-014][GH-AUTO-CLEANUP-018] pull request close cleans a related Issue Task without making it current", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: allowedAuthorization(),
      tasks: tasks.port,
      feedback: feedback.port,
    });
    const issueTask = {
      taskId: "task_issue_fix",
      workspaceId: "workspace_issue_fix",
      activeRunId: "run_issue_fix",
      status: "completed" as const,
      taskUrl: "https://appaloft.test/tasks/task_issue_fix",
      sessionRecovery: "native" as const,
    };
    expect(
      await store.linkPullRequestTask(context, {
        repositoryId: "123456",
        pullRequestNumber: 84,
        task: issueTask,
      }),
    ).toBe(true);
    expect(
      await store.linkPullRequestTask(context, {
        repositoryId: "123456",
        pullRequestNumber: 84,
        task: {
          ...issueTask,
          taskId: "task_conflict",
          workspaceId: "workspace_conflict",
        },
      }),
    ).toBe(false);

    const ordinaryReview = await service.handle(
      context,
      trigger({
        deliveryId: "delivery_related_review",
        thread: { kind: "pull-request", number: 84 },
        command: { kind: "review" },
        pullRequest: {
          number: 84,
          headSha: "a".repeat(40),
          baseRef: "main",
          headRepositoryId: "123456",
          headRepositoryFullName: "appaloft/agent-sandbox-smoke",
          fork: false,
        },
      }),
    );
    expect(ordinaryReview._unsafeUnwrap()).toMatchObject({
      status: "accepted",
      task: { taskId: "task_1" },
    });
    expect(tasks.calls).toContain("start:review:84");

    const cleaned = await service.handle(
      context,
      trigger(
        {
          deliveryId: "delivery_related_closed",
          event: "pull_request",
          action: "closed",
          thread: { kind: "pull-request", number: 84 },
          pullRequest: {
            number: 84,
            headSha: "a".repeat(40),
            baseRef: "main",
            headRepositoryId: "123456",
            headRepositoryFullName: "appaloft/agent-sandbox-smoke",
            fork: false,
          },
        },
        false,
      ),
    );

    expect(cleaned._unsafeUnwrap()).toMatchObject({
      status: "accepted",
      task: { taskId: "task_issue_fix", status: "cleaned" },
    });
    expect(tasks.calls).toContain("cleanup:task_1");
    expect(tasks.calls).toContain("cleanup:task_issue_fix");
  });

  test("[GH-AUTO-BOUNDARY-021] lifecycle cleanup authorization needs no fake Agent execution references", async () => {
    const store = new InMemoryGitHubAgentAutomationStore();
    const tasks = taskPort();
    const feedback = feedbackPort();
    const executionAuthorization = allowedAuthorization();
    const service = new GitHubAgentAutomationService({
      store,
      authorization: {
        authorize: async (executionContext, input) =>
          input.intent.action === "cleanup"
            ? ok({
                allowed: true,
                authorizationKind: "lifecycle-cleanup",
                actorSnapshot: {
                  githubUserId: input.trigger.sender.id,
                  organizationId: "org_test",
                  externalCollaborator: false,
                },
                repositoryBindingId: "grb_test",
                projectId: "project_test",
                authorizationReason: "authorized-retention-cleanup",
              })
            : executionAuthorization.authorize(executionContext, input),
      },
      tasks: tasks.port,
      feedback: feedback.port,
    });
    const pullRequest = {
      number: 42,
      headSha: "abcdef",
      baseRef: "main",
      headRepositoryId: "123456",
      headRepositoryFullName: "appaloft/agent-sandbox-smoke",
      fork: false,
    };
    await service.handle(
      context,
      trigger({
        deliveryId: "delivery_boundary_fix",
        thread: { kind: "pull-request", number: 42 },
        pullRequest,
      }),
    );

    const cleaned = await service.handle(
      context,
      trigger(
        {
          deliveryId: "delivery_boundary_closed",
          event: "pull_request",
          action: "closed",
          thread: { kind: "pull-request", number: 42 },
          pullRequest,
        },
        false,
      ),
    );

    expect(cleaned._unsafeUnwrap()).toMatchObject({
      status: "accepted",
      intent: { action: "cleanup", source: "lifecycle" },
      authorization: {
        authorizationKind: "lifecycle-cleanup",
        repositoryBindingId: "grb_test",
        projectId: "project_test",
      },
      task: { status: "cleaned" },
    });
    expect(JSON.stringify(cleaned._unsafeUnwrap())).not.toContain(
      "lifecycle-cleanup:no-credential",
    );
  });
});
