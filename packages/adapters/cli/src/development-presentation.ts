import { spawn } from "node:child_process";

import {
  type DevelopmentPlan,
  type DevelopmentSessionRuntime,
  type DevelopmentSessionView,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type WorkspaceControlRendererMessage } from "./workspace-control-presentation.js";
import {
  openLoopbackWorkspaceControlRenderer,
  resolveWorkspaceControlRendererBinary,
} from "./workspace-control-renderer.js";

export interface DevelopmentPresentationInput {
  session: DevelopmentSessionView;
  startInput: {
    plan: DevelopmentPlan;
    envFiles: readonly string[];
    environmentOverlay: Readonly<Record<string, string>>;
    https?: boolean;
    trust?: boolean;
  };
  runtime: DevelopmentSessionRuntime;
}

export interface DevelopmentControlPresentation {
  prepare?(): Result<void>;
  run(input: DevelopmentPresentationInput): Promise<Result<unknown>>;
}

export interface RatatuiDevelopmentPresentationOptions {
  binaryPath?: string;
  environment?: NodeJS.ProcessEnv;
}

function presentationError(message: string, reason: string): DomainError {
  return {
    code: "development_gateway_failed",
    category: "infra",
    message,
    retryable: true,
    details: { phase: "development-presentation", reason },
  };
}

function boundedText(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.replaceAll("\0", "").slice(0, maximum)
    : undefined;
}

function developmentMessage(value: unknown): WorkspaceControlRendererMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sourceRoot = boundedText(record.sourceRoot, 4_096);
  const state = boundedText(record.state, 80);
  if (!sourceRoot || !state) return null;
  const rawServices = Array.isArray(record.services) ? record.services : [];
  const sessionId = boundedText(record.sessionId, 160);
  const gatewayUrl = boundedText(record.gatewayUrl, 2_048);
  const services = rawServices.slice(0, 128).flatMap((service) => {
    if (!service || typeof service !== "object") return [];
    const entry = service as Record<string, unknown>;
    const key = boundedText(entry.key, 160);
    const serviceState = boundedText(entry.state, 80);
    if (!key || !serviceState) return [];
    const readiness: "ready" | "running-unverified" | "failed" | undefined =
      entry.readiness === "ready" ||
      entry.readiness === "running-unverified" ||
      entry.readiness === "failed"
        ? entry.readiness
        : undefined;
    const url = boundedText(entry.url, 2_048);
    const watch: "native" | "restart" | "none" | undefined =
      entry.watch === "native" || entry.watch === "restart" || entry.watch === "none"
        ? entry.watch
        : undefined;
    return [
      {
        key,
        state: serviceState,
        ...(typeof entry.pid === "number" && Number.isInteger(entry.pid) ? { pid: entry.pid } : {}),
        ...(url ? { url } : {}),
        ...(readiness ? { readiness } : {}),
        ...(watch ? { watch } : {}),
      },
    ];
  });
  return {
    type: "development",
    protocol: "development/v1",
    session: {
      state,
      sourceRoot,
      ...(sessionId ? { sessionId } : {}),
      ...(gatewayUrl ? { gatewayUrl } : {}),
      services,
    },
  };
}

function logMessage(value: unknown): WorkspaceControlRendererMessage {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const lines = Array.isArray(record.lines)
    ? record.lines
        .filter((line): line is string => typeof line === "string")
        .slice(-2_000)
        .map((line) => line.replaceAll("\0", "").slice(0, 8_192))
    : [];
  return { type: "development-logs", lines };
}

