import { type ResourceHealthSummary } from "@appaloft/contracts";

type RuntimeControlSummary = NonNullable<ResourceHealthSummary["latestRuntimeControl"]>;

export function runtimeControlAttemptCompletesPolling(
  attempt: RuntimeControlSummary | null,
  expectedAttemptId: string | null,
): boolean {
  if (!attempt || !expectedAttemptId || attempt.runtimeControlAttemptId !== expectedAttemptId) {
    return false;
  }

  return attempt.status !== "accepted" && attempt.status !== "running";
}
