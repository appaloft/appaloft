import {
  type Command,
  IssueSandboxAgentAttachAccessCommand,
  ListAgentTaskRunsQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListSandboxPortsQuery,
  ListSandboxPromotionsQuery,
  PauseSandboxCommand,
  type Query,
  ResumeSandboxCommand,
  ShowSandboxQuery,
  type TerminalSession,
  type TerminalSessionAttachmentGateway,
} from "@appaloft/application";
import { type Result } from "@appaloft/core";
import { terminateWorkspaceWithRuntimes } from "./workspace-lifecycle-actions.js";

export interface WorkspaceControlWorkspaceSummary {
  readonly workspaceId: string;
  readonly status: string;
  readonly providerKey?: string;
  readonly sourceKind?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly lastActivityAt?: string;
}

export interface WorkspaceControlRuntimeSummary {
  readonly runtimeId: string;
  readonly status?: string;
  readonly harnessTemplateId?: string;
  readonly attach?: {
    readonly transport: "managed-terminal" | "native-attach";
  };
}

export interface WorkspaceControlPortSummary {
  readonly exposureId: string;
  readonly port: number;
  readonly visibility?: string;
  readonly url?: string;
  readonly expiresAt?: string;
}

export interface WorkspaceControlTaskSummary {
  readonly taskRunId: string;
  readonly runtimeId?: string;
  readonly status: string;
}

export interface WorkspaceControlPromotionSummary {
  readonly promotionId: string;
  readonly status: string;
  readonly resourceId?: string;
  readonly deploymentId?: string;
  readonly proofVerdict?: string;
  readonly expiresAt?: string;
}

export type WorkspaceControlRendererMessage =
  | {
      readonly type: "workspaces";
      readonly workspaces: readonly WorkspaceControlWorkspaceSummary[];
    }
  | {
      readonly type: "detail";
      readonly workspace: WorkspaceControlWorkspaceSummary;
      readonly runtimes: readonly WorkspaceControlRuntimeSummary[];
      readonly ports: readonly WorkspaceControlPortSummary[];
      readonly tasks: readonly WorkspaceControlTaskSummary[];
      readonly promotions: readonly WorkspaceControlPromotionSummary[];
    }
  | {
      readonly type: "terminal-ready";
      readonly workspaceId: string;
      readonly runtimeId: string;
      readonly sessionId: string;
    }
  | {
      readonly type: "terminal-output";
      readonly stream: "stdout" | "stderr";
      readonly data: string;
    }
  | {
      readonly type: "terminal-closed";
      readonly reason: string;
      readonly exitCode?: number;
    }
  | {
      readonly type: "error";
      readonly code: string;
      readonly phase: string;
      readonly retryable: boolean;
    };

export type WorkspaceControlRendererEvent =
  | { readonly type: "select"; readonly workspaceId: string }
  | { readonly type: "refresh"; readonly workspaceId?: string }
  | { readonly type: "attach"; readonly workspaceId: string; readonly runtimeId: string }
  | {
      readonly type: "lifecycle-action";
      readonly workspaceId: string;
      readonly action: "pause" | "resume" | "terminate";
    }
  | { readonly type: "terminal-input"; readonly data: string }
  | { readonly type: "terminal-resize"; readonly cols: number; readonly rows: number }
  | { readonly type: "terminal-reconnect" }
  | { readonly type: "detach" }
  | { readonly type: "quit" };

export interface WorkspaceControlRendererSession {
  send(message: WorkspaceControlRendererMessage): Promise<void>;
  events(): AsyncIterable<WorkspaceControlRendererEvent>;
  close(): Promise<void>;
}

export interface WorkspaceControlPresentationContext {
  executeCommand<T>(message: Command<T>): Promise<Result<T>>;
  executeQuery<T>(message: Query<T>): Promise<Result<T>>;
  terminalSessionGateway?: TerminalSessionAttachmentGateway;
  openNativeWorkspaceTerminal?(input: {
    readonly workspaceId: string;
    readonly runtimeId: string;
    readonly argv: readonly string[];
  }): Promise<{ readonly sessionId: string; readonly session: TerminalSession }>;
}

/** Framework-neutral entry point for the interactive Workspace control surface. */
export interface WorkspaceControlPresentation {
  start(context: WorkspaceControlPresentationContext): Promise<void>;
}

export interface BoundedWorkspaceControlPresentationInput {
  openRenderer(): Promise<WorkspaceControlRendererSession>;
  now?: () => string;
}

interface SandboxListResult {
  readonly items: readonly Record<string, unknown>[];
}

interface RuntimeListResult {
  readonly items: readonly Record<string, unknown>[];
}

interface ItemListResult {
  readonly items: readonly Record<string, unknown>[];
}

