import "reflect-metadata";

import { createAppaloftOpenApiSpec } from "@appaloft/openapi";

export async function writeAppaloftOpenApiSchema() {
  const rootPackage = await Bun.file(new URL("../../../package.json", import.meta.url)).json();
  const appVersion =
    Bun.env.APPALOFT_APP_VERSION ||
    (typeof rootPackage.version === "string" ? rootPackage.version : "0.0.0");

  const spec = await createAppaloftOpenApiSpec({
    appVersion,
  });

  const outDir = new URL("../.fumadocs/", import.meta.url);
  await Bun.$`mkdir -p ${outDir.pathname}`;
  await Bun.write(new URL("appaloft-openapi.json", outDir), `${JSON.stringify(spec, null, 2)}\n`);
}
