import { dirname, join, relative, sep } from "node:path";

import {
  chmodExecutable,
  copyFileIfExists,
  listFiles,
  removePath,
  resetDir,
  run,
  runNothrow,
} from "./release-utils";
import { createStaticAssetArchive } from "./static-asset-archive";
import { detectHostReleaseBinaryTarget, type ReleaseBinaryTarget } from "./targets";

function toImportSpecifier(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

export async function createBinaryEntryModule(input: {
  entryPath: string;
  root: string;
  version: string;
  embeddedWebAssetsArchivePath: string;
  embeddedDocsAssetsArchivePath: string;
  pgliteFsBundlePath: string;
  pgliteWasmPath: string;
  initdbWasmPath: string;
  reflectMetadataPath?: string;
}): Promise<void> {
  const runModulePath = join(input.root, "apps", "shell", "src", "run.ts");
  const runModuleSpecifier = toImportSpecifier(input.entryPath, runModulePath);
  const reflectMetadataPath =
    input.reflectMetadataPath ??
    Bun.resolveSync("reflect-metadata", join(input.root, "apps", "shell", "src", "index.ts"));
  const reflectMetadataSpecifier = toImportSpecifier(input.entryPath, reflectMetadataPath);
  const staticAssetArchiveModulePath = join(
    input.root,
    "scripts",
    "release",
    "lib",
    "static-asset-archive.ts",
  );
  const staticAssetArchiveModuleSpecifier = toImportSpecifier(
    input.entryPath,
    staticAssetArchiveModulePath,
  );
  const embeddedWebAssetsArchiveSpecifier = toImportSpecifier(
    input.entryPath,
    input.embeddedWebAssetsArchivePath,
  );
  const embeddedDocsAssetsArchiveSpecifier = toImportSpecifier(
    input.entryPath,
    input.embeddedDocsAssetsArchivePath,
  );
  const pgliteFsBundleSpecifier = toImportSpecifier(input.entryPath, input.pgliteFsBundlePath);
  const pgliteWasmSpecifier = toImportSpecifier(input.entryPath, input.pgliteWasmPath);
  const initdbWasmSpecifier = toImportSpecifier(input.entryPath, input.initdbWasmPath);

  await Bun.write(
    input.entryPath,
    `import "${reflectMetadataSpecifier}";

import pgliteFsBundlePath from "${pgliteFsBundleSpecifier}" with { type: "file" };
import pgliteWasmPath from "${pgliteWasmSpecifier}" with { type: "file" };
import initdbWasmPath from "${initdbWasmSpecifier}" with { type: "file" };
import embeddedWebAssetsArchivePath from "${embeddedWebAssetsArchiveSpecifier}" with { type: "file" };
import embeddedDocsAssetsArchivePath from "${embeddedDocsAssetsArchiveSpecifier}" with { type: "file" };

import { loadEmbeddedStaticAssetsArchive } from "${staticAssetArchiveModuleSpecifier}";

if (!process.env.APPALOFT_APP_VERSION) {
	process.env.APPALOFT_APP_VERSION = ${JSON.stringify(input.version)};
}

async function loadEmbeddedPgliteRuntimeAssets() {
	const [pgliteWasmModule, initdbWasmModule] = await Promise.all([
		Bun.file(pgliteWasmPath)
			.arrayBuffer()
			.then((buffer) => WebAssembly.compile(buffer)),
		Bun.file(initdbWasmPath)
			.arrayBuffer()
			.then((buffer) => WebAssembly.compile(buffer)),
	]);

	return {
		fsBundle: Bun.file(pgliteFsBundlePath),
		pgliteWasmModule,
		initdbWasmModule,
	};
}

function shouldUseEmbeddedPglite(): boolean {
	const driver = process.env.APPALOFT_DATABASE_DRIVER?.toLowerCase();
	return !driver || driver === "pglite";
}

const { runShellCli } = await import("${runModuleSpecifier}");
const [embeddedWebAssets, embeddedDocsAssets] = await Promise.all([
	loadEmbeddedStaticAssetsArchive(embeddedWebAssetsArchivePath),
	loadEmbeddedStaticAssetsArchive(embeddedDocsAssetsArchivePath),
]);

await runShellCli({
	embeddedWebAssets,
	embeddedDocsAssets,
	...(shouldUseEmbeddedPglite()
		? {
				pgliteRuntimeAssets: await loadEmbeddedPgliteRuntimeAssets(),
			}
		: {}),
});
`,
  );
}

function bundleLauncher(): string {
  return `#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

export APPALOFT_DATABASE_DRIVER="\${APPALOFT_DATABASE_DRIVER:-pglite}"
if [ -z "\${APPALOFT_DATA_DIR:-}" ]; then
	case "$(uname -s 2>/dev/null || echo unknown)" in
		Darwin)
			if [ -n "\${HOME:-}" ]; then
				APPALOFT_DATA_DIR="$HOME/Library/Application Support/Appaloft/data"
			else
				APPALOFT_DATA_DIR="$PWD/.appaloft/data"
			fi
			;;
		*)
			if [ -n "\${XDG_DATA_HOME:-}" ]; then
				APPALOFT_DATA_DIR="$XDG_DATA_HOME/appaloft/data"
			elif [ -n "\${HOME:-}" ]; then
				APPALOFT_DATA_DIR="$HOME/.local/share/appaloft/data"
			else
				APPALOFT_DATA_DIR="$PWD/.appaloft/data"
			fi
			;;
	esac
	export APPALOFT_DATA_DIR
fi
export APPALOFT_PGLITE_DATA_DIR="\${APPALOFT_PGLITE_DATA_DIR:-$APPALOFT_DATA_DIR/pglite}"

exec "$SCRIPT_DIR/appaloft" "$@"
`;
}

export function bundleReadme(input: { version: string; target: ReleaseBinaryTarget }): string {
  return `Appaloft Binary Bundle

Version: ${input.version}
Target: ${input.target.name}

Contents:
- appaloft: Bun-compiled backend/CLI executable
- run-appaloft.sh: launcher that defaults to embedded PGlite

The binary embeds:
- PGlite runtime assets (fs bundle + wasm)
- Web console static assets
- Public documentation static assets

Default runtime behavior:
- APPALOFT_DATABASE_DRIVER defaults to pglite
- APPALOFT_DATA_DIR defaults to the platform user data directory
- APPALOFT_PGLITE_DATA_DIR defaults to $APPALOFT_DATA_DIR/pglite

Optional overrides:
- Set APPALOFT_DATABASE_DRIVER=postgres and APPALOFT_DATABASE_URL=... to use external PostgreSQL
- Set APPALOFT_WEB_STATIC_DIR=/path/to/web-build to override embedded console assets
- Set APPALOFT_DOCS_STATIC_DIR=/path/to/docs-dist to override embedded documentation assets

Examples:
  ./run-appaloft.sh db migrate
  ./run-appaloft.sh serve
  ./run-appaloft.sh doctor
`;
}

async function adHocSignDarwinExecutable(binaryPath: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  // Bun --compile mutates Bun's signed executable, so replace the stale signature.
  await runNothrow(["codesign", "--remove-signature", binaryPath], dirname(binaryPath), {
    quiet: true,
  });
  await run(["codesign", "--force", "--sign", "-", binaryPath], dirname(binaryPath));
}

export async function createBinaryBundle(input: {
  root: string;
  outDir: string;
  skipWebBuild?: boolean;
  skipDocsBuild?: boolean;
  target?: ReleaseBinaryTarget;
  version?: string;
}): Promise<void> {
  const target = input.target ?? detectHostReleaseBinaryTarget();
  const version = input.version ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0";
  const webRoot = join(input.root, "apps", "web");
  const webBuildDir = join(webRoot, "build");
  const docsRoot = join(input.root, "apps", "docs");
  const docsBuildDir = join(docsRoot, "dist");
  const binaryPath = join(input.outDir, target.executableName);
  const tempBuildRoot = join(input.root, "dist", ".tmp-binary-bundle");
  const embeddedWebAssetsArchivePath = join(tempBuildRoot, "embedded-web-assets.tar.gz");
  const embeddedDocsAssetsArchivePath = join(tempBuildRoot, "embedded-docs-assets.tar.gz");
  const binaryEntryPath = join(tempBuildRoot, "binary-entry.ts");
  const pglitePackageEntry = Bun.resolveSync(
    "@electric-sql/pglite",
    join(input.root, "packages", "persistence", "pg", "src", "index.ts"),
  );
  const pgliteDistDir = dirname(pglitePackageEntry);
  const pgliteFsBundlePath = join(pgliteDistDir, "pglite.data");
  const pgliteWasmPath = join(pgliteDistDir, "pglite.wasm");
  const initdbWasmPath = join(pgliteDistDir, "initdb.wasm");

  await resetDir(input.outDir);
  await resetDir(tempBuildRoot);
  process.env.APPALOFT_APP_VERSION = version;

  if (!input.skipWebBuild) {
    await removePath(webBuildDir);
    await run(["bun", "run", "build"], webRoot);
  }
  if (!input.skipDocsBuild) {
    await removePath(docsBuildDir);
    await run(["bun", "run", "build"], docsRoot);
  }

  const webBuildFiles = await listFiles(webBuildDir);
  const docsBuildFiles = await listFiles(docsBuildDir);

  if (webBuildFiles.length === 0) {
    throw new Error(`Missing web build output at ${webBuildDir}`);
  }
  if (docsBuildFiles.length === 0) {
    throw new Error(`Missing docs build output at ${docsBuildDir}`);
  }

  await createStaticAssetArchive({
    archivePath: embeddedWebAssetsArchivePath,
    files: webBuildFiles,
    staticBuildDir: webBuildDir,
  });
  await createStaticAssetArchive({
    archivePath: embeddedDocsAssetsArchivePath,
    files: docsBuildFiles,
    staticBuildDir: docsBuildDir,
  });
  await createBinaryEntryModule({
    entryPath: binaryEntryPath,
    root: input.root,
    version,
    embeddedWebAssetsArchivePath,
    embeddedDocsAssetsArchivePath,
    pgliteFsBundlePath,
    pgliteWasmPath,
    initdbWasmPath,
  });

  await run(
    [
      "bun",
      "build",
      binaryEntryPath,
      "--compile",
      `--target=${target.bunTarget}`,
      "--outfile",
      binaryPath,
    ],
    input.root,
  );
  if (target.os === "darwin") {
    await adHocSignDarwinExecutable(binaryPath);
  }

  await copyFileIfExists(join(input.root, ".env.example"), join(input.outDir, ".env.example"));

  await Bun.write(join(input.outDir, "run-appaloft.sh"), bundleLauncher());
  await chmodExecutable(join(input.outDir, "run-appaloft.sh"));

  await Bun.write(join(input.outDir, "README.txt"), bundleReadme({ version, target }));

  await removePath(tempBuildRoot);
}

async function createDeployCliEntryModule(input: {
  entryPath: string;
  root: string;
  version: string;
  pgliteFsBundlePath: string;
  pgliteWasmPath: string;
  initdbWasmPath: string;
  reflectMetadataPath?: string;
}): Promise<void> {
  const runModulePath = join(input.root, "apps", "shell", "src", "run.ts");
  const runModuleSpecifier = toImportSpecifier(input.entryPath, runModulePath);
  const reflectMetadataPath =
    input.reflectMetadataPath ??
    Bun.resolveSync("reflect-metadata", join(input.root, "apps", "shell", "src", "index.ts"));
  const reflectMetadataSpecifier = toImportSpecifier(input.entryPath, reflectMetadataPath);
  const pgliteFsBundleSpecifier = toImportSpecifier(input.entryPath, input.pgliteFsBundlePath);
  const pgliteWasmSpecifier = toImportSpecifier(input.entryPath, input.pgliteWasmPath);
  const initdbWasmSpecifier = toImportSpecifier(input.entryPath, input.initdbWasmPath);

  await Bun.write(
    input.entryPath,
    `import "${reflectMetadataSpecifier}";

import pgliteFsBundlePath from "${pgliteFsBundleSpecifier}" with { type: "file" };
import pgliteWasmPath from "${pgliteWasmSpecifier}" with { type: "file" };
import initdbWasmPath from "${initdbWasmSpecifier}" with { type: "file" };

if (!process.env.APPALOFT_APP_VERSION) {
\tprocess.env.APPALOFT_APP_VERSION = ${JSON.stringify(input.version)};
}
if (!process.env.APPALOFT_DATABASE_DRIVER) {
\tprocess.env.APPALOFT_DATABASE_DRIVER = "pglite";
}
if (!process.env.APPALOFT_DATA_DIR) {
\tconst dataHome = process.env.XDG_DATA_HOME || (process.env.HOME ? \`\${process.env.HOME}/.local/share\` : "");
\tprocess.env.APPALOFT_DATA_DIR = dataHome
\t\t? \`\${dataHome}/appaloft/data\`
\t\t: \`\${process.cwd()}/.appaloft/data\`;
}
if (!process.env.APPALOFT_PGLITE_DATA_DIR) {
\tprocess.env.APPALOFT_PGLITE_DATA_DIR = \`\${process.env.APPALOFT_DATA_DIR}/pglite\`;
}

async function loadEmbeddedPgliteRuntimeAssets() {
\tconst [pgliteWasmModule, initdbWasmModule] = await Promise.all([
\t\tBun.file(pgliteWasmPath)
\t\t\t.arrayBuffer()
\t\t\t.then((buffer) => WebAssembly.compile(buffer)),
\t\tBun.file(initdbWasmPath)
\t\t\t.arrayBuffer()
\t\t\t.then((buffer) => WebAssembly.compile(buffer)),
\t]);

\treturn {
\t\tfsBundle: Bun.file(pgliteFsBundlePath),
\t\tpgliteWasmModule,
\t\tinitdbWasmModule,
\t};
}

function shouldUseEmbeddedPglite(): boolean {
\tconst driver = process.env.APPALOFT_DATABASE_DRIVER?.toLowerCase();
\treturn !driver || driver === "pglite";
}

const { runShellCli } = await import("${runModuleSpecifier}");

await runShellCli({
\t...(shouldUseEmbeddedPglite()
\t\t? {
\t\t\t\tpgliteRuntimeAssets: await loadEmbeddedPgliteRuntimeAssets(),
\t\t\t}
\t\t: {}),
});
`,
  );
}

export async function createDeployCliBinaryBundle(input: {
  root: string;
  outDir: string;
  target?: ReleaseBinaryTarget;
  version?: string;
}): Promise<void> {
  const target = input.target ?? detectHostReleaseBinaryTarget();
  const version = input.version ?? process.env.APPALOFT_APP_VERSION ?? "0.1.0";
  const binaryPath = join(input.outDir, target.executableName);
  const tempBuildRoot = join(input.root, "dist", ".tmp-deploy-cli-bundle");
  const binaryEntryPath = join(tempBuildRoot, "deploy-cli-entry.ts");
  const pglitePackageEntry = Bun.resolveSync(
    "@electric-sql/pglite",
    join(input.root, "packages", "persistence", "pg", "src", "index.ts"),
  );
  const pgliteDistDir = dirname(pglitePackageEntry);
  const pgliteFsBundlePath = join(pgliteDistDir, "pglite.data");
  const pgliteWasmPath = join(pgliteDistDir, "pglite.wasm");
  const initdbWasmPath = join(pgliteDistDir, "initdb.wasm");

  await resetDir(input.outDir);
  await resetDir(tempBuildRoot);
  process.env.APPALOFT_APP_VERSION = version;

  await createDeployCliEntryModule({
    entryPath: binaryEntryPath,
    root: input.root,
    version,
    pgliteFsBundlePath,
    pgliteWasmPath,
    initdbWasmPath,
  });

  await run(
    [
      "bun",
      "build",
      binaryEntryPath,
      "--compile",
      `--target=${target.bunTarget}`,
      "--outfile",
      binaryPath,
    ],
    input.root,
  );
  if (target.os === "darwin") {
    await adHocSignDarwinExecutable(binaryPath);
  }

  await removePath(tempBuildRoot);
}
