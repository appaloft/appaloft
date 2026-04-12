import { dirname, join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "../../..");
const sidecarDir = join(root, "apps", "desktop", "src-tauri", "binaries");
const sourceBinaryName = process.platform === "win32" ? "yundu.exe" : "yundu";
const sourceBinaryPath = join(root, "dist", "release", "yundu-binary-bundle", sourceBinaryName);

function detectTargetTriple(): string {
  const configuredTriple = process.env.YUNDU_TAURI_TARGET_TRIPLE;
  if (configuredTriple) {
    return configuredTriple;
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "aarch64-unknown-linux-gnu";
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return "aarch64-pc-windows-msvc";
  }

  throw new Error(
    `Unsupported Tauri sidecar target for platform=${process.platform} arch=${process.arch}. Set YUNDU_TAURI_TARGET_TRIPLE explicitly.`,
  );
}

const targetTriple = detectTargetTriple();
const targetBinaryName =
  process.platform === "win32" ? `yundu-${targetTriple}.exe` : `yundu-${targetTriple}`;
const targetBinaryPath = join(sidecarDir, targetBinaryName);

if (!(await Bun.file(sourceBinaryPath).exists())) {
  throw new Error(
    `Missing Yundu backend binary at ${sourceBinaryPath}. Run bun run package:binary-bundle first.`,
  );
}

await $`mkdir -p ${dirname(targetBinaryPath)}`;
await Bun.write(targetBinaryPath, Bun.file(sourceBinaryPath));

if (process.platform !== "win32") {
  await $`chmod 755 ${targetBinaryPath}`;
}

console.log(`prepared Tauri sidecar ${targetBinaryPath}`);
