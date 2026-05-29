import "reflect-metadata";

import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShellManagedDependencyProvider } from "../src/register-application-services";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function createTempRoot(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "appaloft-managed-dependency-provider-"));
  tempRoots.push(path);
  return path;
}

describe("ShellManagedDependencyProvider", () => {
  test("[CLOUD-DEP-PROV-CAPABILITY-052] rejects required capabilities before shell provider realization", () => {
    const provider = new ShellManagedDependencyProvider();

    expect(
      provider.supports("appaloft-managed-postgres", "postgres", [
        { type: "postgres-extension", name: "vector", required: true },
      ]),
    ).toBe(false);
    expect(
      provider.supports("appaloft-managed-redis", "redis", [
        { type: "redis-module", name: "search", required: true },
      ]),
    ).toBe(false);
  });

  test("[CLOUD-DEP-PROV-CAPABILITY-052] allows optional unsupported capabilities for readback evidence", () => {
    const provider = new ShellManagedDependencyProvider();

    expect(
      provider.supports("appaloft-managed-redis", "redis", [
        { type: "redis-module", name: "search", required: false },
      ]),
    ).toBe(true);
  });

  test("[DEP-BIND-SECRET-RESOLVE-005] realizes targeted Postgres as Docker-backed runtime secret", async () => {
    const root = await createTempRoot();
    const binDir = join(root, "bin");
    const sshLog = join(root, "ssh.log");
    await mkdir(binDir, { recursive: true });
    await writeFile(
      join(binDir, "ssh"),
      ["#!/bin/sh", `printf '%s\\n' "$*" >> ${JSON.stringify(sshLog)}`, "exit 0", ""].join("\n"),
    );
    await chmod(join(binDir, "ssh"), 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin:${previousPath ?? ""}`;
    try {
      const provider = new ShellManagedDependencyProvider(join(root, "data"));
      const realized = await provider.realize(
        { requestId: "req_dependency_provider_test", entrypoint: "test" },
        {
          dependencyResourceId: "rsi_preview",
          projectId: "prj_preview",
          environmentId: "env_preview",
          kind: "postgres",
          providerKey: "appaloft-managed-postgres",
          name: "preview db",
          slug: "preview-db",
          attemptId: "dpr_preview",
          requestedAt: "2026-05-25T00:00:00.000Z",
          target: {
            serverId: "srv_preview",
            providerKey: "generic-ssh",
            targetKind: "single-server",
            host: "127.0.0.1",
            port: 22,
          },
        },
      );

      if (realized.isErr()) {
        throw new Error(JSON.stringify(realized._unsafeUnwrapErr()));
      }
      expect(realized.isOk()).toBe(true);
      const state = realized._unsafeUnwrap();
      expect(state.providerResourceHandle).toMatch(
        /^docker-single-server:v1:postgres:srv_preview:appaloft-postgres-rsi_preview$/,
      );
      expect(state.secretRef).toBeUndefined();
      expect(state.connectionSecretValue).toMatch(
        /^postgres:\/\/app:[a-f0-9]{48}@appaloft-postgres-rsi_preview:5432\/preview_db$/,
      );
      expect(state.endpoint).toMatchObject({
        host: "appaloft-postgres-rsi_preview",
        port: 5432,
        databaseName: "preview_db",
        maskedConnection: "postgres://app:********@appaloft-postgres-rsi_preview:5432/preview_db",
      });

      const log = await readFile(sshLog, "utf8");
      expect(log).toContain("network inspect 'appaloft-edge'");
      expect(log).toContain("run -d --name 'appaloft-postgres-rsi_preview'");
      expect(log).toContain("postgres:16-alpine");
    } finally {
      process.env.PATH = previousPath;
    }
  });
});
