import {
  remarkAdmonition,
  remarkCodeTab,
  remarkMdxFiles,
  remarkNpm,
  remarkSteps,
} from "fumadocs-core/mdx-plugins";
import { pageSchema } from "fumadocs-core/source/schema";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { z } from "zod";

const localeState = z.enum(["complete", "stub", "needs-update", "deferred"]);
const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);

export const docs = defineDocs({
  dir: "src/content/docs",
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
    schema: pageSchema.extend({
      docType: z
        .enum(["task", "concept", "reference", "troubleshooting", "index"])
        .default("reference"),
      localeState: z
        .object({
          "zh-CN": localeState,
          "en-US": localeState,
        })
        .default({
          "zh-CN": "complete",
          "en-US": "complete",
        }),
      searchAliases: z.array(z.string()).default([]),
      relatedOperations: z.array(z.string()).default([]),
      template: z.string().optional(),
      hero: z.unknown().optional(),
      sidebar: z
        .object({
          label: z.string().optional(),
          order: z.number().optional(),
        })
        .optional(),
    }),
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      remarkAdmonition,
      remarkSteps,
      [remarkNpm, { persist: { id: "appaloft-package-manager" } }],
      remarkCodeTab,
      remarkMdxFiles,
    ],
    remarkImageOptions: {
      useImport: false,
    },
    rehypePlugins: [rehypeAppaloftDocsBaseLinks],
  },
});

function normalizeDocsBase(value: string | undefined): string {
  const trimmed = value?.trim() || "/docs";
  if (trimmed === "/") return "/";

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function rewriteDocsPathForBase(value: string): string {
  if (value === "/docs") {
    return docsBase;
  }

  if (!value.startsWith("/docs/")) {
    return value;
  }

  const docsBasePrefix = docsBase === "/" ? "" : docsBase;
  return `${docsBasePrefix}${value.slice("/docs".length)}` || "/";
}

type HastElement = {
  type?: unknown;
  properties?: Record<string, unknown>;
  children?: unknown[];
};

function rewriteElementProperty(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  if (typeof value === "string") {
    properties[key] = rewriteDocsPathForBase(value);
  }
}

function rewriteDocsBaseLinks(node: unknown) {
  if (!node || typeof node !== "object") {
    return;
  }

  const element = node as HastElement;
  if (element.type === "element" && element.properties) {
    rewriteElementProperty(element.properties, "href");
    rewriteElementProperty(element.properties, "src");
  }

  if (Array.isArray(element.children)) {
    for (const child of element.children) {
      rewriteDocsBaseLinks(child);
    }
  }
}

function rehypeAppaloftDocsBaseLinks() {
  return (tree: unknown) => rewriteDocsBaseLinks(tree);
}
