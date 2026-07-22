import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext, mutationCoordinationPolicies } from "@appaloft/application";
import { ok } from "@appaloft/core";
import {
  SshMutationCoordinator,
  type SshMutationCoordinatorRunnerInput,
} from "../src/ssh-mutation-coordinator";

describe("server SSH mutation coordinator", () => {
  test("snapshots rendered acquire and release commands", async () => {
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
          return {
            exitCode: 0,
            stdout: "ok\n",
            stderr: "",
            failed: false,
          };
        },
      },
    });

    const result = await coordinator.runExclusive({
      context: createExecutionContext({
        requestId: "req_server_ssh_mutation_snapshot",
        entrypoint: "system",
      }),
      policy: mutationCoordinationPolicies.cleanupPreview,
      scope: {
        kind: "preview-lifecycle",
        key: "source-fingerprint:v1:branch%3Amain",
      },
      owner: {
        ownerId: "req_server_ssh_mutation_snapshot",
        label: "deployments.cleanup-preview",
      },
      work: async () => ok("done"),
    });

    expect(result).toEqual(ok("done"));
    expect(
      commands.map(({ command }) =>
        command.replaceAll(/req_server_ssh_mutation_snapshot:\d+:[a-z0-9]+/g, "<lock-token>"),
      ),
    ).toMatchSnapshot();
  });
});
