import {
  type AppLogger,
  type ExecutionContextFactory,
  type ExecutionSandboxService,
} from "@appaloft/application";

export interface ExecutionSandboxMaintenanceRunner {
  start(): void;
  stop(): void;
}

export function createExecutionSandboxMaintenanceRunner(input: {
  service: Pick<ExecutionSandboxService, "maintainAllTenants">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
  intervalSeconds?: number;
  tenantLimit?: number;
  sandboxLimit?: number;
}): ExecutionSandboxMaintenanceRunner {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  const intervalSeconds = Math.min(Math.max(input.intervalSeconds ?? 60, 5), 3600);

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "execution-sandbox-maintenance-runner",
          label: "Execution Sandbox maintenance runner",
        },
      });
      const result = await input.service.maintainAllTenants(context, {
        ...(input.tenantLimit ? { tenantLimit: input.tenantLimit } : {}),
        ...(input.sandboxLimit ? { sandboxLimit: input.sandboxLimit } : {}),
      });
      if (result.isErr()) {
        input.logger.error("execution_sandbox_maintenance.run_failed", {
          errorCode: result.error.code,
        });
        return;
      }
      input.logger.info("execution_sandbox_maintenance.tick_completed", {
        tenantCount: result.value.tenants.length,
        expiredCount: result.value.tenants.reduce((total, item) => total + item.expired, 0),
        reconciledCount: result.value.tenants.reduce((total, item) => total + item.reconciled, 0),
        removedOrphanCount: result.value.tenants.reduce(
          (total, item) => total + item.removedOrphans,
          0,
        ),
        failedCount: result.value.tenants.reduce((total, item) => total + item.failed, 0),
      });
    } catch (error) {
      input.logger.error("execution_sandbox_maintenance.tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), intervalSeconds * 1000);
      input.logger.info("execution_sandbox_maintenance.started", { intervalSeconds });
    },
    stop(): void {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
      input.logger.info("execution_sandbox_maintenance.stopped");
    },
  };
}
