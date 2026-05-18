import { existsSync } from "node:fs";

await import("./generate-openapi.mjs").then(({ writeAppaloftOpenApiSchema }) =>
  writeAppaloftOpenApiSchema(),
);

const build = Bun.spawn(["bun", "next", "build", "--webpack"], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

const buildExitCode = await build.exited;
if (buildExitCode !== 0) {
  process.exit(buildExitCode);
}

await Bun.$`rm -rf dist`;
await Bun.$`cp -R out dist`;

const catchAllChunkAliases = [
  {
    source: "dist/_next/static/chunks/app/[[...slug]]",
    target: "dist/_next/static/chunks/app/__catchall_slug__",
  },
  {
    source: "dist/_next/static/chunks/app/en/[[...slug]]",
    target: "dist/_next/static/chunks/app/en/__catchall_slug__",
  },
];

for (const alias of catchAllChunkAliases) {
  if (existsSync(alias.source)) {
    await Bun.$`rm -rf ${alias.target}`;
    await Bun.$`cp -R ${alias.source} ${alias.target}`;
  }
}

const textAssets = new Bun.Glob("**/*.{html,txt,js,json}");
for await (const file of textAssets.scan({ cwd: "dist", absolute: true, onlyFiles: true })) {
  const text = await Bun.file(file).text();
  const updated = text.replaceAll("%5B%5B...slug%5D%5D", "__catchall_slug__");
  if (updated !== text) {
    await Bun.write(file, updated);
  }
}
