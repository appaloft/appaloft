import {
  ConfigureSandboxNetworkPolicyCommand,
  CreateSandboxCommand,
  CreateSandboxSnapshotCommand,
  CreateSandboxTemplateCommand,
  DeleteSandboxSnapshotCommand,
  DeleteSandboxTemplateCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  ListSandboxesQuery,
  ListSandboxFilesQuery,
  ListSandboxPortsQuery,
  ListSandboxProcessesQuery,
  ListSandboxSnapshotsQuery,
  ListSandboxTemplatesQuery,
  PauseSandboxCommand,
  ReadSandboxFileQuery,
  RemoveSandboxFileCommand,
  ResumeSandboxCommand,
  RevokeSandboxPortCommand,
  ShowSandboxProcessQuery,
  ShowSandboxQuery,
  ShowSandboxSnapshotQuery,
  ShowSandboxTemplateQuery,
  TerminateSandboxCommand,
  TerminateSandboxProcessCommand,
  WriteSandboxFileCommand,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";

const sandboxId = Args.text({ name: "sandboxId" });
const snapshotId = Args.text({ name: "snapshotId" });
const templateId = Args.text({ name: "templateId" });
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
    image: Options.text("image").pipe(Options.optional),
    snapshot: Options.text("snapshot").pipe(Options.optional),
    template: Options.text("template").pipe(Options.optional),
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
  ({
    cpuMillis,
    diskBytes,
    expiresAt,
    image,
    isolation,
    maxProcesses,
    memoryBytes,
    provider,
    snapshot,
    template,
  }) => {
    const imageValue = optionalValue(image);
    const snapshotValue = optionalValue(snapshot);
    const templateValue = optionalValue(template);
    const selectedSources = [imageValue, snapshotValue, templateValue].filter(Boolean);
    return runCommand(
      CreateSandboxCommand.create({
        source:
          selectedSources.length !== 1
            ? { kind: "invalid" }
            : imageValue
              ? { kind: "image", image: imageValue }
              : snapshotValue
                ? { kind: "snapshot", snapshotId: snapshotValue }
                : { kind: "template", templateId: templateValue },
        requestedIsolation: isolation,
        limits: { cpuMillis, memoryBytes, diskBytes, maxProcesses },
        networkPolicy: { mode: "deny", rules: [] },
        ...(optionalValue(expiresAt) ? { expiresAt: optionalValue(expiresAt) } : {}),
        ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
      }),
    );
  },
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
    stdinBase64: Options.text("stdin-base64").pipe(Options.optional),
  },
  ({ arg, background, cwd, sandboxId, stdinBase64, timeoutMs }) =>
    runCommand(
      ExecuteSandboxCommand.create({
        sandboxId,
        argv: arg,
        ...(optionalValue(cwd) ? { cwd: optionalValue(cwd) } : {}),
        ...(background ? { background } : {}),
        ...(optionalNumber(timeoutMs) !== undefined
          ? { timeoutMs: optionalNumber(timeoutMs) }
          : {}),
        ...(optionalValue(stdinBase64) ? { stdinBase64: optionalValue(stdinBase64) } : {}),
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
const processShow = EffectCommand.make(
  "show",
  { sandboxId, processId },
  ({ processId, sandboxId }) => runQuery(ShowSandboxProcessQuery.create({ sandboxId, processId })),
);
const processTerminate = EffectCommand.make(
  "terminate",
  { sandboxId, processId },
  ({ processId, sandboxId }) =>
    runCommand(TerminateSandboxProcessCommand.create({ sandboxId, processId })),
);
const process = EffectCommand.make("process").pipe(
  EffectCommand.withSubcommands([processList, processShow, processTerminate]),
);

const networkDeny = EffectCommand.make("deny", { sandboxId }, ({ sandboxId }) =>
  runCommand(
    ConfigureSandboxNetworkPolicyCommand.create({
      sandboxId,
      networkPolicy: { mode: "deny", rules: [] },
    }),
  ),
);
const network = EffectCommand.make("network").pipe(EffectCommand.withSubcommands([networkDeny]));

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
const snapshotDelete = EffectCommand.make("delete", { snapshotId }, ({ snapshotId }) =>
  runCommand(DeleteSandboxSnapshotCommand.create({ snapshotId })),
);
const snapshot = EffectCommand.make("snapshot").pipe(
  EffectCommand.withSubcommands([snapshotCreate, snapshotList, snapshotShow, snapshotDelete]),
);

const templateCreate = EffectCommand.make(
  "create",
  {
    name: Options.text("name"),
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
  },
  ({ cpuMillis, diskBytes, image, isolation, maxProcesses, memoryBytes, name }) =>
    runCommand(
      CreateSandboxTemplateCommand.create({
        name,
        image,
        minimumIsolation: isolation,
        limits: { cpuMillis, memoryBytes, diskBytes, maxProcesses },
        networkPolicy: { mode: "deny", rules: [] },
      }),
    ),
);
const templateList = EffectCommand.make("list", { limit, offset }, ({ limit, offset }) =>
  runQuery(ListSandboxTemplatesQuery.create(page(limit, offset))),
);
const templateShow = EffectCommand.make("show", { templateId }, ({ templateId }) =>
  runQuery(ShowSandboxTemplateQuery.create({ templateId })),
);
const templateDelete = EffectCommand.make("delete", { templateId }, ({ templateId }) =>
  runCommand(DeleteSandboxTemplateCommand.create({ templateId })),
);
const template = EffectCommand.make("template").pipe(
  EffectCommand.withSubcommands([templateCreate, templateList, templateShow, templateDelete]),
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
    network,
    port,
    snapshot,
    template,
  ]),
);
