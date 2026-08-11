import {
  type Command,
  ListSandboxAgentRuntimesQuery,
  type Query,
  TerminateSandboxAgentRuntimeCommand,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { err, ok, type Result } from "@appaloft/core";

export interface WorkspaceLifecycleOperationExecutor {
  executeCommand<T>(message: Command<T>): Promise<Result<T>>;
  executeQuery<T>(message: Query<T>): Promise<Result<T>>;
}

interface AgentRuntimeListResult {
  readonly items: readonly {
    readonly runtimeId: string;
    readonly status?: string;
    readonly [key: string]: unknown;
  }[];
}

export interface WorkspaceTerminationResult {
  readonly workspaceId: string;
  readonly agents: readonly unknown[];
  readonly sandbox: unknown;
}

/** Preserve the public headless Workspace contract: active Agent runtimes stop before Sandbox termination. */
export async function terminateWorkspaceWithRuntimes(
  executor: WorkspaceLifecycleOperationExecutor,
  workspaceId: string,
): Promise<Result<WorkspaceTerminationResult>> {
  const runtimeQuery = ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId });
  if (runtimeQuery.isErr()) return err(runtimeQuery.error);
  const runtimeResult = await executor.executeQuery(runtimeQuery.value);
  if (runtimeResult.isErr()) return err(runtimeResult.error);
  const runtimes = runtimeResult.value as AgentRuntimeListResult;
  const agentResults = await Promise.all(
    runtimes.items
      .filter((runtime) => runtime.status !== "terminated")
      .map(async (runtime) => {
        const command = TerminateSandboxAgentRuntimeCommand.create({
          sandboxId: workspaceId,
          runtimeId: runtime.runtimeId,
        });
        if (command.isErr()) return err(command.error);
        return executor.executeCommand(command.value);
      }),
  );
  const failedAgent = agentResults.find((result) => result.isErr());
  if (failedAgent?.isErr()) return err(failedAgent.error);

  const command = TerminateSandboxCommand.create({ sandboxId: workspaceId });
  if (command.isErr()) return err(command.error);
  const sandbox = await executor.executeCommand(command.value);
  if (sandbox.isErr()) return err(sandbox.error);
  return ok({
    workspaceId,
    agents: agentResults.map((result) => {
      if (result.isErr()) throw result.error;
      return result.value;
    }),
    sandbox: sandbox.value,
  });
}
