import {
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type DeploymentProgressReporter,
  type ExecutionContext,
} from "@yundu/application";

type BufferedDeploymentProgressEvent = {
  context: ExecutionContext;
  event: DeploymentProgressEvent;
  recordedAt: number;
};

const maxBufferedEvents = 200;
const maxBufferedEventAgeMs = 5 * 60 * 1000;

export class ShellDeploymentProgressReporter
  implements DeploymentProgressReporter, DeploymentProgressObserver
{
  private readonly listeners = new Set<DeploymentProgressListener>();
  private readonly recentEvents: BufferedDeploymentProgressEvent[] = [];

  report(context: ExecutionContext, event: DeploymentProgressEvent): void {
    this.remember(context, event);

    for (const listener of this.listeners) {
      listener(context, event);
    }
  }

  subscribe(listener: DeploymentProgressListener): () => void {
    this.pruneRecentEvents();
    this.listeners.add(listener);

    for (const { context, event } of this.recentEvents) {
      listener(context, event);
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  private remember(context: ExecutionContext, event: DeploymentProgressEvent): void {
    this.pruneRecentEvents();
    this.recentEvents.push({
      context,
      event,
      recordedAt: Date.now(),
    });

    if (this.recentEvents.length > maxBufferedEvents) {
      this.recentEvents.splice(0, this.recentEvents.length - maxBufferedEvents);
    }
  }

  private pruneRecentEvents(): void {
    const oldestAllowed = Date.now() - maxBufferedEventAgeMs;
    const firstRecentIndex = this.recentEvents.findIndex(
      (entry) => entry.recordedAt >= oldestAllowed,
    );

    if (firstRecentIndex < 0) {
      this.recentEvents.length = 0;
      return;
    }

    if (firstRecentIndex > 0) {
      this.recentEvents.splice(0, firstRecentIndex);
    }
  }
}
