import {
  AcceptSandboxPromotionCommand,
  CancelSandboxAgentRunCommand,
  ConfigureSandboxNetworkPolicyCommand,
  CreateSandboxAgentRunCommand,
  CreateSandboxAgentRuntimeCommand,
  CreateSandboxCandidatePreviewCommand,
  CreateSandboxCommand,
  CreateSandboxSnapshotCommand,
  CreateSandboxSourceArtifactCommand,
  CreateSandboxTemplateCommand,
  DeleteSandboxCandidatePreviewCommand,
  DeleteSandboxSnapshotCommand,
  DeleteSandboxSourceArtifactCommand,
  DeleteSandboxTemplateCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  ListSandboxAgentApprovalsQuery,
  ListSandboxAgentRunEventsQuery,
  ListSandboxAgentRunsQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListSandboxFilesQuery,
  ListSandboxPortsQuery,
  ListSandboxProcessesQuery,
  ListSandboxPromotionsQuery,
  ListSandboxSnapshotsQuery,
  ListSandboxSourceArtifactsQuery,
  ListSandboxTemplatesQuery,
  PauseSandboxCommand,
  PlanSandboxPromotionCommand,
  ReadSandboxFileQuery,
  RemoveSandboxFileCommand,
  ResolveSandboxAgentApprovalCommand,
  ResumeSandboxCommand,
  RetrySandboxPromotionCommand,
  RevokeSandboxPortCommand,
  ShowSandboxAgentApprovalQuery,
  ShowSandboxAgentRunQuery,
  ShowSandboxAgentRuntimeQuery,
  ShowSandboxCandidatePreviewQuery,
  ShowSandboxProcessQuery,
  ShowSandboxPromotionQuery,
  ShowSandboxQuery,
  ShowSandboxSnapshotQuery,
  ShowSandboxSourceArtifactQuery,
  ShowSandboxTemplateQuery,
  TerminateSandboxAgentRuntimeCommand,
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
const runtimeId = Args.text({ name: "runtimeId" });
const runId = Args.text({ name: "runId" });
const approvalId = Args.text({ name: "approvalId" });
const artifactId = Args.text({ name: "artifactId" });
const previewId = Args.text({ name: "previewId" });
const promotionId = Args.text({ name: "promotionId" });
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

const agentRuntimeCreate = EffectCommand.make(
  "create",
  {
    sandboxId,
    harness: Options.text("harness").pipe(Options.withDefault("pi")),
    template: Options.text("template").pipe(Options.withDefault("aht_pi_managed_v1")),
    idempotencyKey: Options.text("idempotency-key"),
  },
  ({ harness, idempotencyKey, sandboxId, template }) =>
    runCommand(
      CreateSandboxAgentRuntimeCommand.create({
        sandboxId,
        harnessKey: harness,
        harnessTemplateId: template,
        idempotencyKey,
      }),
    ),
);
const agentRuntimeList = EffectCommand.make("list", { sandboxId }, ({ sandboxId }) =>
  runQuery(ListSandboxAgentRuntimesQuery.create({ sandboxId })),
);
const agentRuntimeShow = EffectCommand.make("show", { sandboxId, runtimeId }, (input) =>
  runQuery(ShowSandboxAgentRuntimeQuery.create(input)),
);
const agentRuntimeTerminate = EffectCommand.make("terminate", { sandboxId, runtimeId }, (input) =>
  runCommand(TerminateSandboxAgentRuntimeCommand.create(input)),
);
const agentRuntime = EffectCommand.make("runtime").pipe(
  EffectCommand.withSubcommands([
    agentRuntimeCreate,
    agentRuntimeList,
    agentRuntimeShow,
    agentRuntimeTerminate,
  ]),
);

const agentRunCreate = EffectCommand.make(
  "create",
  {
    sandboxId,
    runtimeId,
    task: Options.text("task"),
    continueFrom: Options.text("continue-from").pipe(Options.optional),
    idempotencyKey: Options.text("idempotency-key"),
  },
  ({ continueFrom, idempotencyKey, runtimeId, sandboxId, task }) => {
    const parentRunId = optionalValue(continueFrom);
    return runCommand(
      CreateSandboxAgentRunCommand.create({
        sandboxId,
        runtimeId,
        task,
        context: parentRunId ? { mode: "continue", parentRunId } : { mode: "fresh" },
        idempotencyKey,
      }),
    );
  },
);
const agentRunList = EffectCommand.make("list", { runtimeId }, ({ runtimeId }) =>
  runQuery(ListSandboxAgentRunsQuery.create({ runtimeId })),
);
const agentRunShow = EffectCommand.make("show", { runtimeId, runId }, (input) =>
  runQuery(ShowSandboxAgentRunQuery.create(input)),
);
const agentRunCancel = EffectCommand.make("cancel", { runtimeId, runId }, (input) =>
  runCommand(CancelSandboxAgentRunCommand.create(input)),
);
const agentRunEvents = EffectCommand.make(
  "events",
  { runId, afterSequence: Options.text("after-sequence").pipe(Options.optional), limit },
  ({ afterSequence, limit, runId }) =>
    runQuery(
      ListSandboxAgentRunEventsQuery.create({
        runId,
        ...(optionalNumber(afterSequence) !== undefined
          ? { afterSequence: optionalNumber(afterSequence) }
          : {}),
        ...(optionalNumber(limit) !== undefined ? { limit: optionalNumber(limit) } : {}),
      }),
    ),
);
const agentRun = EffectCommand.make("run").pipe(
  EffectCommand.withSubcommands([
    agentRunCreate,
    agentRunList,
    agentRunShow,
    agentRunCancel,
    agentRunEvents,
  ]),
);
const agentApprovalList = EffectCommand.make("list", { runId }, ({ runId }) =>
  runQuery(ListSandboxAgentApprovalsQuery.create({ runId })),
);
const agentApprovalShow = EffectCommand.make("show", { approvalId }, ({ approvalId }) =>
  runQuery(ShowSandboxAgentApprovalQuery.create({ approvalId })),
);
const agentApprovalResolve = EffectCommand.make(
  "resolve",
  {
    approvalId,
    decision: Options.choice("decision", ["approve", "reject"] as const),
  },
  ({ approvalId, decision }) =>
    runCommand(ResolveSandboxAgentApprovalCommand.create({ approvalId, decision })),
);
const agentApproval = EffectCommand.make("approval").pipe(
  EffectCommand.withSubcommands([agentApprovalList, agentApprovalShow, agentApprovalResolve]),
);
const agent = EffectCommand.make("agent").pipe(
  EffectCommand.withSubcommands([agentRuntime, agentRun, agentApproval]),
);

const artifactCreate = EffectCommand.make(
  "create",
  { sandboxId, sourceRoot: Options.text("source-root").pipe(Options.withDefault("app")) },
  ({ sandboxId, sourceRoot }) =>
    runCommand(CreateSandboxSourceArtifactCommand.create({ sandboxId, sourceRoot })),
);
const artifactList = EffectCommand.make("list", { sandboxId }, ({ sandboxId }) =>
  runQuery(ListSandboxSourceArtifactsQuery.create({ sandboxId })),
);
const artifactShow = EffectCommand.make("show", { artifactId }, ({ artifactId }) =>
  runQuery(ShowSandboxSourceArtifactQuery.create({ artifactId })),
);
const artifactDelete = EffectCommand.make("delete", { artifactId }, ({ artifactId }) =>
  runCommand(DeleteSandboxSourceArtifactCommand.create({ artifactId })),
);
const artifact = EffectCommand.make("artifact").pipe(
  EffectCommand.withSubcommands([artifactCreate, artifactList, artifactShow, artifactDelete]),
);

const previewCreate = EffectCommand.make("create", { artifactId }, ({ artifactId }) =>
  runCommand(CreateSandboxCandidatePreviewCommand.create({ artifactId })),
);
const previewShow = EffectCommand.make("show", { previewId }, ({ previewId }) =>
  runQuery(ShowSandboxCandidatePreviewQuery.create({ previewId })),
);
const previewDelete = EffectCommand.make("delete", { previewId }, ({ previewId }) =>
  runCommand(DeleteSandboxCandidatePreviewCommand.create({ previewId })),
);
const preview = EffectCommand.make("preview").pipe(
  EffectCommand.withSubcommands([previewCreate, previewShow, previewDelete]),
);

const promotePlan = EffectCommand.make(
  "plan",
  {
    sandboxId,
    artifactId,
    digest: Options.text("digest"),
    previewId: Options.text("preview-id"),
    projectId: Options.text("project-id"),
    environmentId: Options.text("environment-id"),
    destinationId: Options.text("destination-id").pipe(Options.optional),
    resourceName: Options.text("resource-name"),
  },
  ({
    artifactId,
    destinationId,
    digest,
    environmentId,
    previewId,
    projectId,
    resourceName,
    sandboxId,
  }) =>
    runCommand(
      PlanSandboxPromotionCommand.create({
        sandboxId,
        artifactId,
        expectedArtifactDigest: digest,
        candidatePreviewId: previewId,
        target: {
          projectId,
          environmentId,
          resourceName,
          ...(optionalValue(destinationId) ? { destinationId: optionalValue(destinationId) } : {}),
        },
      }),
    ),
);
const promoteList = EffectCommand.make("list", { sandboxId }, ({ sandboxId }) =>
  runQuery(ListSandboxPromotionsQuery.create({ sandboxId })),
);
const promoteShow = EffectCommand.make("show", { promotionId }, ({ promotionId }) =>
  runQuery(ShowSandboxPromotionQuery.create({ promotionId })),
);
const promoteAccept = EffectCommand.make(
  "accept",
  {
    promotionId,
    digest: Options.text("digest"),
    idempotencyKey: Options.text("idempotency-key"),
  },
  ({ digest, idempotencyKey, promotionId }) =>
    runCommand(
      AcceptSandboxPromotionCommand.create({
        promotionId,
        expectedArtifactDigest: digest,
        idempotencyKey,
      }),
    ),
);
const promoteRetry = EffectCommand.make(
  "retry",
  { promotionId, idempotencyKey: Options.text("idempotency-key") },
  (input) => runCommand(RetrySandboxPromotionCommand.create(input)),
);
const promote = EffectCommand.make("promote").pipe(
  EffectCommand.withSubcommands([
    promotePlan,
    promoteList,
    promoteShow,
    promoteAccept,
    promoteRetry,
  ]),
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
    agent,
    artifact,
    preview,
    promote,
  ]),
);
