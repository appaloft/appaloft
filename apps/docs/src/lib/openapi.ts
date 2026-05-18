import { join } from "node:path";
import { createOpenAPI } from "fumadocs-openapi/server";

export const openApiSchemaPath = join(process.cwd(), ".fumadocs", "appaloft-openapi.json");

export const openapi = createOpenAPI({
  input: [openApiSchemaPath],
});
