const docsHost = Bun.env.APPALOFT_DEV_DOCS_HOST || "127.0.0.1";
const docsPort = Bun.env.APPALOFT_DEV_DOCS_PORT || "4322";

const child = Bun.spawn(["bun", "astro", "dev", "--host", docsHost, "--port", docsPort], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    child.kill(signal);
  });
}

process.exit(await child.exited);
