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
  logs: ProxyReloadExecutionLog[];
}

export interface ProxyReloadExecutionFailed {
  status: "failed";
  logs: ProxyReloadExecutionLog[];
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

export function executeProxyReloadPlan(input: {
  plan: ProxyReloadPlan;
  runCommand: (step: ProxyReloadStepPlan) => ProxyReloadCommandResult;
}): ProxyReloadExecutionResult {
  const logs: ProxyReloadExecutionLog[] = [];

  if (!input.plan.required) {
    return { status: "succeeded", logs };
  }

  for (const step of input.plan.steps) {
    if (step.mode === "automatic") {
      logs.push({
        stepName: step.name,
        mode: step.mode,
        message: step.successMessage,
      });
      continue;
    }

    if (!step.command) {
      const message = step.failureMessage ?? `${input.plan.displayName} proxy reload command missing`;
      logs.push({
        stepName: step.name,
        mode: step.mode,
        message,
      });
      return {
        status: "failed",
        logs,
        stepName: step.name,
        message,
        errorCode: "proxy_reload_failed",
        retryable: true,
      };
    }

    const result = input.runCommand(step);
    logs.push({
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
        logs,
        stepName: step.name,
        message: step.failureMessage ?? `${input.plan.displayName} proxy reload failed`,
        errorCode: "proxy_reload_failed",
        retryable: true,
        ...(result.stdout ? { stdout: result.stdout } : {}),
        ...(result.stderr ? { stderr: result.stderr } : {}),
      };
    }
  }

  return { status: "succeeded", logs };
}
