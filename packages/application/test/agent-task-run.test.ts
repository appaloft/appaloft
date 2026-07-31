import { describe, expect, test } from "bun:test";
import { domainError, err, ok } from "@appaloft/core";
import { TestControlPlaneSecretProtector } from "@appaloft/testkit";
import {
  type AgentTaskRunDependencies,
  AgentTaskRunService,
  createExecutionContext,
  type SandboxAgentRunDescriptor,
  type SandboxExecResult,
} from "../src";

const workspaceId = "sbx_task";
const runtimeId = "sar_task";
const taskRunId = "srun_task";
const now = "2026-07-23T00:00:00.000Z";

function runDescriptor(
  status: string,
  runId = taskRunId,
  context: SandboxAgentRunDescriptor["context"] = { mode: "fresh" },
  failure?: SandboxAgentRunDescriptor["failure"],
): SandboxAgentRunDescriptor {
  return {
    runId,
    runtimeId,
    sandboxId: workspaceId,
    status,
    context,
    ...(failure ? { failure } : {}),
    createdAt: now,
  };
}

function foreground(
  exitCode: number,
  input: { stdout?: string; stderr?: string } = {},
): SandboxExecResult {
  return {
    mode: "foreground",
    frames: [
      ...(input.stdout ? [{ kind: "stdout" as const, sequence: 1, data: input.stdout }] : []),
      ...(input.stderr ? [{ kind: "stderr" as const, sequence: 2, data: input.stderr }] : []),
      { kind: "exit", sequence: 3, exitCode },
    ],
  };
}

