import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(path).text()) as Record<string, unknown>;
}

describe("TypeScript SDK release packaging", () => {
  test("[TS-SDK-RELEASE-001] SDK npm package metadata is publishable", async () => {
    const packageJson = await readJson(join(root, "packages", "sdk", "package.json"));

    expect(packageJson).toMatchObject({
      name: "@appaloft/sdk",
      description: "TypeScript operation client for the Appaloft HTTP API.",
      license: "Apache-2.0",
      type: "module",
      sideEffects: false,
      types: "./dist/index.d.ts",
      publishConfig: {
        access: "public",
      },
    });
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.files).toEqual(["dist"]);
    expect(packageJson.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    });

    for (const section of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      const dependencies = packageJson[section];
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
        continue;
      }

      for (const [name, range] of Object.entries(dependencies)) {
        expect(
          typeof range === "string" && range.startsWith("workspace:"),
          `${section}.${name} must not use a workspace range in a public package`,
        ).toBe(false);
      }
    }
  });

  test("[TS-SDK-RELEASE-001] release npm job prepares and publishes the SDK package", async () => {
    const releaseBuild = await Bun.file(
      join(root, ".github", "workflows", "release-build.yml"),
    ).text();
    const prepareScript = await Bun.file(
      join(root, "scripts", "release", "prepare-npm-packages.ts"),
    ).text();

    expect(releaseBuild).toContain("publish_package packages/sdk");
    expect(prepareScript).toContain('const sdkPackageDir = join(root, "packages", "sdk");');
    expect(prepareScript).toContain(
      'await run(["bun", "run", "--cwd", sdkPackageDir, "build"], root);',
    );
    expect(prepareScript).toContain('"dist/index.js"');
    expect(prepareScript).toContain('"dist/index.d.ts"');
    expect(prepareScript).toContain('"dist/internal.js"');
    expect(prepareScript).toContain('"dist/resource-client.js"');
    expect(prepareScript).toContain('"dist/generated-operations.js"');
  });

  test("[TS-SDK-RELEASE-001] public declarations expose only the typed facade", async () => {
    const declaration = await Bun.file(join(root, "packages", "sdk", "dist", "index.d.ts")).text();

    expect(declaration).toContain("createAppaloftClient");
    expect(declaration).toContain("AppaloftClient");
    expect(declaration).not.toContain("createAppaloftSdkClient");
    expect(declaration).not.toContain("generatedSdkOperations");
    expect(declaration).not.toContain("SdkOperationDescriptor");
    expect(declaration).not.toContain("request:");
    expect(declaration).not.toContain("stream:");
  });

  test("[TS-SDK-RELEASE-002] built package root imports in Bun and Node", () => {
    const sdkDir = join(root, "packages", "sdk");
    const importScript =
      'import("./dist/index.js").then((sdk) => { if (typeof sdk.createAppaloftClient !== "function") process.exit(2); })';

    for (const command of [
      ["bun", "-e", importScript],
      ["node", "--input-type=module", "-e", importScript],
    ]) {
      const result = Bun.spawnSync(command, { cwd: sdkDir, stderr: "pipe", stdout: "pipe" });
      expect(result.exitCode, `${command[0]} import failed: ${result.stderr.toString()}`).toBe(0);
    }
  });
});
