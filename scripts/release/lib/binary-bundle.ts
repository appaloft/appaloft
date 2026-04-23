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
import { detectHostReleaseBinaryTarget, type ReleaseBinaryTarget } from "./targets";

function toImportSpecifier(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function createEmbeddedStaticAssetsModule(input: {
  exportName: string;
  modulePath: string;
  staticBuildDir: string;
}): Promise<void> {
  const files = await listFiles(input.staticBuildDir);

  const imports = files.map((file, index) => {
    const specifier = toImportSpecifier(input.modulePath, file);
    return `import asset${index} from "${specifier}" with { type: "file" };`;
  });
  const entries = files.map((file, index) => {
    const routePath = `/${relative(input.staticBuildDir, file).split(sep).join("/")}`;
    return `\t"${routePath}": Bun.file(asset${index}),`;
  });

  await Bun.write(
    input.modulePath,
    `${imports.join("\n")}

export const ${input.exportName} = {
${entries.join("\n")}
} as const satisfies Readonly<Record<string, Blob>>;
`,
  );
}

async function createBinaryEntryModule(input: {
  entryPath: string;
  root: string;
  version: string;
  embeddedWebAssetsModulePath: string;
  embeddedDocsAssetsModulePath: string;
  pgliteFsBundlePath: string;
  pgliteWasmPath: string;
  initdbWasmPath: string;
}): Promise<void> {
  const runModulePath = join(input.root, "apps", "shell", "src", "run.ts");
  const runModuleSpecifier = toImportSpecifier(input.entryPath, runModulePath);
  const embeddedAssetsSpecifier = toImportSpecifier(
    input.entryPath,
    input.embeddedWebAssetsModulePath,
  );
  const embeddedDocsAssetsSpecifier = toImportSpecifier(
    input.entryPath,
    input.embeddedDocsAssetsModulePath,
  );
  const pgliteFsBundleSpecifier = toImportSpecifier(input.entryPath, input.pgliteFsBundlePath);
  const pgliteWasmSpecifier = toImportSpecifier(input.entryPath, input.pgliteWasmPath);
  const initdbWasmSpecifier = toImportSpecifier(input.entryPath, input.initdbWasmPath);

  await Bun.write(
    input.entryPath,
    `import pgliteFsBundlePath from "${pgliteFsBundleSpecifier}" with { type: "file" };
import pgliteWasmPath from "${pgliteWasmSpecifier}" with { type: "file" };
import initdbWasmPath from "${initdbWasmSpecifier}" with { type: "file" };

import { runShellCli } from "${runModuleSpecifier}";
import { embeddedWebAssets } from "${embeddedAssetsSpecifier}";
import { embeddedDocsAssets } from "${embeddedDocsAssetsSpecifier}";

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
  const embeddedWebAssetsModulePath = join(tempBuildRoot, "embedded-web-assets.generated.ts");
  const embeddedDocsAssetsModulePath = join(tempBuildRoot, "embedded-docs-assets.generated.ts");
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

  if (!input.skipWebBuild) {
    await removePath(webBuildDir);
    await run(["bun", "run", "build"], webRoot);
  }
  if (!input.skipDocsBuild) {
    await removePath(docsBuildDir);
    await run(["bun", "run", "build"], docsRoot);
  }

  if ((await listFiles(webBuildDir)).length === 0) {
    throw new Error(`Missing web build output at ${webBuildDir}`);
  }
  if ((await listFiles(docsBuildDir)).length === 0) {
    throw new Error(`Missing docs build output at ${docsBuildDir}`);
  }

  await createEmbeddedStaticAssetsModule({
    exportName: "embeddedWebAssets",
    modulePath: embeddedWebAssetsModulePath,
    staticBuildDir: webBuildDir,
  });
  await createEmbeddedStaticAssetsModule({
    exportName: "embeddedDocsAssets",
    modulePath: embeddedDocsAssetsModulePath,
    staticBuildDir: docsBuildDir,
  });
  await createBinaryEntryModule({
    entryPath: binaryEntryPath,
    root: input.root,
    version,
    embeddedWebAssetsModulePath,
    embeddedDocsAssetsModulePath,
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