function createHarness(
  options: {
    stateProtector?: AgentTaskRunDependencies["stateProtector"];
    existingPullRequest?: boolean;
    unrelatedStagedChanges?: boolean;
  } = {},
) {
  const files = new Map<string, Uint8Array>();
  const queued: Array<{
    kind: string;
    id: string;
    workspaceId: string;
    activeRunId: string;
  }> = [];
  const commands: string[][] = [];
  const createdRunInputs: Array<{
    task: string;
    context: { mode: "fresh" } | { mode: "continue"; parentRunId: string };
    idempotencyKey: string;
  }> = [];
  let runStatus = "running";
  let activeRunId = taskRunId;
  let activeRunContext: SandboxAgentRunDescriptor["context"] = { mode: "fresh" };
  let runFailure: SandboxAgentRunDescriptor["failure"];
  let runSequence = 0;
  let exposureRevoked = false;
  let processTerminated = false;
  const service = new AgentTaskRunService({
    agents: {
      createRun: async (_context, runInput) => {
        createdRunInputs.push({
          task: runInput.task,
          context: runInput.context,
          idempotencyKey: runInput.idempotencyKey,
        });
        activeRunId = runSequence === 0 ? taskRunId : `${taskRunId}_${runSequence + 1}`;
        runSequence += 1;
        activeRunContext = runInput.context;
        runStatus = "running";
        return ok(runDescriptor(runStatus, activeRunId, activeRunContext));
      },
      listRuns: async () =>
        ok({ items: [runDescriptor(runStatus, activeRunId, activeRunContext)] }),
      showRun: async () => ok(runDescriptor(runStatus, activeRunId, activeRunContext, runFailure)),
      cancelRun: async () => {
        runStatus = "cancelled";
        return ok(runDescriptor(runStatus, activeRunId, activeRunContext));
      },
      createSourceArtifact: async () =>
        ok({
          artifactId: "sart_task",
          sandboxId: workspaceId,
          digest: `sha256:${"a".repeat(64)}`,
          sourceRoot: ".",
          workspaceRevision: "rev_task",
          status: "available",
          referenceCount: 0,
          manifest: [],
          createdAt: now,
        }),
      createCandidatePreview: async () =>
        ok({
          previewId: "sprev_task",
          artifactId: "sart_task",
          artifactDigest: `sha256:${"a".repeat(64)}`,
          status: "ready",
          url: "https://candidate.example",
          expiresAt: "2026-07-24T00:00:00.000Z",
          verified: true,
        }),
    },
    sandbox: {
      exec: async (_context, _sandboxId, input) => {
        commands.push([...input.argv]);
        const command = input.argv.join(" ");
        if (input.background) {
          return ok({ mode: "background", processId: "sproc_preview" } as const);
        }
        if (command === "bun test") {
          return ok(foreground(0, { stdout: "passed\ntoken=should-not-persist\n" }));
        }
        if (command.startsWith("git status --short -- .")) {
          return ok(foreground(0, { stdout: " M src/app.ts\n?? src/new.ts\n" }));
        }
        if (command.startsWith("git diff --stat -- .")) {
          return ok(foreground(0, { stdout: "2 files changed\n" }));
        }
        if (command.startsWith("git diff --no-ext-diff -- .")) {
          return ok(
            foreground(0, {
              stdout: "+const feature = true;\n+password=should-not-persist\n",
            }),
          );
        }
        if (command.startsWith("git show-ref --verify --quiet")) {
          return ok(foreground(1));
        }
        if (command.startsWith("git diff --cached --quiet -- .")) {
          return ok(foreground(1));
        }
        if (command === "git diff --cached --quiet") {
          return ok(foreground(options.unrelatedStagedChanges ? 1 : 0));
        }
        if (command === "git rev-parse HEAD") {
          return ok(foreground(0, { stdout: `${"b".repeat(40)}\n` }));
        }
        if (command.includes("gh pr view")) {
          return options.existingPullRequest
            ? ok(foreground(0, { stdout: "https://github.com/acme/web/pull/42\n" }))
            : ok(foreground(1, { stderr: "no pull request" }));
        }
        if (command.includes("gh pr create")) {
          return ok(foreground(0, { stdout: "https://github.com/acme/web/pull/42\n" }));
        }
        return ok(foreground(0));
      },
      readFile: async (_context, _sandboxId, input) => {
        const file = files.get(input.path);
        return file ? ok(file) : err(domainError.notFound("AgentTaskState", input.path));
      },
      writeFile: async (_context, _sandboxId, input) => {
        files.set(input.path, input.content);
        return ok({ path: input.path });
      },
      exposePort: async () =>
        ok({
          exposureId: "sexp_task",
          port: 3000,
          visibility: "private",
          url: "https://preview.example",
          expiresAt: "2026-07-24T00:00:00.000Z",
        }),
      revokePort: async () => {
        exposureRevoked = true;
        return ok(undefined);
      },
      terminateProcess: async () => {
        processTerminated = true;
        return ok(undefined);
      },
      showProcess: async (_context, _sandboxId, processId) => ok({ processId, status: "running" }),
    },
    workQueue: {
      enqueue: async (_context, item) => {
        queued.push(item);
      },
    },
    integrationAuth: {
      getProviderAccessToken: async () => "github-scoped-test-token",
    },
    stateProtector: options.stateProtector ?? new TestControlPlaneSecretProtector(),
    clock: { now: () => now },
  });
  return {
    service,
    files,
    queued,
    commands,
    createdRunInputs,
    setRunStatus: (status: string) => {
      runStatus = status;
    },
    setRunFailure: (failure: NonNullable<SandboxAgentRunDescriptor["failure"]>) => {
      runFailure = failure;
    },
    wasExposureRevoked: () => exposureRevoked,
    wasProcessTerminated: () => processTerminated,
    runStatus: () => runStatus,
  };
}

const cliContext = createExecutionContext({
  entrypoint: "cli",
  actor: { kind: "system", id: "cli", label: "appaloft-cli" },
  requestId: "req_task_cli",
});
const userContext = createExecutionContext({
  entrypoint: "http",
  actor: { kind: "user", id: "usr_reviewer" },
  requestId: "req_task_user",
});

