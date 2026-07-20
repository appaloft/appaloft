import {
  CreateSandboxCommand,
  CreateSandboxSnapshotCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  ListSandboxesQuery,
  ListSandboxFilesQuery,
  ListSandboxPortsQuery,
  ListSandboxProcessesQuery,
  ListSandboxSnapshotsQuery,
  PauseSandboxCommand,
  ReadSandboxFileQuery,
  RemoveSandboxFileCommand,
  ResumeSandboxCommand,
  RevokeSandboxPortCommand,
  ShowSandboxQuery,
  ShowSandboxSnapshotQuery,
  TerminateSandboxCommand,
  TerminateSandboxProcessCommand,
  WriteSandboxFileCommand,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";

const sandboxId = Args.text({ name: "sandboxId" });
const snapshotId = Args.text({ name: "snapshotId" });
const processId = Args.text({ name: "processId" });
const exposureId = Args.text({ name: "exposureId" });
const path = Options.text("path");
const limit = Options.text("limit").pipe(Options.optional);
const offset = Options.text("offset").pipe(Options.optional);

function page(
  limitValue: Parameters<typeof optionalNumber>[0],
  offsetValue: Parameters<typeof optionalNumber>[0],
) {
  return {
    ...(optionalNumber(limitValue) !== undefined ? { limit: optionalNumber(limitValue) } : {}),
    ...(optionalNumber(offsetValue) !== undefined ? { offset: optionalNumber(offsetValue) } : {}),
  };
}

const create = EffectCommand.make(
  "create",
  {
    image: Options.text("image"),
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
  },
  ({ cpuMillis, diskBytes, expiresAt, image, isolation, maxProcesses, memoryBytes, provider }) =>
    runCommand(
      CreateSandboxCommand.create({
        source: { kind: "image", image },
        requestedIsolation: isolation,
        limits: { cpuMillis, memoryBytes, diskBytes, maxProcesses },
        networkPolicy: { mode: "deny", rules: [] },
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
        ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription("Create an isolated execution Sandbox"));

const list = EffectCommand.make("list", { limit, offset }, ({ limit, offset }) =>
  runQuery(ListSandboxesQuery.create(page(limit, offset))),
);
const show = EffectCommand.make("show", { sandboxId }, ({ sandboxId }) =>
  runQuery(ShowSandboxQuery.create({ sandboxId })),
);
const pause = EffectCommand.make("pause", { sandboxId }, ({ sandboxId }) =>
  runCommand(PauseSandboxCommand.create({ sandboxId })),
);
const resume = EffectCommand.make("resume", { sandboxId }, ({ sandboxId }) =>
  runCommand(ResumeSandboxCommand.create({ sandboxId })),
);
const terminate = EffectCommand.make("terminate", { sandboxId }, ({ sandboxId }) =>
  runCommand(TerminateSandboxCommand.create({ sandboxId })),
);
const exec = EffectCommand.make(
  "exec",
  {
    sandboxId,
    arg: Options.text("arg").pipe(Options.repeated),
    cwd: Options.text("cwd").pipe(Options.optional),
    background: Options.boolean("background").pipe(Options.withDefault(false)),
    timeoutMs: Options.text("timeout-ms").pipe(Options.optional),
  },
  ({ arg, background, cwd, sandboxId, timeoutMs }) =>
    runCommand(
      ExecuteSandboxCommand.create({
        sandboxId,
        argv: arg,
        ...(optionalValue(cwd) ? { cwd: optionalValue(cwd) } : {}),
        ...(background ? { background } : {}),
        ...(optionalNumber(timeoutMs) !== undefined
          ? { timeoutMs: optionalNumber(timeoutMs) }
          : {}),
      }),
    ),
);

const fileList = EffectCommand.make("list", { sandboxId, path }, ({ path, sandboxId }) =>
  runQuery(ListSandboxFilesQuery.create({ sandboxId, path })),
);
const fileRead = EffectCommand.make("read", { sandboxId, path }, ({ path, sandboxId }) =>
  runQuery(ReadSandboxFileQuery.create({ sandboxId, path })),
);
const fileWrite = EffectCommand.make(
  "write",
  { sandboxId, path, contentBase64: Options.text("content-base64") },
  ({ contentBase64, path, sandboxId }) =>
    runCommand(WriteSandboxFileCommand.create({ sandboxId, path, contentBase64 })),
);
const fileRemove = EffectCommand.make(
  "remove",
  {
    sandboxId,
    path,
    recursive: Options.boolean("recursive").pipe(Options.withDefault(false)),
  },
  ({ path, recursive, sandboxId }) =>
    runCommand(
      RemoveSandboxFileCommand.create({ sandboxId, path, ...(recursive ? { recursive } : {}) }),
    ),
);
const file = EffectCommand.make("file").pipe(
  EffectCommand.withSubcommands([fileList, fileRead, fileWrite, fileRemove]),
);

const processList = EffectCommand.make("list", { sandboxId }, ({ sandboxId }) =>
  runQuery(ListSandboxProcessesQuery.create({ sandboxId })),
);
const processTerminate = EffectCommand.make(
  "terminate",
  { sandboxId, processId },
  ({ processId, sandboxId }) =>
    runCommand(TerminateSandboxProcessCommand.create({ sandboxId, processId })),
);
const process = EffectCommand.make("process").pipe(
  EffectCommand.withSubcommands([processList, processTerminate]),
);

const portExpose = EffectCommand.make(
  "expose",
  {
    sandboxId,
    port: Options.integer("port"),
    visibility: Options.choice("visibility", ["private", "organization", "public"] as const).pipe(
      Options.withDefault("private"),
    ),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
  },
  ({ expiresAt, port, sandboxId, visibility }) =>
    runCommand(
      ExposeSandboxPortCommand.create({
        sandboxId,
        port,
        visibility,
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
      }),
    ),
);
const portList = EffectCommand.make("list", { sandboxId }, ({ sandboxId }) =>
  runQuery(ListSandboxPortsQuery.create({ sandboxId })),
);
const portRevoke = EffectCommand.make(
  "revoke",
  { sandboxId, exposureId },
  ({ exposureId, sandboxId }) =>
    runCommand(RevokeSandboxPortCommand.create({ sandboxId, exposureId })),
);
const port = EffectCommand.make("port").pipe(
  EffectCommand.withSubcommands([portExpose, portList, portRevoke]),
);

const snapshotCreate = EffectCommand.make(
  "create",
  {
    sandboxId,
    capability: Options.choice("capability", ["filesystem", "filesystem-memory"] as const).pipe(
      Options.withDefault("filesystem"),
    ),
    expiresAt: Options.text("expires-at").pipe(Options.optional),
  },
  ({ capability, expiresAt, sandboxId }) =>
    runCommand(
      CreateSandboxSnapshotCommand.create({
        sandboxId,
        capability,
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
      }),
    ),
);
const snapshotList = EffectCommand.make("list", { limit, offset }, ({ limit, offset }) =>
  runQuery(ListSandboxSnapshotsQuery.create(page(limit, offset))),
);
const snapshotShow = EffectCommand.make("show", { snapshotId }, ({ snapshotId }) =>
  runQuery(ShowSandboxSnapshotQuery.create({ snapshotId })),
);
const snapshot = EffectCommand.make("snapshot").pipe(
  EffectCommand.withSubcommands([snapshotCreate, snapshotList, snapshotShow]),
);

export const sandboxCommand = EffectCommand.make("sandbox").pipe(
  EffectCommand.withDescription("Operate isolated execution Sandboxes"),
  EffectCommand.withSubcommands([
    create,
    list,
    show,
    pause,
    resume,
    terminate,
    exec,
    file,
    process,
    port,
    snapshot,
  ]),
);
