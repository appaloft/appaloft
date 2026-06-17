import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import {
  sourceEventDeploymentHref,
  sourceEventRevisionLabel,
  sourceEventVisibleOutcomes,
} from "./source-events";

describe("source event console diagnostics", () => {
  test("[SRC-AUTO-ENTRY-003] exposes created deployment, dedupe, and ignored outcomes", () => {
    expect(
      sourceEventVisibleOutcomes({
        createdDeploymentIds: ["dep_created"],
        dedupeStatus: "duplicate",
        ignoredReasons: ["ref-not-matched"],
      }),
    ).toEqual([
      { kind: "created-deployment", value: "dep_created" },
      { kind: "dedupe", value: "duplicate" },
      { kind: "ignored-reason", value: "ref-not-matched" },
    ]);
    expect(sourceEventDeploymentHref("dep_created")).toBe("/deployments/dep_created");
  });

  test("[SRC-AUTO-ENTRY-003] keeps revision labels compact without changing safe source facts", () => {
    expect(sourceEventRevisionLabel("abcdef1234567890")).toBe("abcdef123456");
    expect(sourceEventRevisionLabel("main")).toBe("main");
  });

  test("[SRC-AUTO-ENTRY-003] Resource detail mounts source event diagnostics against public help anchors", async () => {
    const source = await readFile(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(source).toContain("orpc.sourceEvents.list.queryOptions");
    const sourceEventsQuerySource =
      source.match(
        /const resourceSourceEventsQuery = createQuery\(\(\) =>[\s\S]*?const resourcePreviewEnvironmentsQuery = createQuery/,
      )?.[0] ?? "";
    expect(source).toContain("const resourceSourceEventsEnabled = $derived");
    expect(source).toContain('activeTab === "jobs"');
    expect(source).toContain('activeResourceSection === "source-events"');
    expect(sourceEventsQuerySource).toContain("enabled: resourceSourceEventsEnabled");
    expect(sourceEventsQuerySource).not.toContain("enabled: browser && resourceId.length > 0,");
    expect(source).toContain("sourceEventVisibleOutcomes");
    expect(source).toContain("sourceAutoDeployDedupe");
    expect(source).toContain("sourceAutoDeployIgnoredEvents");
    expect(source).toContain("sourceAutoDeployRecovery");
  });
});
