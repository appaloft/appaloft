import { dirname, join, relative, sep } from "node:path";
import { $ } from "bun";

import { copyFileIfExists, resetDir, run } from "./release-utils";

function toImportSpecifier(fromFile: string, toFile: string): string {
  const relativePath = relative(dirname(fromFile), toFile).split(sep).join("/");
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

async function listFiles(root: string): Promise<string[]> {
  const output = await $`find ${root} -type f`.text();
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort();
}

async function createEmbeddedWebAssetsModule(input: {
  modulePath: string;
  webBuildDir: string;
}): Promise<void> {
  const files = await listFiles(input.webBuildDir);

  const imports = files.map((file, index) => {
    const specifier = toImportSpecifier(input.modulePath, file);
    return `import asset${index} from "${specifier}" with { type: "file" };`;
  });
  const entries = files.map((file, index) => {
    const routePath = `/${relative(input.webBuildDir, file).split(sep).join("/")}`;
    return `\t"${routePath}": Bun.file(asset${index}),`;
  });

  await Bun.write(
    input.modulePath,
    `${imports.join("\n")}

export const embeddedWebAssets = {
${entries.join("\n")}
} as const satisfies Readonly<Record<string, Blob>>;
`,
  );
}

async function createBinaryEntryModule(input: {
  entryPath: string;
  root: string;
  embeddedWebAssetsModulePath: string;
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
	const driver = process.env.YUNDU_DATABASE_DRIVER?.toLowerCase();
	return !driver || driver === "pglite";
}

await runShellCli({
	embeddedWebAssets,
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

export YUNDU_DATABASE_DRIVER="\${YUNDU_DATABASE_DRIVER:-pglite}"
if [ -z "\${YUNDU_DATA_DIR:-}" ]; then
	case "$(uname -s 2>/dev/null || echo unknown)" in
		Darwin)
			if [ -n "\${HOME:-}" ]; then
				YUNDU_DATA_DIR="$HOME/Library/Application Support/Yundu/data"
			else
				YUNDU_DATA_DIR="$PWD/.yundu/data"
			fi
			;;
		*)
			if [ -n "\${XDG_DATA_HOME:-}" ]; then
				YUNDU_DATA_DIR="$XDG_DATA_HOME/yundu/data"
			elif [ -n "\${HOME:-}" ]; then
				YUNDU_DATA_DIR="$HOME/.local/share/yundu/data"
			else
				YUNDU_DATA_DIR="$PWD/.yundu/data"
			fi
			;;
	esac
	export YUNDU_DATA_DIR
fi
export YUNDU_PGLITE_DATA_DIR="\${YUNDU_PGLITE_DATA_DIR:-$YUNDU_DATA_DIR/pglite}"

exec "$SCRIPT_DIR/yundu" "$@"
`;
}

function bundleReadme(): string {
  return `Yundu Binary Bundle

Contents:
- yundu: Bun-compiled backend/CLI executable
- run-yundu.sh: launcher that defaults to embedded PGlite

The binary embeds:
- PGlite runtime assets (fs bundle + wasm)
- Web console static assets

Default runtime behavior:
- YUNDU_DATABASE_DRIVER defaults to pglite
- YUNDU_DATA_DIR defaults to the platform user data directory
- YUNDU_PGLITE_DATA_DIR defaults to $YUNDU_DATA_DIR/pglite

Optional overrides:
- Set YUNDU_DATABASE_DRIVER=postgres and YUNDU_DATABASE_URL=... to use external PostgreSQL
- Set YUNDU_WEB_STATIC_DIR=/path/to/web-build to override embedded console assets

Examples:
  ./run-yundu.sh db migrate
  ./run-yundu.sh serve
  ./run-yundu.sh doctor
`;
}

async function adHocSignDarwinExecutable(binaryPath: string): Promise<void> {
  if (process.platform !== "darwin") {
    return;
  }

  // Bun --compile mutates Bun's signed executable, so replace the stale signature.
  await $`codesign --remove-signature ${binaryPath}`.quiet().nothrow();
  await run(["codesign", "--force", "--sign", "-", binaryPath], dirname(binaryPath));
}

async function directoryExists(path: string): Promise<boolean> {
  return (await $`test -d ${path}`.quiet().nothrow()).exitCode === 0;
}

export async function createBinaryBundle(input: {
  root: string;
  outDir: string;
  skipWebBuild?: boolean;
}): Promise<void> {
  const webRoot = join(input.root, "apps", "web");
  const webBuildDir = join(webRoot, "build");
  const binaryPath = join(input.outDir, "yundu");
  const tempBuildRoot = join(input.root, "dist", ".tmp-binary-bundle");
  const embeddedWebAssetsModulePath = join(tempBuildRoot, "embedded-web-assets.generated.ts");
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
    await $`rm -rf ${webBuildDir}`;
    await run(["bun", "run", "build"], webRoot);
  }

  if (!(await directoryExists(webBuildDir))) {
    throw new Error(`Missing web build output at ${webBuildDir}`);
  }

  await createEmbeddedWebAssetsModule({
    modulePath: embeddedWebAssetsModulePath,
    webBuildDir,
  });
  await createBinaryEntryModule({
    entryPath: binaryEntryPath,
    root: input.root,
    embeddedWebAssetsModulePath,
    pgliteFsBundlePath,
    pgliteWasmPath,
    initdbWasmPath,
  });

  await run(["bun", "build", binaryEntryPath, "--compile", "--outfile", binaryPath], input.root);
  await adHocSignDarwinExecutable(binaryPath);

  await copyFileIfExists(join(input.root, ".env.example"), join(input.outDir, ".env.example"));

  await Bun.write(join(input.outDir, "run-yundu.sh"), bundleLauncher());
  await $`chmod 755 ${join(input.outDir, "run-yundu.sh")}`;

  await Bun.write(join(input.outDir, "README.txt"), bundleReadme());

  await $`rm -rf ${tempBuildRoot}`;
}
