import { describe, expect, test } from "bun:test";
import {
  BuildSpec,
  BuildStrategyKindValue,
  CreatedAt,
  EnvironmentId,
  PortNumber,
  ProjectId,
  RuntimeKindValue,
  RuntimeSpec,
  SourceKindValue,
  SourceLocator,
  SourceSpec,
  Workload,
  WorkloadId,
  WorkloadKindValue,
  WorkloadName,
} from "../src";

const baseInput = {
  id: WorkloadId.rehydrate("wrk_demo"),
  projectId: ProjectId.rehydrate("prj_demo"),
  environmentId: EnvironmentId.rehydrate("env_demo"),
  name: WorkloadName.rehydrate("demo workload"),
  source: SourceSpec.rehydrate({
    kind: SourceKindValue.rehydrate("local-folder"),
    locator: SourceLocator.rehydrate("/workspace/app"),
  }),
  build: BuildSpec.rehydrate({
    kind: BuildStrategyKindValue.rehydrate("dockerfile"),
  }),
  createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
};

function runtime(kind: "web-server" | "worker" | "scheduler" | "static-site") {
  return RuntimeSpec.rehydrate({
    kind: RuntimeKindValue.rehydrate(kind),
    ...(kind === "web-server" ? { port: PortNumber.rehydrate(3000) } : {}),
  });
}

describe("Workload", () => {
  test("[DMBH-WORKLOAD-001] answers workload/runtime compatibility decisions", () => {
    const staticRuntime = runtime("static-site");
    expect(staticRuntime.canRunStaticSiteWorkload()).toBe(true);
    expect(staticRuntime.requiresPort()).toBe(false);

    const staticSite = Workload.declare({
      ...baseInput,
      kind: WorkloadKindValue.rehydrate("static_site"),
      runtime: staticRuntime,
    });
    expect(staticSite.isOk()).toBe(true);

    const invalidStaticSite = Workload.declare({
      ...baseInput,
      kind: WorkloadKindValue.rehydrate("static_site"),
      runtime: runtime("web-server"),
    });
    expect(invalidStaticSite.isErr()).toBe(true);

    const invalidWorker = Workload.declare({
      ...baseInput,
      kind: WorkloadKindValue.rehydrate("worker"),
      runtime: runtime("web-server"),
    });
    expect(invalidWorker.isErr()).toBe(true);

    const webRuntime = runtime("web-server");
    expect(webRuntime.requiresPort()).toBe(true);
    expect(webRuntime.canRunWorkerWorkload()).toBe(false);
  });

  test("[DMBH-WORKLOAD-001] keeps web-server port validation inside RuntimeSpec", () => {
    const missingPort = RuntimeSpec.create({
      kind: RuntimeKindValue.rehydrate("web-server"),
    });

    expect(missingPort.isErr()).toBe(true);
  });
});
