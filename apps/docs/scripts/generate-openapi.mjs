import "reflect-metadata";

import { createAppaloftOpenApiSpec } from "@appaloft/openapi";

/**
 * Writes the generated OpenAPI document to `public/openapi.json` so Astro's
 * static build copies it to `dist/openapi.json` unchanged. Per
 * `docs/documentation/public-docs-structure.md` "Reference Pages", the
 * public reference page (`src/content/docs/reference/openapi.mdx`) links
 * to/embeds this generated document rather than replacing task-oriented
 * docs pages.
 */
export async function writeAppaloftOpenApiSchema() {
  const rootPackage = await Bun.file(new URL("../../../package.json", import.meta.url)).json();
  const appVersion =
    Bun.env.APPALOFT_APP_VERSION ||
    (typeof rootPackage.version === "string" ? rootPackage.version : "0.0.0");

  const spec = await createAppaloftOpenApiSpec({
    appVersion,
  });

  const outDir = new URL("../public/", import.meta.url);
  await Bun.$`mkdir -p ${outDir.pathname}`;
  await Bun.write(new URL("openapi.json", outDir), `${JSON.stringify(spec, null, 2)}\n`);
}

if (import.meta.main) {
  await writeAppaloftOpenApiSchema();
}