describe("Agent Task Run application workflow", () => {
  test("[AGENT-TASK-RUN-001][AGENT-TASK-RESUME-002] persists protected state and resumes through durable work", async () => {
    const harness = createHarness();
    const created = await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-1",
      checks: [{ name: "tests", argv: ["bun", "test"], required: true }],
      preview: {
        startArgv: ["bun", "run", "dev"],
        port: 3000,
        visibility: "private",
        expiresAt: "2026-07-24T00:00:00.000Z",
      },
      immutableReview: true,
      sourceRoot: ".",
    });
    expect(created.isOk()).toBe(true);
    expect(harness.queued).toEqual([
      {
        kind: "agent-task-run",
        id: taskRunId,
        workspaceId,
        activeRunId: taskRunId,
      },
    ]);
    const persistedText = new TextDecoder().decode(
      [...harness.files.values()][0] ?? new Uint8Array(),
    );
    expect(persistedText).toContain("appaloft-test-secret:v1:");
    expect(persistedText).not.toContain("Implement issue #123");

    const pending = await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    expect(pending.isErr() && pending.error.details?.code).toBe("agent_task_run_pending");

    harness.setRunStatus("completed");
    const finalized = await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    expect(finalized.isOk()).toBe(true);
    if (finalized.isErr()) return;
    expect(finalized.value.status).toBe("awaiting-approval");
    expect(finalized.value.checks[0]).toMatchObject({
      status: "passed",
      redacted: true,
    });
    expect(finalized.value.checks[0]?.output).not.toContain("should-not-persist");
    expect(finalized.value.changes).toMatchObject({
      redacted: true,
      truncated: false,
    });
    expect(finalized.value.changes?.patch).toContain("const feature");
    expect(finalized.value.changes?.patch).not.toContain("should-not-persist");
    expect(finalized.value.developmentPreview?.url).toBe("https://preview.example");
    expect(finalized.value.candidatePreview?.url).toBe("https://candidate.example");
    const evidencePathspec = harness.commands.find(
      (argv) => argv[0] === "git" && argv[1] === "add" && argv[2] === "-N",
    );
    expect(evidencePathspec).toEqual(
      expect.arrayContaining([
        ".",
        ":(exclude).appaloft/**",
        ":(exclude).appaloft-agent/**",
        ":(exclude).appaloft-process-*.pid",
        ":(exclude).config/**",
        ":(exclude).local/**",
      ]),
    );
  });

  test("[AGENT-TASK-APPROVE-007][AGENT-TASK-PR-008] rejects runtime approval and delivers idempotent GitHub PR evidence", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-2",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    harness.setRunStatus("completed");
    await harness.service.reconcile(cliContext, workspaceId, taskRunId);

    const runtimeContext = createExecutionContext({
      entrypoint: "http",
      actor: { kind: "deploy-token", id: "tok_sandbox" },
      requestId: "req_task_runtime",
    });
    const denied = await harness.service.approve(runtimeContext, workspaceId, taskRunId);
    expect(denied.isErr() && denied.error.details?.code).toBe(
      "agent_task_external_approval_required",
    );

    const approved = await harness.service.approve(userContext, workspaceId, taskRunId);
    expect(approved.isOk() && approved.value.approval).toMatchObject({
      actorKind: "user",
      actorId: "usr_reviewer",
    });
    const delivered = await harness.service.deliver(userContext, workspaceId, taskRunId, {
      branch: "agent/issue-123",
      commitMessage: "fix: implement issue 123",
      remote: "origin",
      pullRequest: {
        provider: "github",
        title: "Fix issue #123",
        body: "Implements the requested change.",
        base: "main",
      },
    });
    expect(delivered.isOk()).toBe(true);
    if (delivered.isErr()) return;
    expect(delivered.value.status).toBe("delivered");
    expect(delivered.value.delivery).toMatchObject({
      branch: "agent/issue-123",
      pullRequestUrl: "https://github.com/acme/web/pull/42",
    });
    const deliveredAgain = await harness.service.deliver(userContext, workspaceId, taskRunId, {
      branch: "agent/issue-123",
      commitMessage: "fix: implement issue 123",
      remote: "origin",
    });
    expect(deliveredAgain.isOk() && deliveredAgain.value.status).toBe("delivered");
    expect(harness.commands.filter((argv) => argv.join(" ").includes("gh pr create")).length).toBe(
      1,
    );
    expect(harness.commands).toContainEqual([
      "git",
      "-c",
      "user.name=Appaloft Agent",
      "-c",
      "user.email=agent@appaloft.local",
      "commit",
      "-m",
      "fix: implement issue 123",
    ]);
    expect(harness.commands).toContainEqual(["git", "diff", "--cached", "--quiet"]);
    expect(
      harness.commands.find((argv) => argv[0] === "git" && argv[1] === "add" && argv[2] === "-A"),
    ).toEqual(expect.arrayContaining([".", ":(exclude).appaloft/**"]));
    expect(harness.commands.flat().join(" ")).not.toContain("github-scoped-test-token");
  });

  test("[AGENT-TASK-PR-008] rejects unrelated staged content before task delivery", async () => {
    const harness = createHarness({ unrelatedStagedChanges: true });
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-dirty-index",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    harness.setRunStatus("completed");
    await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    await harness.service.approve(userContext, workspaceId, taskRunId);

    const delivered = await harness.service.deliver(userContext, workspaceId, taskRunId, {
      branch: "agent/issue-123",
      commitMessage: "fix: implement issue 123",
      remote: "origin",
    });

    expect(delivered.isErr() && delivered.error.message).toBe(
      "Agent Task delivery requires a clean staged index",
    );
    expect(
      harness.commands.some((argv) => argv[0] === "git" && argv[1] === "add" && argv[2] === "-A"),
    ).toBe(false);
    expect(harness.commands.some((argv) => argv.includes("commit"))).toBe(false);
  });

  test("[AGENT-TASK-RESUME-002] persists a retryable finalization failure", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-finalization-failure",
      checks: [{ name: "invalid", argv: [], required: true }],
      immutableReview: false,
      sourceRoot: ".",
    });
    harness.setRunStatus("completed");

    const failed = await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    expect(failed.isErr()).toBe(true);
    const shown = await harness.service.show(userContext, workspaceId, taskRunId);
    expect(shown.isOk() && shown.value).toMatchObject({
      status: "finalizing",
      failure: {
        phase: "finalization",
        retryable: true,
      },
    });
  });

  test("[AGENT-FAILURE-011][GH-AUTO-FEEDBACK-013] projects the failed Run diagnostic into the Agent Task", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-agent-failure",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    harness.setRunFailure({
      code: "sandbox_agent_harness_failed",
      summary: "The configured provider rejected the requested model.",
    });
    harness.setRunStatus("failed");

    const failed = await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    expect(failed._unsafeUnwrap()).toMatchObject({
      status: "failed",
      failure: {
        phase: "agent-run",
        message: "The configured provider rejected the requested model.",
        retryable: false,
      },
    });
  });

  test("[AGENT-TASK-PR-008][GH-AUTO-FIX-014] updates a Task-owned pull request when the delivery branch already has one", async () => {
    const harness = createHarness({ existingPullRequest: true });
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-existing-pr",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    harness.setRunStatus("completed");
    await harness.service.reconcile(cliContext, workspaceId, taskRunId);
    await harness.service.approve(userContext, workspaceId, taskRunId);
    const delivered = await harness.service.deliver(userContext, workspaceId, taskRunId, {
      branch: "agent/issue-123",
      commitMessage: "fix: implement issue 123",
      remote: "origin",
      pullRequest: {
        provider: "github",
        title: "Fix issue #123",
        body: "Updated checks and preview evidence.",
        base: "main",
      },
    });

    expect(delivered.isOk()).toBe(true);
    expect(harness.commands.some((argv) => argv.includes("edit"))).toBe(true);
    expect(harness.commands.some((argv) => argv.includes("create"))).toBe(false);
  });

  test("[AGENT-TASK-CANCEL-009] cancels the active Agent Run and exact preview resources", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-3",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    const cancelled = await harness.service.cancel(cliContext, workspaceId, taskRunId);
    expect(cancelled.isOk() && cancelled.value.status).toBe("cancelled");
    expect(harness.wasExposureRevoked()).toBe(false);
    expect(harness.wasProcessTerminated()).toBe(false);
  });

  test("[GH-AUTO-CONTROL-010][GH-AUTO-SESSION-011] stop and native resume preserve the Task and append a Run", async () => {
    const harness = createHarness();
    const created = await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-native-resume",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
      nativeSessionCapable: true,
      nativeAgentSessionRef: "native-session-opaque",
    });
    expect(created._unsafeUnwrap()).toMatchObject({
      taskRunId,
      activeRunId: taskRunId,
      sessionRecovery: "new",
    });

    const stopped = await harness.service.stop(cliContext, workspaceId, taskRunId);
    expect(stopped._unsafeUnwrap()).toMatchObject({
      taskRunId,
      activeRunId: taskRunId,
      status: "stopped",
    });

    const resumed = await harness.service.resume(cliContext, workspaceId, taskRunId);
    expect(resumed._unsafeUnwrap()).toMatchObject({
      taskRunId,
      activeRunId: `${taskRunId}_2`,
      runId: `${taskRunId}_2`,
      status: "running",
      sessionRecovery: "native",
    });
    expect(resumed._unsafeUnwrap().runLineage).toHaveLength(2);
    expect(harness.createdRunInputs[1]).toMatchObject({
      context: { mode: "continue", parentRunId: taskRunId },
    });
    expect(harness.queued).toEqual([
      {
        kind: "agent-task-run",
        id: taskRunId,
        workspaceId,
        activeRunId: taskRunId,
      },
      {
        kind: "agent-task-run",
        id: taskRunId,
        workspaceId,
        activeRunId: `${taskRunId}_2`,
      },
    ]);
  });

  test("[GH-AUTO-SESSION-011] fallback steer injects bounded evidence and rejects credential references", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-fallback-steer",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });

    const steered = await harness.service.steer(
      cliContext,
      workspaceId,
      taskRunId,
      "keep the existing API compatible",
    );
    expect(steered._unsafeUnwrap()).toMatchObject({
      taskRunId,
      activeRunId: `${taskRunId}_2`,
      sessionRecovery: "fallback",
      steerHistory: [
        {
          instruction: "keep the existing API compatible",
          runId: `${taskRunId}_2`,
        },
      ],
    });
    expect(harness.createdRunInputs[1]?.task).toContain("cannot prove native session resume");
    expect(harness.createdRunInputs[1]?.task).toContain("keep the existing API compatible");
    expect(harness.queued).toEqual([
      {
        kind: "agent-task-run",
        id: taskRunId,
        workspaceId,
        activeRunId: taskRunId,
      },
      {
        kind: "agent-task-run",
        id: taskRunId,
        workspaceId,
        activeRunId: `${taskRunId}_2`,
      },
    ]);

    const rejected = await harness.service.steer(
      cliContext,
      workspaceId,
      taskRunId,
      "use credentialId=conn_private",
    );
    expect(rejected.isErr()).toBe(true);
    expect(harness.createdRunInputs).toHaveLength(2);
  });

  test("[AGENT-TASK-RUN-001] cancels the Agent Run when initial protected state cannot persist", async () => {
    const unavailable: AgentTaskRunDependencies["stateProtector"] = {
      protect: async () => err(domainError.infra("Control-plane secret keyring is unavailable")),
      unprotect: async () => err(domainError.infra("Control-plane secret keyring is unavailable")),
    };
    const harness = createHarness({ stateProtector: unavailable });
    const created = await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Do not leave an orphan run",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-protection-failure",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });

    expect(created.isErr()).toBe(true);
    expect(harness.runStatus()).toBe("cancelled");
    expect(harness.queued).toHaveLength(0);
  });

  test("fails closed when sandbox state is tampered", async () => {
    const harness = createHarness();
    await harness.service.create(cliContext, {
      workspaceId,
      runtimeId,
      task: "Implement issue #123",
      runContext: { mode: "fresh" },
      idempotencyKey: "task-create-4",
      checks: [],
      immutableReview: false,
      sourceRoot: ".",
    });
    const path = [...harness.files.keys()][0];
    if (path) harness.files.set(path, new TextEncoder().encode('{"schemaVersion":"fake"}'));
    const shown = await harness.service.show(userContext, workspaceId, taskRunId);
    expect(shown.isErr()).toBe(true);
  });
});
