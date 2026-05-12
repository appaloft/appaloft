import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventArchiveResult,
  type AuditEventArchiveSourceSelection,
  type AuditEventArchiveStore,
  type AuditEventReadModel,
  type Clock,
  type IdGenerator,
} from "../../ports";
import { tokens } from "../../tokens";
import { auditEventArchiveDigest } from "./audit-event-archive-digest";
import { type CreateAuditEventArchiveCommand } from "./create-audit-event-archive.command";

@injectable()
export class CreateAuditEventArchiveUseCase {
  constructor(
    @inject(tokens.auditEventReadModel)
    private readonly auditEventReadModel: AuditEventReadModel,
    @inject(tokens.auditEventArchiveStore)
    private readonly archiveStore: AuditEventArchiveStore,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    command: CreateAuditEventArchiveCommand,
  ): Promise<Result<AuditEventArchiveResult>> {
    if (!command.aggregateId && (!command.from || !command.to)) {
      return err(
        domainError.auditEventArchiveScopeRequired(
          "Audit event archive requires aggregate id or bounded global window",
          { phase: "audit-event-archive-create" },
        ),
      );
    }

    try {
      const repositoryContext = toRepositoryContext(context);
      const source = archiveSourceFromCommand(command);
      const page = command.aggregateId
        ? await this.auditEventReadModel.export(repositoryContext, {
            aggregateId: command.aggregateId,
            ...(command.eventType ? { eventType: command.eventType } : {}),
            ...(command.from ? { from: command.from } : {}),
            ...(command.to ? { to: command.to } : {}),
            limit: command.limit,
          })
        : await this.auditEventReadModel.exportGlobal(repositoryContext, {
            from: command.from ?? "",
            to: command.to ?? "",
            ...(command.eventType ? { eventType: command.eventType } : {}),
            limit: command.limit,
          });

      const createdAt = this.clock.now();
      const contentDigest = auditEventArchiveDigest({
        archiveSchemaVersion: "audit-events.archive/v1",
        source,
        ...(command.eventType ? { eventType: command.eventType } : {}),
        reason: command.reason,
        retainSourceRows: command.retainSourceRows,
        createdAt,
        items: page.items,
        truncated: page.truncated,
      });
      const archive = await this.archiveStore.create(repositoryContext, {
        archiveId: this.idGenerator.next("aar"),
        source,
        ...(command.eventType ? { eventType: command.eventType } : {}),
        reason: command.reason,
        items: page.items,
        truncated: page.truncated,
        contentDigest,
        retainSourceRows: command.retainSourceRows,
        createdAt,
      });

      if (archive.isErr()) {
        return err(archive.error);
      }

      return ok({
        schemaVersion: "audit-events.archives.archive/v1",
        archive: archive.value,
      });
    } catch (error) {
      return err(
        domainError.infra("Audit event archive could not be created", {
          commandName: "audit-events.archives.create",
          phase: "audit-event-archive-create",
          reason: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
  }
}

function archiveSourceFromCommand(
  command: CreateAuditEventArchiveCommand,
): AuditEventArchiveSourceSelection {
  if (command.aggregateId) {
    return {
      kind: "aggregate",
      aggregateId: command.aggregateId,
      ...(command.from ? { from: command.from } : {}),
      ...(command.to ? { to: command.to } : {}),
    };
  }

  return {
    kind: "global-window",
    from: command.from ?? "",
    to: command.to ?? "",
  };
}
