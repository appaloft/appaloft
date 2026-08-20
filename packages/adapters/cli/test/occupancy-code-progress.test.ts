import { describe, expect, test } from "bun:test";
import {
  OCCUPANCY_CODE_CHROME_TITLE,
  OCCUPANCY_CODE_PROGRESS,
  OCCUPANCY_PREPARE_STEP_LABELS,
  occupancyChromeHasForbiddenWord,
  occupancyCodeUsesLineProgress,
  occupancyOpeningProgress,
  occupancyPrepareStepForProgress,
  occupancyTimeoutMs,
  settleWithTimeout,
} from "../src/occupancy-code-progress";

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

  test("[WS-REMOTE-PROGRESS-193] line progress is only for --no-attach or non-TTY", () => {
    expect(
      occupancyCodeUsesLineProgress({ noAttach: false, stdinIsTty: true, stdoutIsTty: true }),
    ).toBeFalse();
    expect(
      occupancyCodeUsesLineProgress({ noAttach: true, stdinIsTty: true, stdoutIsTty: true }),
    ).toBeTrue();
    expect(occupancyCodeUsesLineProgress({ noAttach: false })).toBeTrue();
  });

  test("code chrome copy stays step-shaped and never says Occupancy", () => {
    expect(OCCUPANCY_CODE_CHROME_TITLE).toBe("Appaloft Cloud Agents");
    expect(occupancyChromeHasForbiddenWord(OCCUPANCY_CODE_CHROME_TITLE)).toBeFalse();
    expect(occupancyChromeHasForbiddenWord(OCCUPANCY_CODE_PROGRESS.connecting)).toBeFalse();
    expect(OCCUPANCY_CODE_PROGRESS.connecting).toBe("Checking credentials…");
    expect(OCCUPANCY_CODE_PROGRESS.connecting).not.toContain("Connecting to Appaloft");
    expect(OCCUPANCY_CODE_PROGRESS.choosingOccupancy).toBe("Choosing this folder…");
    expect(OCCUPANCY_CODE_PROGRESS.usingThisProject).toBe("Using this project…");
    expect(OCCUPANCY_CODE_PROGRESS.copyingSkills).toBe("Preparing skills…");
    expect(OCCUPANCY_CODE_PROGRESS.copyingSkills).not.toContain("Copying skills");
    expect(OCCUPANCY_CODE_PROGRESS.choosingOccupancy).not.toContain("Choosing occupancy");
    expect(OCCUPANCY_CODE_PROGRESS.usingThisProject).not.toContain("occupancy");
    for (const message of Object.values(OCCUPANCY_CODE_PROGRESS)) {
      expect(occupancyChromeHasForbiddenWord(message)).toBeFalse();
    }
    expect(occupancyOpeningProgress("hostinger")).toBe("Preparing disk on hostinger…");
    expect(occupancyChromeHasForbiddenWord(occupancyOpeningProgress("hostinger"))).toBeFalse();
    expect(OCCUPANCY_PREPARE_STEP_LABELS).toEqual({
      credential: "Checking login",
      skills: "Preparing skills",
      disk: "Preparing disk",
    });
    for (const label of Object.values(OCCUPANCY_PREPARE_STEP_LABELS)) {
      expect(occupancyChromeHasForbiddenWord(label)).toBeFalse();
    }
    expect(occupancyPrepareStepForProgress(OCCUPANCY_CODE_PROGRESS.checkingLogin)).toBe(
      "credential",
    );
    expect(occupancyPrepareStepForProgress(OCCUPANCY_CODE_PROGRESS.copyingSkills)).toBe("skills");
    expect(occupancyPrepareStepForProgress(occupancyOpeningProgress("hostinger"))).toBe("disk");
  });
});
