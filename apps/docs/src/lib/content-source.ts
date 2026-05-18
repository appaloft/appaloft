import { loader, type MetaData, type PageData } from "fumadocs-core/source";
import { type DocsCollectionEntry } from "fumadocs-mdx/runtime/server";
import { docsBase } from "@/lib/config";
import { docs } from "../../.source/server";

type AppaloftDocsFrontmatter = PageData & {
  docType: "task" | "concept" | "reference" | "troubleshooting" | "index";
  localeState: {
    "zh-CN": "complete" | "stub" | "needs-update" | "deferred";
    "en-US": "complete" | "stub" | "needs-update" | "deferred";
  };
  searchAliases: string[];
  relatedOperations: string[];
  template?: string;
  hero?: unknown;
  sidebar?: {
    label?: string;
    order?: number;
  };
};

export const docsCollection = docs as unknown as DocsCollectionEntry<
  "docs",
  AppaloftDocsFrontmatter,
  MetaData
>;

export const contentSource = loader({
  baseUrl: docsBase,
  source: docsCollection.toFumadocsSource(),
});
