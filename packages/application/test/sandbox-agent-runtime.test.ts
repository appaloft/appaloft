import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { ok } from "@appaloft/core";
import {
  createExecutionContext,
  InMemorySandboxAgentDeliveryRepository,
  SandboxAgentDeliveryService,
  type SandboxAgentHarness,
  SandboxAgentHarnessRegistry,
} from "../src";

const context = createExecutionContext({
  entrypoint: "http",
  requestId: "req_agent_test",
  tenant: { tenantId: "tenant_a", organizationId: "org_a" },
});

function fixture(
  options: {
    harness?: SandboxAgentHarness;
    readProof?: () => Promise<{ verdict: "verified" | "failed" | "pending"; reasonCode?: string }>;
  } = {},
) {
  const counters = { resources: 0, deployments: 0 };
  const harness: SandboxAgentHarness = options.harness ?? {
    key: "fake",
    templateId: "aht_fake_1",
    version: "1.0.0",
    templateDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    async execute(input) {
      return {
        events: [
          { type: "message", data: { text: `worked:${input.task}` } },
          { type: "tool", data: { command: "bun test", apiToken: "must-redact" } },
        ],
        outcomeDigest: "sha256:run-complete",
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
    async cancel() {},
  };
  const queued: Array<{ kind: string; id: string }> = [];
  const service = new SandboxAgentDeliveryService({
    repository: new InMemorySandboxAgentDeliveryRepository(),
    sandboxReader: {
      async show(_context, sandboxId) {
        return {
          sandboxId,
          status: "ready",
          workspaceRevision: "rev_1",
          source: { kind: "template", templateId: "aht_fake_1" },
        };
      },
    },
    harnessRegistry: new SandboxAgentHarnessRegistry([harness]),
    workQueue: {
      async enqueue(_context, item) {
        queued.push(item);
      },
    },
    artifactCapture: {
      async capture() {
        return {
          digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          workspaceRevision: "rev_1",
          storeReference: "artifact://sha256/demo",
          entries: [{ path: "index.html", digest: "sha256:file", sizeBytes: 12, mode: "file" }],
        };
      },
      async delete() {},
    },
    previewProvider: {
      async create(_context, input) {
        return {
          previewId: input.previewId,
          artifactDigest: input.artifactDigest,
          status: "ready",
          url: "https://candidate.example.test",
          expiresAt: "2026-07-20T02:00:00.000Z",
          verified: true,
        };
      },
      async delete() {},
    },
    promotionTarget: {
      async createResource() {
        counters.resources += 1;
        return { resourceId: "res_demo" };
      },
      async createDeployment() {
        counters.deployments += 1;
        return {
          deploymentId:
            counters.deployments === 1 ? "dep_demo" : `dep_demo_${counters.deployments}`,
        };
      },
      async readProof() {
        return options.readProof ? options.readProof() : { verdict: "verified" };
      },
    },
    taskProtector: {
      async protect(_context, plaintext) {
        return ok({
          envelope: `test:${Buffer.from(plaintext).toString("base64url")}`,
          keyId: "test",
        });
      },
      async unprotect(_context, envelope) {
        return ok({
          plaintext: Buffer.from(envelope.slice("test:".length), "base64url").toString("utf8"),
          keyId: "test",
        });
      },
    },
    clock: { now: () => "2026-07-20T00:00:00.000Z" },
    idGenerator: { next: (prefix) => `${prefix}_test` },
  });
  return { service, queued, counters };
}

describe("SandboxAgentDeliveryService", () => {
  test("[PROMOTION-SCOPE-001] runtime-style deploy tokens cannot resolve external intent", async () => {
    const { service } = fixture();
    const runtimeIdentity = createExecutionContext({
      entrypoint: "http",
      requestId: "req_runtime_identity",
      actor: { kind: "deploy-token", id: "runtime_token" },
      tenant: { tenantId: "tenant_a" },
    });
    const promotion = await service.acceptPromotion(runtimeIdentity, {
      promotionId: "sprom_hidden",
      expectedArtifactDigest: `sha256:${"a".repeat(64)}`,
      idempotencyKey: "blocked",
    });
    const approval = await service.resolveApproval(runtimeIdentity, {
      approvalId: "saa_hidden",
      decision: "approve",
    });
    expect(promotion._unsafeUnwrapErr().details?.code).toBe(
      "sandbox_agent_external_approval_required",
    );
    expect(approval._unsafeUnwrapErr().details?.code).toBe(
      "sandbox_agent_external_approval_required",
    );
  });

  test("[AGENT-RUN-003] persists, executes and redacts one durable Run", async () => {
    const { service, queued } = fixture();
    const runtime = await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_once",
    });
    expect(runtime._unsafeUnwrap()).toMatchObject({ status: "ready", sandboxId: "sbx_demo" });

    const run = await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: runtime._unsafeUnwrap().runtimeId,
      task: "build the app",
      context: { mode: "fresh" },
      idempotencyKey: "run_once",
    });
    expect(run._unsafeUnwrap().status).toBe("accepted");
    expect(queued).toEqual([{ kind: "sandbox-agent-run", id: "srun_test" }]);

    await service.reconcileRun(context, "srun_test");
    const shown = await service.showRun(context, "sar_test", "srun_test");
    expect(shown._unsafeUnwrap().status).toBe("completed");
    const events = await service.listRunEvents(context, "srun_test", {});
    expect(JSON.stringify(events._unsafeUnwrap())).not.toContain("must-redact");
    expect(events._unsafeUnwrap().items).toHaveLength(2);
  });

  test("[PROMOTION-PROOF-004] completes only after verified Deployment proof", async () => {
    const { service } = fixture();
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_once",
    });
    const artifact = await service.createSourceArtifact(context, {
      sandboxId: "sbx_demo",
      sourceRoot: "app",
    });
    const preview = await service.createCandidatePreview(context, {
      artifactId: artifact._unsafeUnwrap().artifactId,
    });
    const planned = await service.planPromotion(context, {
      sandboxId: "sbx_demo",
      artifactId: artifact._unsafeUnwrap().artifactId,
      expectedArtifactDigest: artifact._unsafeUnwrap().digest,
      candidatePreviewId: preview._unsafeUnwrap().previewId,
      target: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceName: "Generated app",
      },
    });
    await service.acceptPromotion(context, {
      promotionId: planned._unsafeUnwrap().promotionId,
      expectedArtifactDigest: artifact._unsafeUnwrap().digest,
      idempotencyKey: "promotion_once",
    });
    await service.reconcilePromotion(context, planned._unsafeUnwrap().promotionId);
    const shown = await service.showPromotion(context, planned._unsafeUnwrap().promotionId);
    expect(shown._unsafeUnwrap()).toMatchObject({
      status: "completed",
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      proofVerdict: "verified",
    });
  });

  test("[AGENT-RUN-003] cancellation wins over a late harness result", async () => {
    let releaseExecution: (() => void) | undefined;
    const executionStarted = new Promise<void>((resolve) => {
      releaseExecution = resolve;
    });
    let rejectHarness: ((error: Error) => void) | undefined;
    const harness: SandboxAgentHarness = {
      key: "fake",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      execute: () =>
        new Promise((_, reject) => {
          rejectHarness = reject;
          releaseExecution?.();
        }),
      async cancel() {
        rejectHarness?.(new Error("cancelled"));
      },
    };
    const { service } = fixture({ harness });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_cancel",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "keep working",
      context: { mode: "fresh" },
      idempotencyKey: "run_cancel",
    });
    const reconciling = service.reconcileRun(context, "srun_test");
    await executionStarted;
    const cancelled = await service.cancelRun(context, "sar_test", "srun_test");
    expect(cancelled._unsafeUnwrap().status).toBe("cancelled");
    expect((await reconciling)._unsafeUnwrap().status).toBe("cancelled");
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap().status).toBe(
      "cancelled",
    );
  });

  test("[AGENT-APPROVAL-004] waits durably for an external exact-digest decision", async () => {
    const harness: SandboxAgentHarness = {
      key: "fake",
      templateId: "aht_fake_1",
      version: "1.0.0",
      templateDigest: `sha256:${"a".repeat(64)}`,
      async execute(input) {
        const decision = await input.requestApproval({
          capability: "external-write",
          requestDigest: `sha256:${"c".repeat(64)}`,
          destination: "api.example.test",
          expiresAt: "2026-07-20T01:00:00.000Z",
        });
        if (decision !== "approved") throw new Error("approval rejected");
        return { events: [], outcomeDigest: "sha256:approved-run" };
      },
      async cancel() {},
    };
    const { service } = fixture({ harness });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_approval",
    });
    await service.createRun(context, {
      sandboxId: "sbx_demo",
      runtimeId: "sar_test",
      task: "write externally",
      context: { mode: "fresh" },
      idempotencyKey: "run_approval",
    });
    const waiting = await service.reconcileRun(context, "srun_test");
    expect(waiting.isErr()).toBe(true);
    expect((await service.showRun(context, "sar_test", "srun_test"))._unsafeUnwrap().status).toBe(
      "waiting-approval",
    );
    const approvals = (await service.listApprovals(context, "srun_test"))._unsafeUnwrap().items;
    expect(approvals).toEqual([
      expect.objectContaining({
        approvalId: "saa_test",
        status: "requested",
        capability: "external-write",
        destination: "api.example.test",
      }),
    ]);
    await service.resolveApproval(context, { approvalId: "saa_test", decision: "approve" });
    expect((await service.reconcileRun(context, "srun_test"))._unsafeUnwrap().status).toBe(
      "completed",
    );
  });

  test("[PROMOTION-PROOF-004] pending proof remains verifying until a later verified read", async () => {
    let verdict: "pending" | "verified" = "pending";
    const { service } = fixture({ readProof: async () => ({ verdict }) });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_pending",
    });
    const artifact = (
      await service.createSourceArtifact(context, {
        sandboxId: "sbx_demo",
        sourceRoot: "app",
      })
    )._unsafeUnwrap();
    const preview = (
      await service.createCandidatePreview(context, {
        artifactId: artifact.artifactId,
      })
    )._unsafeUnwrap();
    const promotion = (
      await service.planPromotion(context, {
        sandboxId: "sbx_demo",
        artifactId: artifact.artifactId,
        expectedArtifactDigest: artifact.digest,
        candidatePreviewId: preview.previewId,
        target: { projectId: "prj_demo", environmentId: "env_demo", resourceName: "Generated app" },
      })
    )._unsafeUnwrap();
    await service.acceptPromotion(context, {
      promotionId: promotion.promotionId,
      expectedArtifactDigest: artifact.digest,
      idempotencyKey: "promotion_pending",
    });
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("verifying");
    verdict = "verified";
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("completed");
  });

  test("[PROMOTION-RETRY-003] reuses Resource, creates a new Deployment, and protects Artifact once", async () => {
    let verdict: "failed" | "verified" = "failed";
    const { service, counters } = fixture({ readProof: async () => ({ verdict }) });
    await service.createRuntime(context, {
      sandboxId: "sbx_demo",
      harnessKey: "fake",
      harnessTemplateId: "aht_fake_1",
      idempotencyKey: "runtime_retry",
    });
    const artifact = (
      await service.createSourceArtifact(context, {
        sandboxId: "sbx_demo",
        sourceRoot: "app",
      })
    )._unsafeUnwrap();
    const preview = (
      await service.createCandidatePreview(context, {
        artifactId: artifact.artifactId,
      })
    )._unsafeUnwrap();
    const promotion = (
      await service.planPromotion(context, {
        sandboxId: "sbx_demo",
        artifactId: artifact.artifactId,
        expectedArtifactDigest: artifact.digest,
        candidatePreviewId: preview.previewId,
        target: { projectId: "prj_demo", environmentId: "env_demo", resourceName: "Generated app" },
      })
    )._unsafeUnwrap();
    const acceptance = {
      promotionId: promotion.promotionId,
      expectedArtifactDigest: artifact.digest,
      idempotencyKey: "promotion_retry_once",
    };
    await service.acceptPromotion(context, acceptance);
    await service.acceptPromotion(context, acceptance);
    expect(
      (await service.showSourceArtifact(context, artifact.artifactId))._unsafeUnwrap()
        .referenceCount,
    ).toBe(1);
    expect(
      (await service.reconcilePromotion(context, promotion.promotionId))._unsafeUnwrap().status,
    ).toBe("failed");
    verdict = "verified";
    await service.retryPromotion(context, promotion.promotionId, "promotion_retry_two");
    const completed = (
      await service.reconcilePromotion(context, promotion.promotionId)
    )._unsafeUnwrap();
    expect(completed).toMatchObject({
      status: "completed",
      resourceId: "res_demo",
      deploymentId: "dep_demo_2",
    });
    expect(counters).toEqual({ resources: 1, deployments: 2 });
  });
});
