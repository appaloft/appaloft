import {
  ConfigureAuditEventLegalHoldCommand,
  CreateAuditEventArchiveCommand,
  ExportAuditEventsQuery,
  ExportGlobalAuditEventsQuery,
  ListAuditEventArchivesQuery,
  ListAuditEventLegalHoldsQuery,
  ListAuditEventsQuery,
  PruneAuditEventArchivesCommand,
  PruneAuditEventsCommand,
  ReleaseAuditEventLegalHoldCommand,
  ShowAuditEventArchiveQuery,
  ShowAuditEventLegalHoldQuery,
  ShowAuditEventQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const auditEventIdArg = Args.text({ name: "auditEventId" });
const archiveIdArg = Args.text({ name: "archiveId" });
const holdIdArg = Args.text({ name: "holdId" });
const aggregateOption = Options.text("aggregate").pipe(Options.optional);
const eventTypeOption = Options.text("event-type").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const cursorOption = Options.text("cursor").pipe(Options.optional);
const fromOption = Options.text("from").pipe(Options.optional);
const orderOption = Options.choice("order", ["asc", "desc"] as const).pipe(Options.optional);
const toOption = Options.text("to").pipe(Options.optional);
const beforeOption = Options.text("before");
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(true));
const reasonOption = Options.text("reason");
const requestedByOption = Options.text("requested-by").pipe(Options.optional);
const releasedByOption = Options.text("released-by").pipe(Options.optional);
const retainSourceRowsOption = Options.boolean("retain-source-rows").pipe(
  Options.withDefault(false),
);
const statusOption = Options.choice("status", ["active", "released"] as const).pipe(
  Options.optional,
);

