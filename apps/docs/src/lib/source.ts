import { loader, multiple } from "fumadocs-core/source";
import { openapiPlugin, openapiSource } from "fumadocs-openapi/server";
import { docsBase } from "@/lib/config";
import { docsCollection } from "@/lib/content-source";
import { openapi } from "@/lib/openapi";

export const source = loader(
  multiple({
    docs: docsCollection.toFumadocsSource(),
    openapi: await openapiSource(openapi, {
      baseDir: "reference/openapi",
    }),
  }),
  {
    baseUrl: docsBase,
    plugins: [openapiPlugin()],
  },
);
