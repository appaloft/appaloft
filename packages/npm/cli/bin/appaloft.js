#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function detectLinuxLibc() {
  if (process.platform !== "linux") {
    return undefined;
  }

  if (process.report?.getReport().header.glibcVersionRuntime) {
    return "gnu";
  }

  return "musl";
}

function packageName() {
  const arch = process.arch;

  if (process.platform === "darwin" && (arch === "arm64" || arch === "x64")) {
    return `@appaloft/cli-darwin-${arch}`;
  }

  if (process.platform === "linux" && (arch === "arm64" || arch === "x64")) {
    return `@appaloft/cli-linux-${arch}-${detectLinuxLibc()}`;
  }

  if (process.platform === "win32" && (arch === "arm64" || arch === "x64")) {
    return `@appaloft/cli-win32-${arch}`;
  }

  return undefined;
}

function resolveBinary() {
  const selectedPackage = packageName();
  if (!selectedPackage) {
    throw new Error(`Unsupported Appaloft platform: ${process.platform}/${process.arch}`);
  }

  const packageJsonPath = require.resolve(`${selectedPackage}/package.json`);
  const binaryName = process.platform === "win32" ? "appaloft.exe" : "appaloft";
  const binaryPath = join(dirname(packageJsonPath), "bin", binaryName);

  if (!existsSync(binaryPath)) {
    throw new Error(`Installed Appaloft package ${selectedPackage} is missing ${binaryName}`);
  }

  return binaryPath;
}

const binaryPath = resolveBinary();
const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
