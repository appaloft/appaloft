import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  HostAddress,
  PortNumber,
  ProviderKey,
  SshPrivateKeyText,
  TargetKindValue,
  type DeploymentTargetState,
} from "@appaloft/core";
import { type ExecutionContext } from "@appaloft/application";
import { RuntimeTargetCapacityInspectorAdapter } from "../src/runtime-target-capacity";
import { translateCapacityInspectionToRuntimeUsage } from "../src/runtime-usage";

function context(): ExecutionContext {
  return {
    requestId: "req_runtime_usage_smoke",
    entrypoint: "system",
    locale: "en-US",
    t: (key) => key,
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

function localServer(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_runtime_usage_smoke"),
    name: DeploymentTargetName.rehydrate("runtime-usage-smoke"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("local-shell"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

function sshServer(): DeploymentTargetState {
  const privateKey = Bun.env.APPALOFT_RUNTIME_USAGE_SSH_PRIVATE_KEY;
  const username = Bun.env.APPALOFT_RUNTIME_USAGE_SSH_USERNAME;

  return {
    id: DeploymentTargetId.rehydrate("srv_runtime_usage_ssh_smoke"),
    name: DeploymentTargetName.rehydrate("runtime-usage-ssh-smoke"),
    host: HostAddress.rehydrate(Bun.env.APPALOFT_RUNTIME_USAGE_SSH_HOST ?? "127.0.0.1"),
    port: PortNumber.rehydrate(Number(Bun.env.APPALOFT_RUNTIME_USAGE_SSH_PORT ?? "22")),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    ...(privateKey || username
      ? {
          credential: {
            kind: DeploymentTargetCredentialKindValue.rehydrate(
              privateKey ? "ssh-private-key" : "local-ssh-agent",
            ),
            ...(username ? { username: DeploymentTargetUsername.rehydrate(username) } : {}),
            ...(privateKey ? { privateKey: SshPrivateKeyText.rehydrate(privateKey) } : {}),
          },
        }
      : {}),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

const dockerSmokeTest = Bun.env.APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE === "1" ? test : test.skip;
const sshSmokeTest = Bun.env.APPALOFT_RUNTIME_USAGE_SSH_SMOKE === "1" ? test : test.skip;

describe("runtime usage opt-in smoke", () => {
  dockerSmokeTest(
    "[RT-USAGE-001][RT-USAGE-002] opt-in local Docker/runtime usage smoke is read-only",
    async () => {
      const runtimeRoot = mkdtempSync(join(tmpdir(), "appaloft-runtime-usage-smoke-"));
      const workspace = join(runtimeRoot, "ssh-deployments", "dep_smoke");
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(workspace, ".appaloft-rollback-candidate"), "1\n");

      try {
        const inspector = new RuntimeTargetCapacityInspectorAdapter(runtimeRoot);
        const result = await inspector.inspect(context(), { server: localServer() });

        expect(result.isOk()).toBe(true);
        const capacity = result._unsafeUnwrap();
        expect(capacity.schemaVersion).toBe("servers.capacity.inspect/v1");
        expect(capacity.appaloftWorkspaces).toContainEqual(
          expect.objectContaining({
            deploymentId: "dep_smoke",
            rollbackCandidateMarker: true,
          }),
        );

        const usage = translateCapacityInspectionToRuntimeUsage({
          capacity,
          query: {
            scope: { kind: "server", serverId: "srv_runtime_usage_smoke" },
            mode: "current",
            includeArtifacts: true,
            includeWarnings: true,
          },
        });
        expect(usage.schemaVersion).toBe("runtime-usage.inspect/v1");
        expect(usage.artifacts.some((artifact) => artifact.kind === "source-workspace")).toBe(
          true,
        );
      } finally {
        rmSync(runtimeRoot, { recursive: true, force: true });
      }
    },
  );

  sshSmokeTest(
    "[RT-USAGE-001] opt-in SSH runtime usage smoke is read-only",
    async () => {
      const host = Bun.env.APPALOFT_RUNTIME_USAGE_SSH_HOST;
      if (!host) {
        throw new Error("APPALOFT_RUNTIME_USAGE_SSH_HOST is required for SSH smoke.");
      }

      const inspector = new RuntimeTargetCapacityInspectorAdapter(
        "/var/lib/appaloft/runtime",
        Bun.env.APPALOFT_RUNTIME_USAGE_SSH_RUNTIME_ROOT ?? "/var/lib/appaloft/runtime",
      );
      const result = await inspector.inspect(context(), { server: sshServer() });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap().schemaVersion).toBe("servers.capacity.inspect/v1");
    },
  );
});
