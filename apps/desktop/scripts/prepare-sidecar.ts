import { join, resolve } from "node:path";

import { chmodExecutable } from "../../../scripts/release/lib/release-utils";
import {
  detectHostReleaseBinaryTarget,
  findReleaseBinaryTarget,
  findReleaseBinaryTargetByTauriTriple,
  normalizeReleaseVersion,
} from "../../../scripts/release/lib/targets";

const root = resolve(import.meta.dir, "../../..");
const sidecarDir = join(root, "apps", "desktop", "src-tauri", "binaries");

function detectReleaseTarget() {
  const configuredTarget = process.env.APPALOFT_BINARY_TARGET;
  if (configuredTarget) {
    const target = findReleaseBinaryTarget(configuredTarget);
    if (!target) {
      throw new Error(`Unsupported APPALOFT_BINARY_TARGET=${configuredTarget}`);
    }
    return target;
  }

  const configuredTriple = process.env.APPALOFT_TAURI_TARGET_TRIPLE;
  if (configuredTriple) {
    const target = findReleaseBinaryTargetByTauriTriple(configuredTriple);
    if (!target) {
      throw new Error(`Unsupported APPALOFT_TAURI_TARGET_TRIPLE=${configuredTriple}`);
    }
    return target;
  }

  return detectHostReleaseBinaryTarget();
}

const releaseTarget = detectReleaseTarget();
const targetTriple = process.env.APPALOFT_TAURI_TARGET_TRIPLE ?? releaseTarget.tauriTriple;
const version = normalizeReleaseVersion(process.env.APPALOFT_APP_VERSION ?? "0.1.0");
const bundleDir =
  process.env.APPALOFT_BINARY_BUNDLE_DIR ??
  join(root, "dist", "release", `appaloft-v${version}-${releaseTarget.name}`);
const legacyBundleDir = join(root, "dist", "release", "appaloft-binary-bundle");
const sourceBundleDir = (await Bun.file(join(bundleDir, releaseTarget.executableName)).exists())
  ? bundleDir
  : legacyBundleDir;
const sourceBinaryPath = join(sourceBundleDir, releaseTarget.executableName);
const targetBinaryName =
  releaseTarget.os === "win32" ? `appaloft-${targetTriple}.exe` : `appaloft-${targetTriple}`;
const targetBinaryPath = join(sidecarDir, targetBinaryName);

if (!(await Bun.file(sourceBinaryPath).exists())) {
  throw new Error(
    `Missing Appaloft backend binary at ${sourceBinaryPath}. Run bun run package:binary-bundle -- --target ${releaseTarget.name} first.`,
  );
}

await Bun.write(targetBinaryPath, Bun.file(sourceBinaryPath));
await chmodExecutable(targetBinaryPath);

console.log(`prepared Tauri sidecar ${targetBinaryPath}`);
