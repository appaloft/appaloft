#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const appaloftCliPackageJson = require.resolve("@appaloft/cli/package.json");
const appaloftCliBin = join(dirname(appaloftCliPackageJson), "bin", "appaloft.js");
const args = process.argv.slice(2);
const mcpArgs = args.length === 0 ? ["mcp", "stdio"] : ["mcp", ...args];

const result = spawnSync(process.execPath, [appaloftCliBin, ...mcpArgs], {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
