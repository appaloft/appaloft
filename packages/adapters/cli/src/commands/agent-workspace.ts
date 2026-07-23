import {
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCommand,
  ExposeSandboxPortCommand,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  OpenTerminalSessionCommand,
  PauseSandboxCommand,
  ResumeSandboxCommand,
  ShowSandboxQuery,
  TerminateSandboxCommand,
} from "@appaloft/application";
import { domainError } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import {
  CliRuntime,
  optionalNumber,
  optionalValue,
  print,
  resultToEffect,
  runCommand,
  runTerminalCommand,
} from "../runtime.js";

const workspaceId = Args.text({ name: "workspaceId" });
const terminalDirectory = Options.text("directory").pipe(Options.optional);
const terminalRows = Options.text("rows").pipe(Options.withDefault("24"));
const terminalCols = Options.text("cols").pipe(Options.withDefault("80"));
const attachTerminal = Options.boolean("attach").pipe(Options.withDefault(false));

interface SandboxResult {
  readonly sandboxId: string;
  readonly status: string;
  readonly [key: string]: unknown;
}

interface AgentRuntimeResult {
  readonly runtimeId: string;
  readonly [key: string]: unknown;
}

interface SandboxListResult {
  readonly items: readonly SandboxResult[];
  readonly [key: string]: unknown;
}

interface AgentRuntimeListResult {
  readonly items: readonly AgentRuntimeResult[];
}

function requireWorkspaceId(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  throw domainError.infra("Workspace creation returned no Sandbox id", {
    code: "agent_workspace_sandbox_id_missing",
  });
}

const create = EffectCommand.make(
  "create",
  {
    harness: Options.choice("harness", ["pi", "opencode"] as const).pipe(Options.withDefault("pi")),
    sandboxTemplate: Options.text("sandbox-template"),
    harnessTemplate: Options.text("harness-template").pipe(Options.optional),
    isolation: Options.choice("isolation", [
      "container-trusted",
      "gvisor",
      "kata",
      "microvm",
    ] as const),
    cpuMillis: Options.integer("cpu-millis"),
    memoryBytes: Options.integer("memory-bytes"),
    diskBytes: Options.integer("disk-bytes"),
    maxProcesses: Options.integer("max-processes"),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
    provider: Options.text("provider").pipe(Options.optional),
    idempotencyKey: Options.text("idempotency-key").pipe(Options.optional),
  },
  ({
    cpuMillis,
    diskBytes,
    expiresAt,
    harness,
    harnessTemplate,
    idempotencyKey,
    isolation,
    maxProcesses,
    memoryBytes,
    provider,
    sandboxTemplate,
  }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const sandboxCommand = yield* resultToEffect(
        CreateSandboxCommand.create({
          source: { kind: "template", templateId: sandboxTemplate },
          requestedIsolation: isolation,
          limits: { cpuMillis, memoryBytes, diskBytes, maxProcesses },
          networkPolicy: { mode: "deny", rules: [] },
          ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
          ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
        }),
      );
      const sandbox = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(sandboxCommand)),
      );
      const sandboxDescriptor = sandbox as SandboxResult;
      const sandboxId = requireWorkspaceId(sandboxDescriptor.sandboxId);
      const selectedHarnessTemplate =
        optionalValue(harnessTemplate) ??
        (harness === "pi" ? "aht_pi_managed_v1" : "aht_opencode_managed_v1");
      const runtimeCommand = yield* resultToEffect(
        CreateSandboxAgentRuntimeCommand.create({
          sandboxId,
          harnessKey: harness,
          harnessTemplateId: selectedHarnessTemplate,
          idempotencyKey: optionalValue(idempotencyKey) ?? crypto.randomUUID(),
        }),
      );
      const runtime = yield* resultToEffect(
        yield* Effect.promise(() => cli.executeCommand(runtimeCommand)),
      ).pipe(
        Effect.mapError((error) => ({
          ...error,
          message: `Agent Workspace Runtime creation failed after Sandbox ${sandboxId} was created`,
          details: {
            ...error.details,
            phase: "agent-workspace-runtime-create",
            workspaceId: sandboxId,
            sandboxId,
            harness,
          },
        })),
      );

      yield* print({
        workspaceId: sandboxId,
        sandbox: sandboxDescriptor,
        agent: runtime,
      });
    }),
).pipe(
  EffectCommand.withDescription(
    "Create a public Agent Workspace backed by a Sandbox and Pi or OpenCode",
  ),
);

