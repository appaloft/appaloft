import { describe, expect, test } from "bun:test";
import { occupancyTimeoutMs, settleWithTimeout } from "../src/occupancy-code-progress";

describe("occupancy code progress timeouts", () => {
  test("[WS-REMOTE-PROGRESS-192] settleWithTimeout completes before the deadline", async () => {
    const settled = await settleWithTimeout(Promise.resolve("ready"), 50);
    expect(settled).toEqual({ status: "completed", value: "ready" });
  });

  test("[WS-REMOTE-PROGRESS-192] settleWithTimeout skips hung work", async () => {
    let release: (() => void) | undefined;
    const hung = new Promise<string>((resolve) => {
      release = () => resolve("late");
    });
    const settled = await settleWithTimeout(hung, 15);
    expect(settled).toEqual({ status: "timed-out" });
    release?.();
  });

  test("[WS-REMOTE-PROGRESS-192] occupancyTimeoutMs reads an explicit env override", () => {
    expect(
      occupancyTimeoutMs("APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS", 8000, {
        APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS: "25",
      }),
    ).toBe(25);
    expect(occupancyTimeoutMs("APPALOFT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS", 8000, {})).toBe(8000);
  });
});
