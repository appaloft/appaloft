import { writeAppaloftOpenApiSchema } from "./generate-openapi.mjs";

await writeAppaloftOpenApiSchema();

const build = Bun.spawn(["bun", "astro", "build"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await build.exited);
