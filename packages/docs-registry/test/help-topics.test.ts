import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publicDocsHelpTopics, publicDocsLocales, resolvePublicDocsHelpHref } from "../src";

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
    expect(resolvePublicDocsHelpHref("deployment.source", { locale: "en-US" })).toBe(
      "/docs/en/deploy/sources/#deployment-source",
    );
    expect(resolvePublicDocsHelpHref("deployment.source", { basePath: "help" })).toBe(
      "/help/deploy/sources/#deployment-source",
    );
  });
});
