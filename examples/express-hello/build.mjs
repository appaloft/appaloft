import { resolve } from "node:path";
import { $ } from "bun";

const distDir = resolve("dist");
await $`mkdir -p ${distDir}`;
await Bun.write(resolve(distDir, "server.js"), Bun.file(resolve("server.js")));
