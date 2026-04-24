import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";

const localeState = z.enum(["complete", "stub", "needs-update", "deferred"]);

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
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
      }),
    }),
  }),
};
