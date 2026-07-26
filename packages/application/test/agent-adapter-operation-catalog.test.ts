import { describe, expect, test } from "bun:test";
import { type OperationCatalogEntry, operationCatalog } from "../src/operation-catalog";

describe("Agent Adapter operation catalog", () => {
  test("[ADAPTER-SURFACE-011] lifecycle operations share schemas and public transports", () => {
    const expected = new Map<string, OperationCatalogEntry["kind"]>([
      ["agent-adapters.validate", "query"],
      ["agent-adapters.install", "command"],
      ["agent-adapters.list", "query"],
      ["agent-adapters.show", "query"],
      ["agent-adapters.disable", "command"],
      ["agent-adapters.uninstall", "command"],
    ]);
    const entries: readonly OperationCatalogEntry[] = operationCatalog;

    for (const [key, kind] of expected) {
      const entry = entries.find((candidate) => candidate.key === key);
      expect(entry, key).toBeDefined();
      expect(entry?.kind, key).toBe(kind);
      expect(entry?.domain, key).toBe("agent-adapters");
      expect(entry?.inputSchema, key).toBeDefined();
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc, key).toBeDefined();
    }
  });
});
