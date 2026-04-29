import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  findPublicDocsErrorGuide,
  publicDocsErrorGuides,
  publicDocsHelpTopics,
  publicDocsLocales,
  resolvePublicDocsErrorAgentGuideHref,
  resolvePublicDocsErrorKnowledge,
  resolvePublicDocsHelpHref,
} from "../src";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const docsContentRoot = resolve(repositoryRoot, "apps/docs/src/content/docs");

function docsSourcePath(page: string): string {
  return resolve(docsContentRoot, `${page.replace(/^\/+|\/+$/g, "")}.md`);
}

describe("public docs help registry", () => {
  test("[PUB-DOCS-003] help topics use explicit stable public docs anchors", () => {
    const ids = new Set<string>();

    for (const topic of Object.values(publicDocsHelpTopics)) {
      expect(topic.id).toMatch(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
      expect(ids.has(topic.id)).toBe(false);
      ids.add(topic.id);
      expect(topic.anchor).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/);
      expect(topic.anchor).not.toContain(" ");
      expect(topic.surfaces.length).toBeGreaterThan(0);
      expect(topic.aliases.length).toBeGreaterThan(0);
    }
  });

  test("[PUB-DOCS-005] registered help topics resolve to locale docs source and anchors", () => {
    for (const topic of Object.values(publicDocsHelpTopics)) {
      for (const locale of publicDocsLocales) {
        const sourcePath = docsSourcePath(topic.page[locale]);

        expect(existsSync(sourcePath), `${topic.id} ${locale} page exists`).toBe(true);
        expect(readFileSync(sourcePath, "utf8")).toContain(`id="${topic.anchor}"`);
      }
    }
  });

  test("[PUB-DOCS-005] help hrefs stay under /docs and preserve locale routing", () => {
    expect(resolvePublicDocsHelpHref("deployment.source")).toBe(
      "/docs/deploy/sources/#deployment-source",
    );
    expect(resolvePublicDocsHelpHref("default-access.policy")).toBe(
      "/docs/access/generated-routes/#default-access-policy",
    );
    expect(resolvePublicDocsHelpHref("deployment.source", { locale: "en-US" })).toBe(
      "/docs/en/deploy/sources/#deployment-source",
    );
    expect(resolvePublicDocsHelpHref("deployment.source", { basePath: "help" })).toBe(
      "/help/deploy/sources/#deployment-source",
    );
  });

  test("[PUB-DOCS-016] traceable topics point to spec files and product surfaces", () => {
    const defaultAccessTopic = publicDocsHelpTopics["default-access.policy"];

    expect(defaultAccessTopic.relatedOperation).toBe("default-access-domain-policies.configure");
    expect(defaultAccessTopic.webSurfaces?.join("\n")).toContain(
      "apps/web/src/routes/servers/+page.svelte",
    );

    for (const topic of Object.values(publicDocsHelpTopics)) {
      for (const specReference of topic.specReferences ?? []) {
        expect(existsSync(resolve(repositoryRoot, specReference)), specReference).toBe(true);
      }

      for (const webSurface of topic.webSurfaces ?? []) {
        expect(webSurface.trim().length, topic.id).toBeGreaterThan(0);
      }
    }
  });

  test("[ERROR-KNOWLEDGE-002] public error guides resolve docs, agent guide, and remedies", () => {
    const guide = findPublicDocsErrorGuide({
      code: "infra_error",
      phase: "remote-state-lock",
    });

    expect(guide?.id).toBe("infra_error.remote-state-lock");
    expect(guide?.responsibility).toBe("operator");
    expect(guide?.actionability).toBe("run-diagnostic");

    const knowledge = resolvePublicDocsErrorKnowledge("infra_error.remote-state-lock");

    expect(knowledge.links?.some((link) => link.rel === "human-doc")).toBe(true);
    expect(knowledge.links?.some((link) => link.rel === "llm-guide")).toBe(true);
    expect(knowledge.remedies?.some((remedy) => remedy.safeByDefault)).toBe(true);
    expect(knowledge.remedies?.some((remedy) => remedy.kind === "command")).toBe(true);
    expect(
      existsSync(resolve(repositoryRoot, ".github/workflows/remote-state-maintenance.yml")),
    ).toBe(true);
  });

  test("[RUNTIME-CAPACITY-INSPECT-001] capacity exhaustion errors point to read-only inspect", () => {
    const guide = findPublicDocsErrorGuide({
      code: "runtime_target_resource_exhausted",
    });

    expect(guide?.topicId).toBe("diagnostics.runtime-target-capacity");

    const knowledge = resolvePublicDocsErrorKnowledge("runtime_target_resource_exhausted");

    expect(knowledge.actionability).toBe("run-diagnostic");
    expect(knowledge.remedies?.some((remedy) => remedy.kind === "diagnostic")).toBe(true);
    expect(
      knowledge.remedies?.some((remedy) =>
        remedy.command?.join(" ").includes("server capacity inspect"),
      ),
    ).toBe(true);
  });

  test("[ERROR-KNOWLEDGE-004] public error guides point to existing agent-readable assets", () => {
    for (const guide of Object.values(publicDocsErrorGuides)) {
      const agentHref = resolvePublicDocsErrorAgentGuideHref(guide.id);
      const assetPath = resolve(
        repositoryRoot,
        "apps/docs/public",
        agentHref.replace(/^\/docs\//, ""),
      );

      expect(existsSync(assetPath), `${guide.id} agent guide exists`).toBe(true);

      for (const specReference of guide.specReferences) {
        expect(existsSync(resolve(repositoryRoot, specReference)), specReference).toBe(true);
      }
    }
  });
});
