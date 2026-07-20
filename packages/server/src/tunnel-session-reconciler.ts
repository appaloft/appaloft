import {
  type AppLogger,
  type ExecutionContextFactory,
  type TunnelSessionService,
} from "@appaloft/application";

export interface TunnelSessionReconciler {
  start(): void;
  stop(): void;
}

export interface TunnelSessionReconcilerConfig {
  reconcilerEnabled: boolean;
  reconcileIntervalSeconds: number;
  reconcileBatchSize: number;
}

export function createTunnelSessionReconciler(input: {
  config: TunnelSessionReconcilerConfig;
  service: Pick<TunnelSessionService, "reconcile">;
  executionContextFactory: ExecutionContextFactory;
  logger: AppLogger;
}): TunnelSessionReconciler {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const context = input.executionContextFactory.create({
        entrypoint: "system",
        actor: {
          kind: "system",
          id: "tunnel-session-reconciler",
          label: "Tunnel session reconciler",
        },
      });
      const result = await input.service.reconcile(context, {
        now: new Date().toISOString(),
        limit: input.config.reconcileBatchSize,
      });
      if (result.isErr()) {
        input.logger.error("tunnel_session_reconciler.tick_failed", {
          errorCode: result.error.code,
          message: result.error.message,
        });
      } else if (result.value.expired > 0 || result.value.failed > 0) {
        input.logger.info("tunnel_session_reconciler.tick_completed", result.value);
      }
    } catch (error) {
      input.logger.error("tunnel_session_reconciler.tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  }
  return {
    start() {
      if (!input.config.reconcilerEnabled || timer) return;
      void tick();
      timer = setInterval(() => void tick(), input.config.reconcileIntervalSeconds * 1000);
      input.logger.info("tunnel_session_reconciler.started", {
        intervalSeconds: input.config.reconcileIntervalSeconds,
        batchSize: input.config.reconcileBatchSize,
      });
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
      input.logger.info("tunnel_session_reconciler.stopped");
    },
  };
}

export function createDisabledTunnelSessionReconciler(): TunnelSessionReconciler {
  return { start() {}, stop() {} };
}
