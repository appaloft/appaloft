import { defineCollection } from "astro:content";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";

const localeStateSchema = z.enum(["complete", "stub", "needs-update", "deferred"]);

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        // Nimbus docs are agent-friendly by default. Set `audience: human`
        // to flag a page that's written primarily for human readers.
        audience: z.literal("human").optional(),
        /**
         * Public Documentation Structure (IA v3) page-type and locale
         * governance fields — see
         * `docs/documentation/public-docs-structure.md` "Cloud-Only
         * Content" and "Localization" sections for the frontmatter shape
         * every page (including Cloud-injected pages) must carry.
         */
        docType: z
          .enum(["task", "concept", "reference", "troubleshooting", "index"])
          .default("concept"),
        localeState: z
          .object({
            "zh-CN": localeStateSchema,
            "en-US": localeStateSchema,
          })
          .optional(),
        searchAliases: z.array(z.string()).default([]),
        relatedOperations: z.array(z.string()).default([]),
      },
    }),
  ),
  partials: defineCollection(partialsCollection()),
};
