import { describe, expect, test } from "bun:test";
import {
  classifyRuntimeTargetCapacityFailure,
  classifyRuntimeTargetCapacityFailureFromText,
  runtimeTargetCapacityAwareFailureFields,
  runtimeTargetCapacityFailureMetadata,
} from "../src/runtime-target-failure-classification";

const repoFile = (path: string) => new URL(`../../../../${path}`, import.meta.url);

describe("runtime target failure classification", () => {
  test("[DEP-CREATE-ASYNC-019] command and error specs expose runtime target resource exhaustion", async () => {
    const commandSpec = await Bun.file(repoFile("docs/commands/deployments.create.md")).text();
    const errorSpec = await Bun.file(repoFile("docs/errors/deployments.create.md")).text();
    const testMatrix = await Bun.file(
      repoFile("docs/testing/deployments.create-test-matrix.md"),
    ).text();
    const runtimeTargetWorkflow = await Bun.file(
      repoFile("docs/workflows/deployment-runtime-target-abstraction.md"),
    ).text();
    const capacityMatrix = await Bun.file(
      repoFile("docs/testing/runtime-target-capacity-test-matrix.md"),
    ).text();

    for (const source of [commandSpec, errorSpec, testMatrix]) {
      expect(source).toContain("runtime_target_resource_exhausted");
      expect(source).toContain("capacityResource");
    }
    expect(commandSpec).toContain("capacitySignal");
    expect(commandSpec).toContain("appaloft server capacity inspect");
    expect(commandSpec).toContain("appaloft server capacity prune");
    expect(runtimeTargetWorkflow).toContain("shared\n  `runtime_target_resource_exhausted` classifier");
    expect(runtimeTargetWorkflow).toContain("Docker image store, BuildKit, Docker");
    expect(runtimeTargetWorkflow).toContain("`servers.capacity.prune` owns dry-run-first cleanup");
    expect(runtimeTargetWorkflow).toContain("GitHub Actions/local explicit gates");
    expect(runtimeTargetWorkflow).not.toContain("does not yet prune unused Docker images");
    expect(capacityMatrix).toContain("RT-CAP-FAIL-001");
    expect(capacityMatrix).toContain("Docker build-cache and unused-image deletion are explicit opt-in categories");
  });

  test("[DEP-CREATE-ASYNC-019] classifies Docker BuildKit disk exhaustion as runtime target resource exhaustion", () => {
    const classification = classifyRuntimeTargetCapacityFailureFromText(
      "failed to solve: failed to prepare sha256 layer: write /var/lib/docker/buildkit/cache.db: no space left on device",
    );

    expect(classification).toEqual({
      code: "runtime_target_resource_exhausted",
      capacityResource: "build-cache",
      signal: "docker-build-cache-space",
    });
  });

  test("[DEP-CREATE-ASYNC-019] classifies disk, inode, memory, and CPU capacity signals", () => {
    expect(classifyRuntimeTargetCapacityFailureFromText("ENOSPC: no space left on device"))
      .toMatchObject({
        capacityResource: "disk",
      });
    expect(classifyRuntimeTargetCapacityFailureFromText("free inodes: 0")).toMatchObject({
      capacityResource: "inode",
    });
    expect(classifyRuntimeTargetCapacityFailureFromText("container was OOM-killed")).toMatchObject({
      capacityResource: "memory",
    });
    expect(classifyRuntimeTargetCapacityFailureFromText("not enough CPU available")).toMatchObject({
      capacityResource: "cpu",
    });
  });

  test("[DEP-CREATE-ASYNC-019] classifies Docker Compose, OCI runtime, and Swarm scheduler capacity messages", () => {
    expect(
      classifyRuntimeTargetCapacityFailureFromText(
        "docker compose up failed: write /var/lib/docker/overlay2/layer/diff/app.log: filesystem is full",
      ),
    ).toMatchObject({
      capacityResource: "disk",
      signal: "disk-space-exhausted",
    });
    expect(
      classifyRuntimeTargetCapacityFailureFromText(
        "failed to create shim task: OCI runtime create failed: runc create failed: unable to allocate memory",
      ),
    ).toMatchObject({
      capacityResource: "memory",
      signal: "memory-exhausted",
    });
    expect(
      classifyRuntimeTargetCapacityFailureFromText(
        "no suitable node (insufficient memory on 1 node)",
      ),
    ).toMatchObject({
      capacityResource: "memory",
      signal: "memory-exhausted",
    });
    expect(
      classifyRuntimeTargetCapacityFailureFromText("no suitable node (insufficient CPU on 1 node)"),
    ).toMatchObject({
      capacityResource: "cpu",
      signal: "cpu-exhausted",
    });
  });

  test("[DEP-CREATE-ASYNC-019] classifies Docker image store and layer registration exhaustion", () => {
    expect(
      classifyRuntimeTargetCapacityFailureFromText(
        "failed to register layer: write /var/lib/docker/image/overlay2/layerdb/sha256: no space left on device",
      ),
    ).toEqual({
      code: "runtime_target_resource_exhausted",
      capacityResource: "disk",
      signal: "docker-image-store-exhausted",
    });

    expect(
      classifyRuntimeTargetCapacityFailureFromText(
        "docker pull failed because the target image store is full",
      ),
    ).toMatchObject({
      capacityResource: "disk",
      signal: "docker-image-store-exhausted",
    });
  });

  test("[DEP-CREATE-ASYNC-019] derives safe deployment failure metadata for recovery actions", () => {
    const classification = classifyRuntimeTargetCapacityFailure([
      { message: "docker build failed" },
      { message: "failed to solve: no space left on device", phase: "package" },
    ]);

    expect(classification).toMatchObject({
      code: "runtime_target_resource_exhausted",
      capacityResource: "build-cache",
      phase: "image-build",
    });
    if (!classification) {
      throw new Error("expected capacity classification");
    }
    expect(
      runtimeTargetCapacityFailureMetadata({
        classification,
        serverId: "srv_capacity",
      }),
    ).toEqual({
      phase: "image-build",
      capacityResource: "build-cache",
      capacitySignal: "docker-build-cache-space",
      capacityInspectCommand: "appaloft server capacity inspect srv_capacity",
      capacityPruneCommand: "appaloft server capacity prune srv_capacity --dry-run",
    });
  });

  test("[DEP-CREATE-ASYNC-019] maps runtime phases to deployment failure phases", () => {
    expect(
      classifyRuntimeTargetCapacityFailure([
        { message: "docker run failed: ENOSPC: no space left on device", phase: "deploy" },
      ]),
    ).toMatchObject({
      code: "runtime_target_resource_exhausted",
      capacityResource: "disk",
      phase: "runtime-target-apply",
    });

    expect(
      classifyRuntimeTargetCapacityFailure([
        { message: "health inspect failed: cannot allocate memory", phase: "verify" },
      ]),
    ).toMatchObject({
      code: "runtime_target_resource_exhausted",
      capacityResource: "memory",
      phase: "runtime-target-observation",
    });
  });

  test("[DEP-CREATE-ASYNC-019] derives local Docker failure result fields from apply logs", () => {
    expect(
      runtimeTargetCapacityAwareFailureFields({
        timeline: [
          {
            message: "Docker container failed to start: ENOSPC: no space left on device",
            phase: "deploy",
          },
        ],
        errorCode: "local_docker_run_failed",
        metadata: { runtimeTarget: "local-shell" },
        serverId: "srv_local",
      }),
    ).toEqual({
      errorCode: "runtime_target_resource_exhausted",
      metadata: {
        runtimeTarget: "local-shell",
        phase: "runtime-target-apply",
        capacityResource: "disk",
        capacitySignal: "disk-space-exhausted",
        capacityInspectCommand: "appaloft server capacity inspect srv_local",
        capacityPruneCommand: "appaloft server capacity prune srv_local --dry-run",
      },
    });
  });

  test("[DEP-CREATE-ASYNC-019] derives generic-SSH Docker build exhaustion result fields", () => {
    expect(
      runtimeTargetCapacityAwareFailureFields({
        timeline: [
          {
            message:
              "SSH Docker image build failed: failed to solve layer write /var/lib/docker/buildkit/cache.db: no space left on device",
            phase: "package",
          },
        ],
        errorCode: "ssh_docker_build_failed",
        serverId: "srv_ssh",
      }),
    ).toEqual({
      errorCode: "runtime_target_resource_exhausted",
      metadata: {
        phase: "image-build",
        capacityResource: "build-cache",
        capacitySignal: "docker-build-cache-space",
        capacityInspectCommand: "appaloft server capacity inspect srv_ssh",
        capacityPruneCommand: "appaloft server capacity prune srv_ssh --dry-run",
      },
    });
  });

  test("[DEP-CREATE-ASYNC-019] preserves fallback runtime failure fields without capacity signals", () => {
    expect(
      runtimeTargetCapacityAwareFailureFields({
        timeline: [{ message: "SSH Docker Compose deployment failed", phase: "deploy" }],
        errorCode: "ssh_docker_compose_failed",
        metadata: { runtimeTarget: "generic-ssh" },
        serverId: "srv_ssh",
      }),
    ).toEqual({
      errorCode: "ssh_docker_compose_failed",
      metadata: { runtimeTarget: "generic-ssh" },
    });
  });
});
