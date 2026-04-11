import {
  type DeploymentProgressEvent,
  type DeploymentProgressListener,
  type DeploymentProgressObserver,
  type DeploymentProgressReporter,
  type ExecutionContext,
} from "@yundu/application";

export class ShellDeploymentProgressReporter
  implements DeploymentProgressReporter, DeploymentProgressObserver
{
  private readonly listeners = new Set<DeploymentProgressListener>();

  report(context: ExecutionContext, event: DeploymentProgressEvent): void {
    for (const listener of this.listeners) {
      listener(context, event);
    }
  }

  subscribe(listener: DeploymentProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