function optionalLimit(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

const listCommand = EffectCommand.make(
  "list",
  {
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    limit: limitOption,
    cursor: cursorOption,
  },
  ({ aggregate, cursor, eventType, limit }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListAuditEventsQuery.create({
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventList));

const showCommand = EffectCommand.make(
  "show",
  {
    auditEventId: auditEventIdArg,
    aggregate: aggregateOption,
  },
  ({ aggregate, auditEventId }) =>
    runQuery(
      ShowAuditEventQuery.create({
        auditEventId,
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventShow));

const exportCommand = EffectCommand.make(
  "export",
  {
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    from: fromOption,
    to: toOption,
    limit: limitOption,
  },
  ({ aggregate, eventType, from, limit, to }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ExportAuditEventsQuery.create({
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(optionalValue(from) ? { from: optionalValue(from) } : {}),
        ...(optionalValue(to) ? { to: optionalValue(to) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventExport));

const exportGlobalCommand = EffectCommand.make(
  "export-global",
  {
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    from: fromOption,
    to: toOption,
    limit: limitOption,
    cursor: cursorOption,
    order: orderOption,
  },
  ({ aggregate, cursor, eventType, from, limit, order, to }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ExportGlobalAuditEventsQuery.create({
        from: optionalValue(from) ?? "",
        to: optionalValue(to) ?? "",
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
        ...(optionalValue(order) ? { order: optionalValue(order) as "asc" | "desc" } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventExportGlobal));

const pruneCommand = EffectCommand.make(
  "prune",
  {
    before: beforeOption,
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    dryRun: dryRunOption,
  },
  ({ aggregate, before, dryRun, eventType }) =>
    runCommand(
      PruneAuditEventsCommand.create({
        before,
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventPrune));

const legalHoldConfigureCommand = EffectCommand.make(
  "configure",
  {
    reason: reasonOption,
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    from: fromOption,
    to: toOption,
    requestedBy: requestedByOption,
  },
  ({ aggregate, eventType, from, reason, requestedBy, to }) =>
    runCommand(
      ConfigureAuditEventLegalHoldCommand.create({
        reason,
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(optionalValue(from) ? { from: optionalValue(from) } : {}),
        ...(optionalValue(to) ? { to: optionalValue(to) } : {}),
        ...(optionalValue(requestedBy) ? { requestedBy: optionalValue(requestedBy) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventLegalHoldConfigure));

const legalHoldListCommand = EffectCommand.make(
  "list",
  {
    status: statusOption,
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    limit: limitOption,
    cursor: cursorOption,
  },
  ({ aggregate, cursor, eventType, limit, status }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListAuditEventLegalHoldsQuery.create({
        ...(optionalValue(status)
          ? { status: optionalValue(status) as "active" | "released" }
          : {}),
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventLegalHoldList));

const legalHoldShowCommand = EffectCommand.make(
  "show",
  {
    holdId: holdIdArg,
  },
  ({ holdId }) => runQuery(ShowAuditEventLegalHoldQuery.create({ holdId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventLegalHoldShow));

const legalHoldReleaseCommand = EffectCommand.make(
  "release",
  {
    holdId: holdIdArg,
    reason: reasonOption,
    releasedBy: releasedByOption,
  },
  ({ holdId, reason, releasedBy }) =>
    runCommand(
      ReleaseAuditEventLegalHoldCommand.create({
        holdId,
        releaseReason: reason,
        ...(optionalValue(releasedBy) ? { releasedBy: optionalValue(releasedBy) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventLegalHoldRelease));

const legalHoldCommand = EffectCommand.make("legal-hold").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.auditEventLegalHold),
  EffectCommand.withSubcommands([
    legalHoldConfigureCommand,
    legalHoldListCommand,
    legalHoldShowCommand,
    legalHoldReleaseCommand,
  ]),
);

const archiveCreateCommand = EffectCommand.make(
  "create",
  {
    reason: reasonOption,
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    from: fromOption,
    to: toOption,
    limit: limitOption,
    retainSourceRows: retainSourceRowsOption,
  },
  ({ aggregate, eventType, from, limit, reason, retainSourceRows, to }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runCommand(
      CreateAuditEventArchiveCommand.create({
        reason,
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(optionalValue(from) ? { from: optionalValue(from) } : {}),
        ...(optionalValue(to) ? { to: optionalValue(to) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        retainSourceRows,
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventArchiveCreate));

const archiveListCommand = EffectCommand.make(
  "list",
  {
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    from: fromOption,
    to: toOption,
    limit: limitOption,
    cursor: cursorOption,
  },
  ({ aggregate, cursor, eventType, from, limit, to }) => {
    const parsedLimit = optionalLimit(optionalValue(limit));

    return runQuery(
      ListAuditEventArchivesQuery.create({
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        ...(optionalValue(from) ? { from: optionalValue(from) } : {}),
        ...(optionalValue(to) ? { to: optionalValue(to) } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
        ...(optionalValue(cursor) ? { cursor: optionalValue(cursor) } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventArchiveList));

const archiveShowCommand = EffectCommand.make(
  "show",
  {
    archiveId: archiveIdArg,
  },
  ({ archiveId }) => runQuery(ShowAuditEventArchiveQuery.create({ archiveId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventArchiveShow));

const archivePruneCommand = EffectCommand.make(
  "prune",
  {
    before: beforeOption,
    aggregate: aggregateOption,
    eventType: eventTypeOption,
    dryRun: dryRunOption,
  },
  ({ aggregate, before, dryRun, eventType }) =>
    runCommand(
      PruneAuditEventArchivesCommand.create({
        before,
        ...(optionalValue(aggregate) ? { aggregateId: optionalValue(aggregate) } : {}),
        ...(optionalValue(eventType) ? { eventType: optionalValue(eventType) } : {}),
        dryRun,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.auditEventArchivePrune));

const archiveCommand = EffectCommand.make("archive").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.auditEventArchive),
  EffectCommand.withSubcommands([
    archiveCreateCommand,
    archiveListCommand,
    archiveShowCommand,
    archivePruneCommand,
  ]),
);

export const auditEventCommand = EffectCommand.make("audit-event").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.auditEvent),
  EffectCommand.withSubcommands([
    listCommand,
    showCommand,
    exportCommand,
    exportGlobalCommand,
    pruneCommand,
    archiveCommand,
    legalHoldCommand,
  ]),
);
