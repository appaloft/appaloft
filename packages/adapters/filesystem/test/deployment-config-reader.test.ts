import { describe, expect, test } from "bun:test";
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

async function createGitWorkspace(): Promise<{
  root: string;
  source: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "appaloft-config-"));
  const source = join(root, "apps", "api");

  await Bun.$`mkdir -p ${source}`.quiet();
  await Bun.$`git init`.cwd(root).quiet();

  return { root, source };
}

describe("FileSystemDeploymentConfigReader", () => {
  test("[CONFIG-FILE-DISC-002] discovers appaloft.yml from the git root for nested sources", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    await Bun.write(
      join(root, "appaloft.yml"),
      [
        "runtime:",
        "  strategy: workspace-commands",
        "  buildCommand: bun run build",
        "  startCommand: bun run start",
        "network:",
        "  internalPort: 4310",
      ].join("\n"),
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_config" }),
      {
        sourceLocator: source,
      },
    );

    expect(result.isOk()).toBe(true);
    const snapshot = result._unsafeUnwrap();
    expect(snapshot?.configFilePath).toBe(await realpath(join(root, "appaloft.yml")));
    expect(snapshot?.deployment).toEqual({
      method: "workspace-commands",
      buildCommand: "bun run build",
      startCommand: "bun run start",
      port: 4310,
    });
    expect(snapshot?.project).toBeUndefined();
    expect(snapshot?.targets).toBeUndefined();
  });

  test("[CONFIG-FILE-ID-002] refuses config files that contain project or target identity", async () => {
    ensureReflectMetadata();
    const [{ createExecutionContext }, { FileSystemDeploymentConfigReader }] = await Promise.all([
      import("@appaloft/application"),
      import("../src"),
    ]);
    const { root, source } = await createGitWorkspace();
    const configFilePath = join(root, "appaloft.json");
    await Bun.write(
      configFilePath,
      `${JSON.stringify({
        project: {
          name: "production",
        },
        runtime: {
          strategy: "auto",
        },
      })}\n`,
    );

    const result = await new FileSystemDeploymentConfigReader().read(
      createExecutionContext({ entrypoint: "cli", requestId: "req_config" }),
      {
        sourceLocator: source,
        configFilePath,
      },
    );

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details?.phase).toBe("config-identity");
  });
});
