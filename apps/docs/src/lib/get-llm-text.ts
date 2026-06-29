import { readFile } from "node:fs/promises";
import { openApiSchemaPath } from "@/lib/openapi";
import { source } from "@/lib/source";

type SourcePage = ReturnType<typeof source.getPages>[number];

export async function getLLMText(page: SourcePage): Promise<string> {
  const heading = `# ${page.data.title} (${page.url})`;

  if (page.data.type === "openapi") {
    return [heading, page.data.description, renderOpenAPIOperations(page)]
      .filter(Boolean)
      .join("\n\n");
  }

  const processed = await page.data.getText("processed");
  return [heading, page.data.description, processed].filter(Boolean).join("\n\n");
}

export async function getLLMFullText(): Promise<string> {
  const docsPages = source.getPages().filter((page) => page.data.type !== "openapi");
  const pageTexts = await Promise.all(docsPages.map(getLLMText));
  const openApiSchema = await readFile(openApiSchemaPath, "utf8");

  return [
    "# Appaloft Docs Full Context",
    "This file is generated from public Appaloft documentation and the public OpenAPI schema.",
    ...pageTexts,
    "# Appaloft OpenAPI Schema",
    "```json",
    openApiSchema,
    "```",
  ].join("\n\n");
}

function renderOpenAPIOperations(page: SourcePage): string {
  if (page.data.type !== "openapi") return "";

  const operations = page.data.getOpenAPIPageProps().operations ?? [];
  if (operations.length === 0)
    return "OpenAPI operation details are available in the public schema.";

  return operations
    .map((operation) => `- ${operation.method.toUpperCase()} ${operation.path}`)
    .join("\n");
}
