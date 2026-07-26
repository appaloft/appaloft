import "reflect-metadata";

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigScopeValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  FilePathText,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProjectId,
  ProviderKey,
  ResourceId,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  ok,
} from "@appaloft/core";
import type { ExecutionContext } from "@appaloft/application";
import { LocalExecutionBackend } from "../src/local-execution";
import { SshExecutionBackend } from "../src/ssh-execution";

const startedAt = StartedAt.rehydrate("2026-07-26T00:00:00.000Z");

function context(requestId: string): ExecutionContext {
  return {
    requestId,
    entrypoint: "system",
  } as ExecutionContext;
}

function progressRecorder() {
  return {
    record: async () => ok(undefined),
  } as never;
}

function progressReporter() {
  return {
    report: () => undefined,
  } as never;
}

function logger() {
  return {
    error: () => undefined,
    warn: () => undefined,
  } as never;
}

function runningGitComposeDeployment(input: {
  deploymentId: string;
  gitRef?: string;
  providerKey: "generic-ssh" | "local-shell";
  sourceLocator: string;
  supersedesDeploymentId: string;
}): Deployment {
  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.deploymentId),
    projectId: ProjectId.rehydrate("prj_redeploy_safety"),
    environmentId: EnvironmentId.rehydrate("env_production"),
    resourceId: ResourceId.rehydrate("res_web"),
    serverId: DeploymentTargetId.rehydrate("srv_primary"),
    destinationId: DestinationId.rehydrate("dst_primary"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate(`plan_${input.deploymentId}`),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("git-public"),
        locator: SourceLocator.rehydrate(input.sourceLocator),
        displayName: DisplayNameText.rehydrate("Git-backed Compose source"),
        metadata: {
          ...(input.gitRef ? { gitRef: input.gitRef } : {}),
          composeFilePath: "docker-compose.yml",
        },
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("compose-deploy"),
      packagingMode: PackagingModeValue.rehydrate("compose-bundle"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-compose-stack"),
        composeFile: FilePathText.rehydrate("docker-compose.yml"),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate(input.providerKey),
        serverIds: [DeploymentTargetId.rehydrate("srv_primary")],
      }),
      detectSummary: DetectSummary.rehydrate("Git-backed Docker Compose deployment"),
      steps: [PlanStepText.rehydrate("Materialize source before Compose rollout")],
      generatedAt: GeneratedAt.rehydrate("2026-07-26T00:00:00.000Z"),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate(`snap_${input.deploymentId}`),
      environmentId: EnvironmentId.rehydrate("env_production"),
      createdAt: GeneratedAt.rehydrate("2026-07-26T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [],
    }),
    supersedesDeploymentId: DeploymentId.rehydrate(input.supersedesDeploymentId),
    createdAt: CreatedAt.rehydrate("2026-07-26T00:00:00.000Z"),
  })._unsafeUnwrap();

  deployment.markPlanning(startedAt)._unsafeUnwrap();
  deployment.markPlanned(startedAt)._unsafeUnwrap();
  deployment.start(startedAt)._unsafeUnwrap();
  return deployment;
}

describe("Git source redeploy safety", () => {
  test("[DEP-CREATE-PKG-002] local clone failure leaves the previous attempt workspace untouched", async () => {
    const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-local-git-redeploy-"));
    const previousDeploymentId = "dep_previous_local";
    const candidateDeploymentId = "dep_candidate_local";
    const previousSourceDir = join(
      runtimeRoot,
      "local-deployments",
      previousDeploymentId,
      "source",
    );
    const previousComposeFile = join(previousSourceDir, "docker-compose.yml");
    mkdirSync(previousSourceDir, { recursive: true });
    writeFileSync(previousComposeFile, "services:\n  web:\n    image: acme/web:known-good\n");

    try {
      const missingRepository = join(runtimeRoot, "missing-repository.git");
      const deployment = runningGitComposeDeployment({
        deploymentId: candidateDeploymentId,
        providerKey: "local-shell",
        sourceLocator: `file://${missingRepository}`,
        supersedesDeploymentId: previousDeploymentId,
      });
      const backend = new LocalExecutionBackend(
        runtimeRoot,
        logger(),
        progressRecorder(),
        progressReporter(),
      );

      const result = await backend.execute(context("req_local_git_clone_failure"), deployment);

      expect(result.isOk()).toBe(true);
      const state = deployment.toState();
      expect(state.status.value).toBe("failed");
      expect(state.runtimePlan.execution.metadata?.errorCode).toBe("remote_git_clone_failed");
      expect(existsSync(previousComposeFile)).toBe(true);
      expect(readFileSync(previousComposeFile, "utf8")).toContain("acme/web:known-good");
      expect(existsSync(join(runtimeRoot, "local-deployments", candidateDeploymentId))).toBe(true);
    } finally {
      rmSync(runtimeRoot, { recursive: true, force: true });
    }
  });

  for (const failure of [
    "authentication required",
    "target network unreachable",
    "requested branch was deleted",
  ]) {
    test(`[DEP-CREATE-PKG-003] SSH ${failure} stops before runtime mutation`, async () => {
      const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-ssh-git-redeploy-"));
      const previousDeploymentId = "dep_previous_ssh";
      const candidateDeploymentId = `dep_candidate_${failure.replaceAll(" ", "_")}`;
      const deployment = runningGitComposeDeployment({
        deploymentId: candidateDeploymentId,
        gitRef: failure.includes("branch") ? "deleted-branch" : "main",
        providerKey: "generic-ssh",
        sourceLocator: "https://github.com/acme/private-compose.git",
        supersedesDeploymentId: previousDeploymentId,
      });
      const backend = new SshExecutionBackend(
        runtimeRoot,
        logger(),
        progressRecorder(),
        progressReporter(),
      );
      const remoteCommands: string[] = [];

      (
        backend as unknown as {
          targetFor: () => Promise<
            ReturnType<typeof ok<{ host: string; port: string; publicHost: string }>>
          >;
        }
      ).targetFor = async () =>
        ok({
          host: "deploy@example.test",
          port: "22",
          publicHost: "example.test",
        });
      (
        backend as unknown as {
          runRemoteCommandStreaming: (input: {
            command: string;
          }) => Promise<{
            exitCode: number;
            failed: boolean;
            reason: string;
            stderr: string;
            stdout: string;
          }>;
        }
      ).runRemoteCommandStreaming = async (input) => {
        remoteCommands.push(input.command);
        return {
          exitCode: 128,
          failed: true,
          reason: failure,
          stderr: failure,
          stdout: "",
        };
      };

      try {
        const result = await backend.execute(context(`req_${candidateDeploymentId}`), deployment);

        expect(result.isOk()).toBe(true);
        const state = deployment.toState();
        expect(state.status.value).toBe("failed");
        expect(state.runtimePlan.execution.metadata?.errorCode).toBe("remote_git_clone_failed");
        expect(remoteCommands).toHaveLength(1);
        expect(remoteCommands[0]).toContain(
          `/ssh-deployments/${candidateDeploymentId}/source`,
        );
        expect(remoteCommands[0]).not.toContain(previousDeploymentId);
        expect(remoteCommands[0]).not.toContain("docker ");
      } finally {
        rmSync(runtimeRoot, { recursive: true, force: true });
      }
    });
  }
});