function resultValue<T>(result: Result<T>): T {
  if (result.isErr()) throw result.error;
  return result.value;
}

function operationValue<T>(result: Result<T>): T {
  return resultValue(result);
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function workspaceSummary(record: Record<string, unknown>): WorkspaceControlWorkspaceSummary {
  const workspaceId = optionalString(record, "sandboxId");
  const status = optionalString(record, "status");
  if (!workspaceId || !status) {
    throw new Error("Workspace query returned an invalid descriptor");
  }
  const providerKey = optionalString(record, "providerKey");
  const sourceKind = optionalString(record, "sourceKind");
  const createdAt = optionalString(record, "createdAt");
  const updatedAt = optionalString(record, "updatedAt");
  const lastActivityAt = optionalString(record, "lastActivityAt");
  return {
    workspaceId,
    status,
    ...(providerKey ? { providerKey } : {}),
    ...(sourceKind ? { sourceKind } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(lastActivityAt ? { lastActivityAt } : {}),
  };
}

function runtimeSummary(record: Record<string, unknown>): WorkspaceControlRuntimeSummary {
  const runtimeId = optionalString(record, "runtimeId");
  if (!runtimeId) throw new Error("Runtime query returned an invalid descriptor");
  const status = optionalString(record, "status");
  const harnessTemplateId = optionalString(record, "harnessTemplateId");
  const interaction = record.interaction;
  const transport =
    interaction && typeof interaction === "object"
      ? optionalString(interaction as Record<string, unknown>, "transport")
      : undefined;
  const attach: WorkspaceControlRuntimeSummary["attach"] =
    transport === "managed-terminal" || transport === "native-attach" ? { transport } : undefined;
  return {
    runtimeId,
    ...(status ? { status } : {}),
    ...(harnessTemplateId ? { harnessTemplateId } : {}),
    ...(attach ? { attach } : {}),
  };
}

function safePresentationUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function portSummary(record: Record<string, unknown>): WorkspaceControlPortSummary | undefined {
  const exposureId = optionalString(record, "exposureId");
  const port = record.port;
  if (!exposureId || typeof port !== "number" || !Number.isInteger(port)) return undefined;
  const visibility = optionalString(record, "visibility");
  const url = safePresentationUrl(record.url);
  const expiresAt = optionalString(record, "expiresAt");
  return {
    exposureId,
    port,
    ...(visibility ? { visibility } : {}),
    ...(url ? { url } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function taskSummary(record: Record<string, unknown>): WorkspaceControlTaskSummary | undefined {
  const taskRunId = optionalString(record, "taskRunId");
  const status = optionalString(record, "status");
  if (!taskRunId || !status) return undefined;
  const runtimeId = optionalString(record, "runtimeId");
  return { taskRunId, status, ...(runtimeId ? { runtimeId } : {}) };
}

function promotionSummary(
  record: Record<string, unknown>,
): WorkspaceControlPromotionSummary | undefined {
  const promotionId = optionalString(record, "promotionId");
  const status = optionalString(record, "status");
  if (!promotionId || !status) return undefined;
  const resourceId = optionalString(record, "resourceId");
  const deploymentId = optionalString(record, "deploymentId");
  const proofVerdict = optionalString(record, "proofVerdict");
  const expiresAt = optionalString(record, "expiresAt");
  return {
    promotionId,
    status,
    ...(resourceId ? { resourceId } : {}),
    ...(deploymentId ? { deploymentId } : {}),
    ...(proofVerdict ? { proofVerdict } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function safeError(error: unknown, phase: string): WorkspaceControlRendererMessage {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      type: "error",
      code: typeof record.code === "string" ? record.code : "workspace_control_failed",
      phase,
      retryable: record.retryable === true,
    };
  }
  return {
    type: "error",
    code: "workspace_control_failed",
    phase,
    retryable: false,
  };
}

function nativeClientCommand(record: Record<string, unknown>): readonly string[] {
  const argv = record.clientCommand;
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.length > 64 ||
    argv.some(
      (argument) =>
        typeof argument !== "string" ||
        !argument ||
        argument.length > 2_048 ||
        argument.includes("\0") ||
        /[\r\n]/u.test(argument),
    )
  ) {
    throw new Error("Native attach descriptor has an invalid client command");
  }
  return argv as string[];
}

async function listWorkspaces(
  context: WorkspaceControlPresentationContext,
): Promise<WorkspaceControlWorkspaceSummary[]> {
  const query = operationValue(ListSandboxesQuery.create({ limit: 100, offset: 0 }));
  const result = resultValue(await context.executeQuery(query)) as SandboxListResult;
  return result.items.map(workspaceSummary);
}

async function loadDetail(
  context: WorkspaceControlPresentationContext,
  workspaceId: string,
): Promise<Extract<WorkspaceControlRendererMessage, { type: "detail" }>> {
  const workspace = resultValue(
    await context.executeQuery(operationValue(ShowSandboxQuery.create({ sandboxId: workspaceId }))),
  ) as Record<string, unknown>;
  const runtimeResult = resultValue(
    await context.executeQuery(
      operationValue(ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId })),
    ),
  ) as RuntimeListResult;
  const ports = resultValue(
    await context.executeQuery(
      operationValue(ListSandboxPortsQuery.create({ sandboxId: workspaceId })),
    ),
  ) as ItemListResult;
  const promotions = resultValue(
    await context.executeQuery(
      operationValue(ListSandboxPromotionsQuery.create({ sandboxId: workspaceId })),
    ),
  ) as ItemListResult;
  const tasks: WorkspaceControlTaskSummary[] = [];
  for (const runtime of runtimeResult.items) {
    const runtimeId = optionalString(runtime, "runtimeId");
    if (!runtimeId) continue;
    const taskResult = resultValue(
      await context.executeQuery(
        operationValue(ListAgentTaskRunsQuery.create({ workspaceId, runtimeId })),
      ),
    ) as ItemListResult;
    tasks.push(
      ...taskResult.items
        .map(taskSummary)
        .filter((item): item is WorkspaceControlTaskSummary => item !== undefined),
    );
  }
  return {
    type: "detail",
    workspace: workspaceSummary(workspace),
    runtimes: runtimeResult.items.map(runtimeSummary),
    ports: ports.items
      .map(portSummary)
      .filter((item): item is WorkspaceControlPortSummary => item !== undefined),
    tasks,
    promotions: promotions.items
      .map(promotionSummary)
      .filter((item): item is WorkspaceControlPromotionSummary => item !== undefined),
  };
}

export function createBoundedWorkspaceControlPresentation(
  input: BoundedWorkspaceControlPresentationInput,
): WorkspaceControlPresentation {
  return {
    async start(context) {
      const renderer = await input.openRenderer();
      let selectedWorkspaceId: string | undefined;
      let activeTerminal:
        | {
            workspaceId: string;
            runtimeId: string;
            sessionId: string;
            session: TerminalSession;
            reconnect: () => Promise<{ sessionId: string; session: TerminalSession }>;
          }
        | undefined;
      const terminalPumps = new Set<Promise<void>>();

      const sendErrorBestEffort = async (error: unknown, phase: string) => {
        try {
          await renderer.send(safeError(error, phase));
        } catch {
          // The renderer may have already restored the terminal and closed after a user quit or
          // signal. A presentation error cannot be delivered to a closed viewport and must not
          // turn graceful terminal cleanup into a CLI failure.
        }
      };

      const detachActiveTerminal = async (reason?: string) => {
        const terminal = activeTerminal;
        activeTerminal = undefined;
        if (terminal) {
          await terminal.session.detach();
          if (reason) {
            await renderer.send({ type: "terminal-closed", reason });
          }
        }
      };

      const bindTerminal = async (attachment: {
        workspaceId: string;
        runtimeId: string;
        sessionId: string;
        session: TerminalSession;
        reconnect: () => Promise<{ sessionId: string; session: TerminalSession }>;
      }) => {
        const { session } = attachment;
        activeTerminal = attachment;
        await renderer.send({
          type: "terminal-ready",
          workspaceId: attachment.workspaceId,
          runtimeId: attachment.runtimeId,
          sessionId: attachment.sessionId,
        });
        let pump!: Promise<void>;
        pump = (async () => {
          try {
            for await (const frame of session) {
              if (frame.kind === "output") {
                await renderer.send({
                  type: "terminal-output",
                  stream: frame.stream,
                  data: frame.data,
                });
              } else if (frame.kind === "closed") {
                await renderer.send({
                  type: "terminal-closed",
                  reason: frame.reason,
                  ...(frame.exitCode === undefined ? {} : { exitCode: frame.exitCode }),
                });
              } else if (frame.kind === "error") {
                await renderer.send(safeError(frame.error, "workspace-control-terminal"));
              }
            }
          } catch (error) {
            await sendErrorBestEffort(error, "workspace-control-terminal");
          } finally {
            terminalPumps.delete(pump);
          }
        })();
        terminalPumps.add(pump);
      };

      const attachManagedTerminal = async (attachment: {
        workspaceId: string;
        runtimeId: string;
        sessionId: string;
      }) => {
        const gateway = context.terminalSessionGateway;
        if (!gateway) throw new Error("Terminal Session attachment gateway is unavailable");
        const reconnect = async () => ({
          sessionId: attachment.sessionId,
          session: resultValue(gateway.attach(attachment.sessionId)),
        });
        await bindTerminal({ ...attachment, ...(await reconnect()), reconnect });
      };

      try {
        await renderer.send({ type: "workspaces", workspaces: await listWorkspaces(context) });
        for await (const event of renderer.events()) {
          if (event.type === "quit") break;
          try {
            if (event.type === "select") {
              selectedWorkspaceId = event.workspaceId;
              await renderer.send(await loadDetail(context, event.workspaceId));
              continue;
            }
            if (event.type === "refresh") {
              await renderer.send({
                type: "workspaces",
                workspaces: await listWorkspaces(context),
              });
              const workspaceId = event.workspaceId ?? selectedWorkspaceId;
              if (workspaceId) await renderer.send(await loadDetail(context, workspaceId));
              continue;
            }
            if (event.type === "attach") {
              await detachActiveTerminal();
              const now = new Date(input.now?.() ?? new Date().toISOString());
              const expiresAt = new Date(now.getTime() + 10 * 60 * 1_000).toISOString();
              const descriptor = resultValue(
                await context.executeCommand(
                  operationValue(
                    IssueSandboxAgentAttachAccessCommand.create({
                      sandboxId: event.workspaceId,
                      runtimeId: event.runtimeId,
                      expiresAt,
                    }),
                  ),
                ),
              ) as Record<string, unknown>;
              if (descriptor.transport === "managed-terminal") {
                const sessionId = optionalString(descriptor, "sessionId");
                if (!sessionId)
                  throw new Error("Managed attach descriptor has no Session identity");
                await attachManagedTerminal({
                  workspaceId: event.workspaceId,
                  runtimeId: event.runtimeId,
                  sessionId,
                });
              } else if (descriptor.transport === "native-attach") {
                const openNativeTerminal = context.openNativeWorkspaceTerminal;
                if (!openNativeTerminal) throw new Error("Native attach viewport is unavailable");
                if (descriptor.clientHandoff !== "local-client-exec") {
                  throw new Error("Native attach descriptor does not permit local execution");
                }
                const argv = nativeClientCommand(descriptor);
                const reconnect = () =>
                  openNativeTerminal({
                    workspaceId: event.workspaceId,
                    runtimeId: event.runtimeId,
                    argv,
                  });
                await bindTerminal({
                  workspaceId: event.workspaceId,
                  runtimeId: event.runtimeId,
                  ...(await reconnect()),
                  reconnect,
                });
              } else {
                throw new Error("Attach descriptor has an unsupported transport");
              }
              continue;
            }
            if (event.type === "lifecycle-action") {
              if (!selectedWorkspaceId || selectedWorkspaceId !== event.workspaceId) {
                throw new Error("Workspace lifecycle action does not match the selected Workspace");
              }
              if (event.action === "pause" || event.action === "terminate") {
                await detachActiveTerminal(`workspace-${event.action}`);
              }
              if (event.action === "pause") {
                resultValue(
                  await context.executeCommand(
                    operationValue(PauseSandboxCommand.create({ sandboxId: event.workspaceId })),
                  ),
                );
              } else if (event.action === "resume") {
                resultValue(
                  await context.executeCommand(
                    operationValue(ResumeSandboxCommand.create({ sandboxId: event.workspaceId })),
                  ),
                );
              } else {
                resultValue(await terminateWorkspaceWithRuntimes(context, event.workspaceId));
              }
              await renderer.send({
                type: "workspaces",
                workspaces: await listWorkspaces(context),
              });
              await renderer.send(await loadDetail(context, event.workspaceId));
              continue;
            }
            if (event.type === "terminal-input") {
              await activeTerminal?.session.write(event.data);
              continue;
            }
            if (event.type === "terminal-resize") {
              if (event.cols > 0 && event.rows > 0) {
                await activeTerminal?.session.resize({ cols: event.cols, rows: event.rows });
              }
              continue;
            }
            if (event.type === "terminal-reconnect") {
              const terminal = activeTerminal;
              if (terminal) {
                await detachActiveTerminal();
                const reattached = await terminal.reconnect();
                await bindTerminal({
                  workspaceId: terminal.workspaceId,
                  runtimeId: terminal.runtimeId,
                  ...reattached,
                  reconnect: terminal.reconnect,
                });
              }
              continue;
            }
            if (event.type === "detach") {
              await detachActiveTerminal();
            }
          } catch (error) {
            await sendErrorBestEffort(error, `workspace-control-${event.type}`);
          }
        }
      } catch (error) {
        await sendErrorBestEffort(error, "workspace-control-start");
      } finally {
        await detachActiveTerminal();
        if (terminalPumps.size > 0) {
          await Promise.allSettled([...terminalPumps]);
        }
        await renderer.close();
      }
    },
  };
}
