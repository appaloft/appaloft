import "reflect-metadata";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExecutionContext, toRepositoryContext } from "@appaloft/application";
import {
  AgentHarnessTemplateId,
  CreatedAt,
  ExpiresAt,
  PromotionCandidatePreviewId,
  Sandbox,
  SandboxAgentApproval,
  SandboxAgentApprovalId,
  SandboxAgentRun,
  SandboxAgentRunId,
  SandboxAgentRuntime,
  SandboxAgentRuntimeId,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxPromotion,
  SandboxPromotionId,
  SandboxResourceLimits,
  SourceArtifact,
  SourceArtifactDigest,
  SourceArtifactId,
  SourceArtifactManifest,
  SourceArtifactStoreReference,
  UpdatedAt,
  WorkspaceRevision,
} from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  PgExecutionSandboxRepository,
  PgSandboxAgentDeliveryRepository,
} from "../src";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function repositoryContext(tenantId: string) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      tenant: { tenantId },
      requestId: `req_${tenantId}`,
    }),
  );
}

describe("PgSandboxAgentDeliveryRepository", () => {
  test("[AGENT-PG-007] round-trips tenant-scoped Runtime, Run, idempotency, and cursor events", async () => {
    const directory = mkdtempSync(join(tmpdir(), "appaloft-agent-delivery-pg-"));
    directories.push(directory);
    const database = await createDatabase({ driver: "pglite", pgliteDataDir: directory });
    try {
      expect((await createMigrator(database.db).migrateToLatest()).error).toBeUndefined();
      const tenantA = repositoryContext("tenant_a");
      const tenantB = repositoryContext("tenant_b");
      const sandboxRepository = new PgExecutionSandboxRepository(database.db);
      const sandbox = Sandbox.create({
        id: SandboxId.rehydrate("sbx_agent_pg"),
        source: { kind: "image", image: "agent@sha256:abc123" },
        requestedIsolation: SandboxIsolationLevel.gvisor(),
        limits: SandboxResourceLimits.create({
          cpuMillis: 1_000,
          memoryBytes: 1_048_576,
          diskBytes: 10_485_760,
          maxProcesses: 32,
        })._unsafeUnwrap(),
        networkPolicy: SandboxNetworkPolicy.defaultDeny(),
        createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
        currentAttemptId: "sat_agent_pg",
      })._unsafeUnwrap();
      await sandboxRepository.save(tenantA, sandbox, "hermetic");

      const repository = new PgSandboxAgentDeliveryRepository(database.db);
      const runtime = SandboxAgentRuntime.create({
        id: SandboxAgentRuntimeId.rehydrate("sar_pg"),
        sandboxId: SandboxId.rehydrate("sbx_agent_pg"),
        harnessTemplateId: AgentHarnessTemplateId.rehydrate("aht_pi_managed_v1"),
        createdAt: CreatedAt.rehydrate("2026-07-20T00:00:01.000Z"),
      })._unsafeUnwrap();
      runtime.markReady({ at: UpdatedAt.rehydrate("2026-07-20T00:00:02.000Z") })._unsafeUnwrap();
      await repository.saveRuntime(tenantA, {
        runtime,
        harnessKey: "pi",
        idempotencyKey: "runtime_once",
      });
      expect(
        (
          await repository.findRuntimeByIdempotencyKey(tenantA, "sbx_agent_pg", "runtime_once")
        )?.runtime.toState().status.value,
      ).toBe("ready");
      expect(await repository.findRuntime(tenantB, "sar_pg")).toBeNull();

      const firstClaim = await repository.findRuntime(tenantA, "sar_pg");
      const competingClaim = await repository.findRuntime(tenantA, "sar_pg");
      if (!firstClaim || !competingClaim) throw new Error("Runtime claims were not loaded");
      firstClaim.runtime
        .claimRun({
          runId: SandboxAgentRunId.rehydrate("srun_first"),
          at: UpdatedAt.rehydrate("2026-07-20T00:00:02.100Z"),
        })
        ._unsafeUnwrap();
      competingClaim.runtime
        .claimRun({
          runId: SandboxAgentRunId.rehydrate("srun_second"),
          at: UpdatedAt.rehydrate("2026-07-20T00:00:02.100Z"),
        })
        ._unsafeUnwrap();
      expect((await repository.claimRuntime(tenantA, firstClaim)).claimed).toBe(true);
      expect(await repository.claimRuntime(tenantA, competingClaim)).toEqual({
        claimed: false,
        activeRunId: "srun_first",
      });
      firstClaim.runtime
        .releaseRun({
          runId: SandboxAgentRunId.rehydrate("srun_first"),
          at: UpdatedAt.rehydrate("2026-07-20T00:00:02.200Z"),
        })
        ._unsafeUnwrap();
      await repository.saveRuntime(tenantA, firstClaim);

      const run = SandboxAgentRun.create({
        id: SandboxAgentRunId.rehydrate("srun_pg"),
        runtimeId: SandboxAgentRuntimeId.rehydrate("sar_pg"),
        context: { mode: "fresh" },
        taskDigest: `sha256:${"b".repeat(64)}`,
        createdAt: CreatedAt.rehydrate("2026-07-20T00:00:03.000Z"),
      })._unsafeUnwrap();
      await repository.saveRun(tenantA, {
        run,
        sandboxId: "sbx_agent_pg",
        taskEnvelope: "cps:v1:test:iv:ciphertext:tag:end",
        idempotencyKey: "run_once",
      });
      const storedRun = await database.db
        .selectFrom("sandbox_agent_runs")
        .select(["task_envelope", "state"])
        .where("id", "=", "srun_pg")
        .executeTakeFirstOrThrow();
      expect(storedRun.task_envelope).toBe("cps:v1:test:iv:ciphertext:tag:end");
      expect(storedRun.task_envelope).not.toContain("build app");
      expect(JSON.stringify(storedRun.state)).not.toContain("build app");
      await repository.appendRunEvents(tenantA, "srun_pg", [
        {
          eventId: "event_1",
          runId: "srun_pg",
          sequence: 1,
          type: "message",
          data: { text: "one" },
          createdAt: "2026-07-20T00:00:04.000Z",
        },
        {
          eventId: "event_2",
          runId: "srun_pg",
          sequence: 2,
          type: "message",
          data: { text: "two" },
          createdAt: "2026-07-20T00:00:05.000Z",
        },
      ]);
      expect(
        (await repository.listRunEvents(tenantA, "srun_pg")).map((event) => event.sequence),
      ).toEqual([1, 2]);
      expect(await repository.listRunEvents(tenantB, "srun_pg")).toEqual([]);
      expect(
        (await repository.findRunByIdempotencyKey(tenantA, "sar_pg", "run_once"))?.run.id.value,
      ).toBe("srun_pg");
      const approval = SandboxAgentApproval.create({
        id: SandboxAgentApprovalId.rehydrate("saa_pg"),
        runtimeId: SandboxAgentRuntimeId.rehydrate("sar_pg"),
        runId: SandboxAgentRunId.rehydrate("srun_pg"),
        sandboxId: "sbx_agent_pg",
        capability: "credential",
        requestDigest: `sha256:${"d".repeat(64)}`,
        destination: "api.example.test",
        createdAt: CreatedAt.rehydrate("2026-07-20T00:00:06.000Z"),
        expiresAt: ExpiresAt.rehydrate("2026-07-20T01:00:06.000Z"),
      })._unsafeUnwrap();
      await repository.saveApproval(tenantA, approval);
      expect(
        (
          await repository.findApprovalByRequest(tenantA, "srun_pg", `sha256:${"d".repeat(64)}`)
        )?.toState(),
      ).toMatchObject({ status: "requested", destination: "api.example.test" });
      expect(await repository.findApproval(tenantB, "saa_pg")).toBeNull();

      const digest = SourceArtifactDigest.rehydrate(`sha256:${"a".repeat(64)}`);
      const artifact = SourceArtifact.create({
        id: SourceArtifactId.rehydrate("sart_pg"),
        sandboxId: SandboxId.rehydrate("sbx_agent_pg"),
        digest,
        manifest: SourceArtifactManifest.create([
          { path: "index.html", digest: `sha256:${"c".repeat(64)}`, sizeBytes: 42, mode: "file" },
        ])._unsafeUnwrap(),
        sourceRoot: "app",
        workspaceRevision: WorkspaceRevision.rehydrate("rev_pg"),
        storeReference: SourceArtifactStoreReference.rehydrate("artifact://tenant-a/sart-pg"),
        createdAt: CreatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
      })._unsafeUnwrap();
      await repository.saveArtifact(tenantA, artifact);
      expect((await repository.findArtifact(tenantA, "sart_pg"))?.toState().digest.value).toBe(
        digest.value,
      );
      expect(await repository.findArtifact(tenantB, "sart_pg")).toBeNull();

      await repository.savePreview(tenantA, {
        previewId: "sprev_pg",
        artifactId: "sart_pg",
        artifactDigest: digest.value,
        status: "ready",
        url: "https://preview.example.test/p/sprev_pg/token/",
        expiresAt: "2026-07-20T01:10:00.000Z",
        verified: true,
      });
      expect(await repository.findPreview(tenantA, "sprev_pg")).toMatchObject({
        artifactDigest: digest.value,
        status: "ready",
        verified: true,
      });
      expect(await repository.findPreview(tenantB, "sprev_pg")).toBeNull();

      const promotion = SandboxPromotion.plan({
        id: SandboxPromotionId.rehydrate("sprom_pg"),
        sandboxId: SandboxId.rehydrate("sbx_agent_pg"),
        artifactId: SourceArtifactId.rehydrate("sart_pg"),
        artifactDigest: digest,
        candidatePreviewId: PromotionCandidatePreviewId.rehydrate("sprev_pg"),
        target: {
          projectId: "prj_pg",
          environmentId: "env_pg",
          resourceName: "Agent app",
        },
        createdAt: CreatedAt.rehydrate("2026-07-20T00:11:00.000Z"),
        expiresAt: ExpiresAt.rehydrate("2026-07-20T01:11:00.000Z"),
      })._unsafeUnwrap();
      promotion
        .accept({
          expectedArtifactDigest: digest,
          idempotencyKey: "promote_pg",
          at: UpdatedAt.rehydrate("2026-07-20T00:12:00.000Z"),
        })
        ._unsafeUnwrap();
      await repository.savePromotion(tenantA, promotion);
      const storedPromotion = await repository.findPromotion(tenantA, "sprom_pg");
      expect(storedPromotion?.toState().status.value).toBe("creating-resource");
      expect(storedPromotion?.toState().artifactDigest.value).toBe(digest.value);
      expect(await repository.findPromotion(tenantB, "sprom_pg")).toBeNull();
    } finally {
      await database.close();
    }
  });
});
