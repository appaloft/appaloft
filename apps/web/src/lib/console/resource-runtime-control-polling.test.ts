import { type ResourceHealthSummary } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import { runtimeControlAttemptCompletesPolling } from "./resource-runtime-control-polling";

type RuntimeControlSummary = NonNullable<ResourceHealthSummary["latestRuntimeControl"]>;

function runtimeControlSummary(
  overrides: Partial<RuntimeControlSummary> = {},
): RuntimeControlSummary {
  return {
    runtimeControlAttemptId: "rtctl_current",
    operation: "restart",
    status: "running",
    startedAt: "2026-08-11T00:00:00.000Z",
    runtimeState: "restarting",
    ...overrides,
  };
}

describe("runtime-control polling", () => {
  test("[RES-HEALTH-ENTRY-011] waits for the newly accepted attempt before completing", () => {
    expect(
      runtimeControlAttemptCompletesPolling(
        runtimeControlSummary({
          runtimeControlAttemptId: "rtctl_previous",
          status: "succeeded",
          runtimeState: "running",
        }),
        "rtctl_current",
      ),
    ).toBe(false);
    expect(runtimeControlAttemptCompletesPolling(runtimeControlSummary(), "rtctl_current")).toBe(
      false,
    );
    expect(
      runtimeControlAttemptCompletesPolling(
        runtimeControlSummary({ status: "succeeded", runtimeState: "running" }),
        "rtctl_current",
      ),
    ).toBe(true);
  });
});
