/**
 * bun-types 1.4.0 declares Process.off("memoryPressure"), and that merge
 * replaces inherited EventEmitter overloads so SIGINT/SIGTERM fail to
 * typecheck. Cast back until bun-types ships oven-sh/bun#37790
 * (ProcessEventMap). See also oven-sh/bun#28792.
 */
export function removeProcessListener(event: NodeJS.Signals, listener: () => void): void {
  (process as NodeJS.EventEmitter).off(event, listener);
}
