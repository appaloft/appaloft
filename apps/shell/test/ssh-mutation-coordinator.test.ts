import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext, mutationCoordinationPolicies } from "@appaloft/application";
import { ok } from "@appaloft/core";
import {
  SshMutationCoordinator,
  type SshMutationCoordinatorRunnerInput,
  type SshMutationCoordinatorRunnerResult,
} from "../src/ssh-mutation-coordinator";

function successfulSshResult(): SshMutationCoordinatorRunnerResult {
  return {
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
    failed: false,
  };
}

function testExecutionContext() {
  return createExecutionContext({
    requestId: "req_ssh_mutation_test",
    entrypoint: "system",
  });
}

describe("SSH mutation coordinator", () => {
  test("acquires and releases a remote coordination scope", async () => {
    const commands: SshMutationCoordinatorRunnerInput[] = [];
    const coordinator = new SshMutationCoordinator({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        port: 2222,
        username: "deploy",
        identityFile: "/home/runner/.ssh/appaloft",
      },
      clock: { now: () => "2026-04-21T00:00:00.000Z" },
      runner: {
        run: async (input) => {
          commands.push(input);
          return successfulSshResult();
        },
      },
    });

    const result = await coordinator.runExclusive({
      context: testExecutionContext(),
      policy: mutationCoordinationPolicies.cleanupPreview,
      scope: {
        kind: "preview-lifecycle",
        key: "source-fingerprint:v1:branch%3Amain",
      },
      owner: {
        ownerId: "req_ssh_mutation_test",
        label: "deployments.cleanup-preview",
      },
      work: async () => ok("done"),
    });

    expect(result).toEqual(ok("done"));
    expect(commands).toHaveLength(2);
    expect(commands[0]?.command).toContain('coordination_root="$data_root/locks/coordination"');
    expect(commands[0]?.command).toContain('lock_dir="$scope_root/$scope_hash.lock"');
    expect(commands[0]?.command).toContain('date -j -u -f "%Y-%m-%dT%H:%M:%SZ"');
    expect(commands[0]?.command).toContain('stat -f %m "$lock_dir"');
    expect(commands[0]?.command).toContain("scopeKind");
    expect(commands[0]?.command).toContain("preview-lifecycle");
    expect(commands[0]?.command).toContain("source-fingerprint:v1:branch%3Amain");
    expect(commands[0]?.command).not.toContain("OPENSSH PRIVATE KEY");
    expect(commands[1]?.command).toContain('rm -rf "$lock_dir"');
  });

  test("retries an active coordination scope briefly before succeeding", async () => {
    let attempts = 0;
    let refreshes = 0;
    const coordinator = new SshMutationCoordinator({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        username: "deploy",
      },
      clock: { now: () => "2026-04-21T00:00:00.000Z" },
      refreshLocalState: async () => {
        refreshes += 1;
        return ok(undefined);
      },
      runner: {
        run: async () => {
          attempts += 1;
          if (attempts === 1) {
            return {
              exitCode: 73,
              stdout: "",
              stderr:
                '{"ownerId":"req_other","label":"deployments.cleanup-preview","startedAt":"2026-04-21T00:00:00Z","lastHeartbeatAt":"2026-04-21T00:00:01Z","staleAfterSeconds":30}',
              failed: true,
            };
          }
          return successfulSshResult();
        },
      },
    });

    const result = await coordinator.runExclusive({
      context: testExecutionContext(),
      policy: {
        ...mutationCoordinationPolicies.cleanupPreview,
        waitTimeoutMs: 50,
        retryIntervalMs: 1,
      },
      scope: {
        kind: "preview-lifecycle",
        key: "source-fingerprint:v1:branch%3Amain",
      },
      owner: {
        ownerId: "req_ssh_mutation_test",
        label: "deployments.cleanup-preview",
      },
      work: async () => ok("done"),
    });

    expect(result).toEqual(ok("done"));
    expect(attempts).toBe(3);
    expect(refreshes).toBe(1);
  });

  test("maps coordination wait exhaustion to coordination_timeout", async () => {
    const coordinator = new SshMutationCoordinator({
      dataRoot: "/var/lib/appaloft/runtime/state",
      target: {
        host: "203.0.113.10",
        username: "deploy",
      },
      clock: { now: () => "2026-04-21T00:00:00.000Z" },
      runner: {
        run: async () => ({
          exitCode: 73,
          stdout: "",
          stderr:
            '{"ownerId":"req_other","label":"deployments.cleanup-preview","startedAt":"2026-04-21T00:00:00Z","lastHeartbeatAt":"2026-04-21T00:00:01Z","staleAfterSeconds":30}',
          failed: true,
        }),
      },
    });

    const result = await coordinator.runExclusive({
      context: testExecutionContext(),
      policy: {
        ...mutationCoordinationPolicies.cleanupPreview,
        waitTimeoutMs: 0,
        retryIntervalMs: 1,
      },
      scope: {
        kind: "preview-lifecycle",
        key: "source-fingerprint:v1:branch%3Amain",
      },
      owner: {
        ownerId: "req_ssh_mutation_test",
        label: "deployments.cleanup-preview",
      },
      work: async () => ok("done"),
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected coordination timeout");
    }
    expect(result.error).toMatchObject({
      code: "coordination_timeout",
      category: "timeout",
      details: {
        phase: "operation-coordination",
        coordinationScopeKind: "preview-lifecycle",
        coordinationScope: "source-fingerprint:v1:branch%3Amain",
        coordinationMode: "serialize-with-bounded-wait",
      },
    });
  });
});
