import { describe, expect, test } from "bun:test";
import { ash } from "@appaloft/ash";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
  TargetKindValue,
  type DeploymentTargetState,
} from "@appaloft/core";
import { runBufferedProcess, shellCommand } from "../src/buffered-process";
import {
  parseDockerSizeToBytes,
  parseRuntimeTargetCapacityOutput,
  renderRuntimeTargetCapacityScript,
  runtimeTargetCapacitySshConnectTimeoutSeconds,
  runtimeTargetCapacitySshProcessTimeoutMs,
} from "../src/runtime-target-capacity";

function server(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_capacity"),
    name: DeploymentTargetName.rehydrate("capacity"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

describe("runtime target capacity diagnostics", () => {
  test("[RUNTIME-CAPACITY-INSPECT-001] renders a read-only SSH diagnostic script", () => {
    const script = renderRuntimeTargetCapacityScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
    });
    const rendered = ash.render(script);

    expect(rendered).toMatchSnapshot();
    expect(rendered).toContain("df -P -k");
    expect(rendered).toContain("df -P -i");
    expect(rendered).toContain("docker system df");
    expect(rendered).toContain("docker inspect --size");
    expect(rendered).toContain("appaloft.managed=true");
    expect(rendered).toContain("CAPACITY_APPALOFT_WORKSPACE");
    expect(rendered).toContain(".appaloft-rollback-candidate");
    expect(rendered).toContain("du -sk");
    expect(rendered.indexOf("CAPACITY_APPALOFT_CONTAINER")).toBeLessThan(
      rendered.indexOf("docker system df"),
    );
    expect(rendered).not.toContain("docker system prune");
    expect(rendered).not.toContain("docker volume prune");
    expect(rendered).not.toContain(" rm ");
    expect(rendered).not.toContain("rm -rf");
  });

  test("[RT-USAGE-002][RT-USAGE-004] renders a bounded attribution profile before expensive capacity checks", () => {
    const script = renderRuntimeTargetCapacityScript({
      runtimeRoot: "/var/lib/appaloft/runtime",
      profile: "attribution",
    });
    const rendered = ash.render(script);

    expect(rendered).toMatchSnapshot();
    expect(rendered).toContain("APPALOFT_CAPACITY_PROFILE='attribution'");
    expect(rendered).toContain("CAPACITY_APPALOFT_CONTAINER");
    expect(rendered).toContain("CAPACITY_APPALOFT_WORKSPACE");
    expect(rendered).toContain("exit 0");
    expect(rendered.indexOf("CAPACITY_APPALOFT_CONTAINER")).toBeLessThan(
      rendered.indexOf("exit 0"),
    );
    expect(rendered.indexOf("CAPACITY_APPALOFT_WORKSPACE")).toBeLessThan(
      rendered.indexOf("exit 0"),
    );
    expect(rendered.indexOf("exit 0")).toBeLessThan(rendered.indexOf("docker system df"));
    expect(rendered.indexOf("exit 0")).toBeLessThan(rendered.indexOf("df -P -k"));
  });

  test("[RUNTIME-CAPACITY-INSPECT-002] parses disk, inode, Docker, runtime, and warning output", () => {
    const output = [
      "APPALOFT_CAPACITY_V1",
      "CAPACITY_DISK\t/\t/\t102400\t102400\t0\t100",
      "CAPACITY_INODES\t/\t/\t900\t100\t90",
      "CAPACITY_DU\truntimeRoot\t/var/lib/appaloft/runtime\t2048",
      "CAPACITY_DU\tstateRoot\t/var/lib/appaloft/runtime/state\t1024",
      "CAPACITY_DU\tsourceWorkspace\t/var/lib/appaloft/runtime/ssh-deployments\t512",
      "CAPACITY_MEMORY\t1048576\t524288",
      "CAPACITY_CPU\t2\t0.10\t0.20\t0.30",
      "CAPACITY_DOCKER_DF\tTYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE",
      "CAPACITY_DOCKER_DF\tImages          10        2         8GB       6GB (75%)",
      "CAPACITY_DOCKER_DF\tContainers      3         1         12kB      8kB (66%)",
      "CAPACITY_DOCKER_DF\tLocal Volumes   2         1         20MB      0B (0%)",
      "CAPACITY_DOCKER_DF\tBuild Cache     42        0         7GB       6.5GB",
      "CAPACITY_APPALOFT_CONTAINER\tcontainer123\t/app-api\ttrue\trunning\t4096\tdep_current\tprj_usage\tenv_prod\tres_api\tsrv_capacity\tdst_primary\tcontainer-image",
      "CAPACITY_APPALOFT_WORKSPACE\tdep_current\t/var/lib/appaloft/runtime/ssh-deployments/dep_current\t8192\ttrue\tfalse",
      "CAPACITY_WARNING\tdocker-unavailable\tdocker system df failed",
    ].join("\n");

    const result = parseRuntimeTargetCapacityOutput({
      stdout: output,
      server: server(),
      inspectedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.isOk()).toBe(true);
    const value = result._unsafeUnwrap();
    expect(value.schemaVersion).toBe("servers.capacity.inspect/v1");
    expect(value.disk[0]).toMatchObject({ path: "/", usePercent: 100 });
    expect(value.inodes[0]).toMatchObject({ path: "/", usePercent: 90 });
    expect(value.docker.reclaimableImagesSize).toBe(parseDockerSizeToBytes("6GB"));
    expect(value.docker.reclaimableBuildCacheSize).toBe(parseDockerSizeToBytes("6.5GB"));
    expect(value.appaloftContainers).toEqual([
      {
        id: "container123",
        name: "app-api",
        running: true,
        status: "running",
        writableBytes: 4096,
        deploymentId: "dep_current",
        projectId: "prj_usage",
        environmentId: "env_prod",
        resourceId: "res_api",
        serverId: "srv_capacity",
        destinationId: "dst_primary",
        artifactKind: "container-image",
      },
    ]);
    expect(value.appaloftWorkspaces).toEqual([
      {
        deploymentId: "dep_current",
        path: "/var/lib/appaloft/runtime/ssh-deployments/dep_current",
        bytes: 8192,
        activeMarker: true,
        rollbackCandidateMarker: false,
      },
    ]);
    expect(value.appaloftRuntime.stateRoot.size).toBe(1024 * 1024);
    expect(value.safeReclaimableEstimate.total).toBe(
      parseDockerSizeToBytes("8kB") + parseDockerSizeToBytes("6GB") + parseDockerSizeToBytes("6.5GB"),
    );
    expect(value.warnings.map((item) => item.code)).toEqual(
      expect.arrayContaining(["full-disk", "high-inode-usage", "docker-unavailable"]),
    );
    expect(value.partial).toBe(true);
  });

  test("[RUNTIME-CAPACITY-INSPECT-003] capacity command execution does not block the event loop while waiting", async () => {
    const command = runBufferedProcess({
      command: shellCommand("sleep 0.2; printf 'APPALOFT_CAPACITY_V1\\n'"),
      timeoutMs: 1_000,
    });
    const firstSettled = await Promise.race([
      command.then(() => "command"),
      new Promise<"timer">((resolve) => setTimeout(() => resolve("timer"), 25)),
    ]);

    expect(firstSettled).toBe("timer");
    const result = await command;
    expect(result.failed).toBe(false);
    expect(result.stdout).toContain("APPALOFT_CAPACITY_V1");
  });

  test("[RUNTIME-CAPACITY-INSPECT-004] SSH capacity diagnostics stay below HTTP gateway timeouts", () => {
    expect(runtimeTargetCapacitySshConnectTimeoutSeconds).toBeLessThanOrEqual(5);
    expect(runtimeTargetCapacitySshProcessTimeoutMs).toBeLessThanOrEqual(8_000);
  });
});
