import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventArchiveShowResult,
  type AuditEventArchiveStore,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowAuditEventArchiveQuery } from "./show-audit-event-archive.query";

@injectable()
export class ShowAuditEventArchiveQueryService {
  constructor(
    @inject(tokens.auditEventArchiveStore)
    private readonly archiveStore: AuditEventArchiveStore,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowAuditEventArchiveQuery,
  ): Promise<Result<AuditEventArchiveShowResult>> {
    const archive = await this.archiveStore.findOne(toRepositoryContext(context), query.archiveId);

    if (archive.isErr()) {
      return err(archive.error);
    }

    if (!archive.value) {
      return err(
        domainError.auditEventArchiveNotFound("Audit event archive was not found", {
          phase: "audit-event-archive-show",
          archiveId: query.archiveId,
        }),
      );
    }

    return ok({
      schemaVersion: "audit-events.archives.show/v1",
      archive: archive.value,
      generatedAt: this.clock.now(),
    });
  }
}
