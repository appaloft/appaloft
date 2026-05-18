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