const list = EffectCommand.make(
  "list",
  {
    limit: Options.text("limit").pipe(Options.optional),
    offset: Options.text("offset").pipe(Options.optional),
  },
  ({ limit, offset }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const query = yield* resultToEffect(
        ListSandboxesQuery.create({
          ...(optionalNumber(limit) !== undefined ? { limit: optionalNumber(limit) } : {}),
          ...(optionalNumber(offset) !== undefined ? { offset: optionalNumber(offset) } : {}),
        }),
      );
      const sandboxList = (yield* resultToEffect(
        yield* Effect.promise(() => cli.executeQuery(query)),
      )) as SandboxListResult;
      const items = yield* Effect.all(
        sandboxList.items.map((sandbox) =>
          Effect.gen(function* () {
            const runtimeQuery = yield* resultToEffect(
              ListSandboxAgentRuntimesQuery.create({ sandboxId: sandbox.sandboxId }),
            );
            const agents = (yield* resultToEffect(
              yield* Effect.promise(() => cli.executeQuery(runtimeQuery)),
            )) as AgentRuntimeListResult;
            return {
              workspaceId: sandbox.sandboxId,
              sandbox,
              agents: agents.items,
            };
          }),
        ),
        { concurrency: 8 },
      );
      yield* print({ ...sandboxList, items });
    }),
).pipe(EffectCommand.withDescription("List public Agent Workspaces"));

const show = EffectCommand.make("show", { workspaceId }, ({ workspaceId }) =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const sandboxQuery = yield* resultToEffect(ShowSandboxQuery.create({ sandboxId: workspaceId }));
    const runtimeQuery = yield* resultToEffect(
      ListSandboxAgentRuntimesQuery.create({ sandboxId: workspaceId }),
    );
    const [sandbox, agents] = yield* Effect.all(
      [
        Effect.promise(() => cli.executeQuery(sandboxQuery)).pipe(Effect.flatMap(resultToEffect)),
        Effect.promise(() => cli.executeQuery(runtimeQuery)).pipe(Effect.flatMap(resultToEffect)),
      ],
      { concurrency: 2 },
    );
    yield* print({
      workspaceId,
      sandbox,
      agents: (agents as AgentRuntimeListResult).items,
    });
  }),
);

const pause = EffectCommand.make("pause", { workspaceId }, ({ workspaceId }) =>
  runCommand(PauseSandboxCommand.create({ sandboxId: workspaceId })),
);
const resume = EffectCommand.make("resume", { workspaceId }, ({ workspaceId }) =>
  runCommand(ResumeSandboxCommand.create({ sandboxId: workspaceId })),
);
const terminate = EffectCommand.make("terminate", { workspaceId }, ({ workspaceId }) =>
  runCommand(TerminateSandboxCommand.create({ sandboxId: workspaceId })),
);

const terminal = EffectCommand.make(
  "terminal",
  {
    workspaceId,
    directory: terminalDirectory,
    rows: terminalRows,
    cols: terminalCols,
    attach: attachTerminal,
  },
  ({ attach, cols, directory, rows, workspaceId }) =>
    runTerminalCommand(
      OpenTerminalSessionCommand.create({
        scope: { kind: "sandbox", sandboxId: workspaceId },
        ...(optionalValue(directory) ? { relativeDirectory: optionalValue(directory) } : {}),
        initialRows: Number(rows),
        initialCols: Number(cols),
      }),
      {
        attach,
        initialRows: Number(rows),
        initialCols: Number(cols),
      },
    ),
);

const preview = EffectCommand.make(
  "preview",
  {
    workspaceId,
    port: Options.integer("port"),
    visibility: Options.choice("visibility", ["private", "organization", "public"] as const).pipe(
      Options.withDefault("private"),
    ),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
  },
  ({ expiresAt, port, visibility, workspaceId }) =>
    runCommand(
      ExposeSandboxPortCommand.create({
        sandboxId: workspaceId,
        port,
        visibility,
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
      }),
    ),
);

export const agentWorkspaceCommand = EffectCommand.make("workspace").pipe(
  EffectCommand.withDescription("Create and operate public Agent Workspaces with Pi or OpenCode"),
  EffectCommand.withSubcommands([create, list, show, pause, resume, terminate, terminal, preview]),
);
