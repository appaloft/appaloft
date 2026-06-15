import type { ProxyReloadPlan, ProxyReloadStepPlan } from "@appaloft/application";

export interface ProxyReloadCommandResult {
  failed: boolean;
  stdout: string;
  stderr: string;
  reason?: string;
}

export interface ProxyReloadExecutionLog {
  stepName: string;
  mode: ProxyReloadStepPlan["mode"];
  message: string;
  stdout?: string;
  stderr?: string;
}

export interface ProxyReloadExecutionSucceeded {
  status: "succeeded";
  timeline: ProxyReloadExecutionLog[];
}

export interface ProxyReloadExecutionFailed {
  status: "failed";
  timeline: ProxyReloadExecutionLog[];
  stepName: string;
  message: string;
  errorCode: "proxy_reload_failed";
  retryable: true;
  stdout?: string;
  stderr?: string;
}

export type ProxyReloadExecutionResult =
  | ProxyReloadExecutionSucceeded
  | ProxyReloadExecutionFailed;

export async function executeProxyReloadPlan(input: {
  plan: ProxyReloadPlan;
  runCommand: (step: ProxyReloadStepPlan) => Promise<ProxyReloadCommandResult>;
}): Promise<ProxyReloadExecutionResult> {
  const timeline: ProxyReloadExecutionLog[] = [];

  if (!input.plan.required) {
    return { status: "succeeded", timeline };
  }

  for (const step of input.plan.steps) {
    if (step.mode === "automatic") {
      timeline.push({
        stepName: step.name,
        mode: step.mode,
        message: step.successMessage,
      });
      continue;
    }

    if (!step.command) {
      const message = step.failureMessage ?? `${input.plan.displayName} proxy reload command missing`;
      timeline.push({
        stepName: step.name,
        mode: step.mode,
        message,
      });
      return {
        status: "failed",
        timeline,
        stepName: step.name,
        message,
        errorCode: "proxy_reload_failed",
        retryable: true,
      };
    }

    const result = await input.runCommand(step);
    timeline.push({
      stepName: step.name,
      mode: step.mode,
      message: result.failed
        ? (step.failureMessage ?? `${input.plan.displayName} proxy reload failed`)
        : step.successMessage,
      ...(result.stdout ? { stdout: result.stdout } : {}),
      ...(result.stderr ? { stderr: result.stderr } : {}),
    });

    if (result.failed) {
      return {
        status: "failed",
        timeline,
        stepName: step.name,
        message: step.failureMessage ?? `${input.plan.displayName} proxy reload failed`,
        errorCode: "proxy_reload_failed",
        retryable: true,
        ...(result.stdout ? { stdout: result.stdout } : {}),
        ...(result.stderr ? { stderr: result.stderr } : {}),
      };
    }
  }

  return { status: "succeeded", timeline };
}
