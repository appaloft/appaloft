import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AuditEventGlobalExportResult,
  type AuditEventReadModel,
  type Clock,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ExportGlobalAuditEventsQuery } from "./export-global-audit-events.query";

@injectable()
export class ExportGlobalAuditEventsQueryService {
  constructor(
    @inject(tokens.auditEventReadModel)
    private readonly auditEventReadModel: AuditEventReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ExportGlobalAuditEventsQuery,
  ): Promise<Result<AuditEventGlobalExportResult>> {
    const page = await this.auditEventReadModel.exportGlobal(toRepositoryContext(context), {
      from: query.from,
      to: query.to,
      ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
      order: query.order,
    });

    return ok({
      schemaVersion: "audit-events.export-global/v1",
      filters: {
        from: query.from,
        to: query.to,
        ...(query.aggregateId ? { aggregateId: query.aggregateId } : {}),
        ...(query.eventType ? { eventType: query.eventType } : {}),
        ...(query.organizationId ? { organizationId: query.organizationId } : {}),
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.resourceType ? { resourceType: query.resourceType } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        order: query.order,
      },
      itemCount: page.items.length,
      ...page,
      generatedAt: this.clock.now(),
    });
  }
}