export function createRatatuiDevelopmentPresentation(
  options: RatatuiDevelopmentPresentationOptions = {},
): DevelopmentControlPresentation {
  const environment = options.environment ?? process.env;
  const resolveBinary = () =>
    options.binaryPath ?? resolveWorkspaceControlRendererBinary(environment);
  return {
    prepare: () =>
      resolveBinary()
        ? ok(undefined)
        : err(
            presentationError(
              "Development renderer is unavailable; build the packaged renderer or use --no-tui",
              "binary-missing",
            ),
          ),
    run: async (input) => {
      const binaryPath = resolveBinary();
      if (!binaryPath) {
        return err(
          presentationError(
            "Development renderer is unavailable; build the packaged renderer or use --no-tui",
            "binary-missing",
          ),
        );
      }

      let renderer: Awaited<ReturnType<typeof openLoopbackWorkspaceControlRenderer>> | undefined;
      try {
        renderer = await openLoopbackWorkspaceControlRenderer({
          launch: async ({ port, token }) => {
            const child = spawn(binaryPath, [], {
              shell: false,
              stdio: "inherit",
              env: {
                ...environment,
                APPALOFT_TUI_MODE: "development",
                APPALOFT_WORKSPACE_TUI_PORT: String(port),
                APPALOFT_WORKSPACE_TUI_TOKEN: token,
              },
            });
            const exited = new Promise<void>((resolveExit, rejectExit) => {
              child.once("error", rejectExit);
              child.once("exit", () => resolveExit());
            });
            return { exited, terminate: () => child.kill("SIGTERM") };
          },
        });

        const sendRefresh = async (sessionValue?: unknown) => {
          const status =
            sessionValue ??
            (await input.runtime.status({ sourceRoot: input.startInput.plan.sourceRoot })).match(
              (value) => value,
              () => null,
            );
          const message = developmentMessage(status);
          if (message) await renderer?.send(message);
          const logs = await input.runtime.logs({
            sourceRoot: input.startInput.plan.sourceRoot,
            follow: false,
            tail: 2_000,
          });
          if (logs.isOk()) await renderer?.send(logMessage(logs.value));
        };

        await sendRefresh(input.session);
        let latest: unknown = input.session;
        const events = renderer.events()[Symbol.asyncIterator]();
        let pendingEvent = events.next();
        while (true) {
          const next = await Promise.race([
            pendingEvent,
            new Promise<null>((resolveTick) => setTimeout(() => resolveTick(null), 500)),
          ]);
          if (next === null) {
            await sendRefresh();
            continue;
          }
          if (next.done) break;
          const event = next.value;
          pendingEvent = events.next();
          if (event.type === "development-detach" || event.type === "quit") break;
          if (event.type === "development-refresh") {
            await sendRefresh();
            continue;
          }
          if (event.type === "development-stop") {
            const stopped = await input.runtime.stop({
              sourceRoot: input.startInput.plan.sourceRoot,
            });
            if (stopped.isErr()) {
              await renderer.send({
                type: "error",
                code: stopped.error.code,
                phase: String(stopped.error.details?.phase ?? "development-cleanup"),
                retryable: stopped.error.retryable,
              });
            } else {
              latest = stopped.value;
              await sendRefresh(stopped.value);
              break;
            }
          }
          if (event.type === "development-restart") {
            const stopped = await input.runtime.stop({
              sourceRoot: input.startInput.plan.sourceRoot,
            });
            if (stopped.isErr()) {
              await renderer.send({
                type: "error",
                code: stopped.error.code,
                phase: String(stopped.error.details?.phase ?? "development-cleanup"),
                retryable: stopped.error.retryable,
              });
              continue;
            }
            const restarted = await input.runtime.start({
              ...input.startInput,
              detach: true,
            });
            if (restarted.isErr()) {
              await renderer.send({
                type: "error",
                code: restarted.error.code,
                phase: String(restarted.error.details?.phase ?? "development-start"),
                retryable: restarted.error.retryable,
              });
            } else {
              latest = restarted.value;
              await sendRefresh(restarted.value);
            }
          }
        }
        return ok(latest);
      } catch (error) {
        return err(
          presentationError(
            "Development renderer failed",
            error instanceof Error ? error.message : String(error),
          ),
        );
      } finally {
        await renderer?.close().catch(() => undefined);
      }
    },
  };
}
