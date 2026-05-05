import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";
import { ok } from "@appaloft/core";
import { RuntimeResourceHealthProbeRunner } from "../src/resource-health-probes";

function probeRequest() {
  return {
    resourceId: "res_web",
    deploymentId: "dep_web",
    runtimeKind: "docker-container" as const,
    targetKind: "orchestrator-cluster" as const,
    providerKey: "docker-swarm",
    runtimeMetadata: {
      "swarm.serviceName": "appaloft-res-web-dst-demo-dep-web_web",
    },
    timeoutSeconds: 5,
  };
}

describe("RuntimeResourceHealthProbeRunner", () => {
  const context = createExecutionContext({
    requestId: "req_swarm_health",
    entrypoint: "system",
  });

  test("[SWARM-TARGET-OBS-002] normalizes healthy Docker Swarm service tasks", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(async (input) => {
      expect(input.args).toEqual([
        "docker",
        "service",
        "ps",
        "--no-trunc",
        "--format",
        "{{json .}}",
        "appaloft-res-web-dst-demo-dep-web_web",
      ]);
      return ok({
        exitCode: 0,
        stdout: JSON.stringify({
          Name: "appaloft-res-web-dst-demo-dep-web_web.1",
          DesiredState: "Running",
          CurrentState: "Running 12 seconds ago",
          Error: "",
        }),
      });
    });

    const result = await runner.probeRuntime(context, probeRequest());

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      lifecycle: "running",
      health: "healthy",
      reasonCode: "docker_swarm_service_running",
      check: {
        name: "runtime-service",
        target: "container",
        status: "passed",
        reasonCode: "docker_swarm_service_running",
        phase: "runtime-live-probe",
        metadata: {
          providerKey: "docker-swarm",
          runtimeKind: "docker-container",
          serviceName: "appaloft-res-web-dst-demo-dep-web_web",
          taskCount: "1",
          runningTasks: "1",
          failedTasks: "0",
        },
      },
    });
  });

  test("[SWARM-TARGET-OBS-002] reports failed Docker Swarm service tasks without raw payloads", async () => {
    const runner = new RuntimeResourceHealthProbeRunner(async () =>
      ok({
        exitCode: 0,
        stdout: JSON.stringify({
          Name: "appaloft-res-web-dst-demo-dep-web_web.1",
          DesiredState: "Running",
          CurrentState: "Rejected 2 seconds ago",
          Error: "No such image: registry.example.test/private/web:latest",
        }),
      }),
    );

    const result = await runner.probeRuntime(context, probeRequest());

    expect(result.isOk()).toBe(true);
    const summary = result._unsafeUnwrap();
    expect(summary).toMatchObject({
      lifecycle: "degraded",
      health: "unhealthy",
      reasonCode: "docker_swarm_service_task_failed",
      check: {
        status: "failed",
        target: "container",
        reasonCode: "docker_swarm_service_task_failed",
        retriable: true,
      },
    });
    expect(JSON.stringify(summary)).not.toContain("No such image");
    expect(JSON.stringify(summary)).not.toContain("DesiredState");
    expect(JSON.stringify(summary)).not.toContain("CurrentState");
  });
});
