import { createHash } from "node:crypto";

import { type AuditEventArchiveSourceSelection, type AuditEventDetail } from "../../ports";

interface AuditEventArchiveDigestInput {
  archiveSchemaVersion: "audit-events.archive/v1";
  source: AuditEventArchiveSourceSelection;
  eventType?: string;
  reason: string;
  retainSourceRows: boolean;
  createdAt: string;
  items: AuditEventDetail[];
  truncated: boolean;
}

export function auditEventArchiveDigest(input: AuditEventArchiveDigestInput): string {
  const canonical = canonicalJson({
    archiveSchemaVersion: input.archiveSchemaVersion,
    source: input.source,
    ...(input.eventType ? { eventType: input.eventType } : {}),
    reason: input.reason,
    retainSourceRows: input.retainSourceRows,
    createdAt: input.createdAt,
    items: input.items,
    truncated: input.truncated,
  });

  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);

  return `{${entries.join(",")}}`;
}
