import "reflect-metadata";
import { describe, expect, test } from "bun:test";

import { createGitHubActionSourcePackageConfigReader } from "../src";

describe("GitHubRawActionSourcePackageConfigReader", () => {
  test("[CONTROL-PLANE-HANDSHAKE-015] fetches appaloft config from GitHub raw source packages", async () => {
    const requestedUrls: string[] = [];
    const reader = createGitHubActionSourcePackageConfigReader(async (input) => {
      requestedUrls.push(String(input));
      return new Response("runtime:\n  strategy: static\n", {
        status: 200,
        headers: {
          "content-length": "27",
        },
      });
    }, "https://raw.example.test");

    const result = await reader.readConfig({
      sourceFingerprint:
        "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
      configPath: "appaloft.yml",
      sourceRoot: ".",
      sourcePackage: {
        transport: "server-github-fetch",
        sourceFingerprint:
          "source-fingerprint:v1:branch%3Amain:github:github.com%2Fappaloft%2Fwww:.:appaloft.yml",
        configPath: "appaloft.yml",
        sourceRoot: ".",
        repositoryFullName: "appaloft/www",
        revision: "abc123",
      },
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      text: "runtime:\n  strategy: static\n",
      fileName: "appaloft.yml",
    });
    expect(requestedUrls).toEqual(["https://raw.example.test/appaloft/www/abc123/appaloft.yml"]);
  });

  test("[CONTROL-PLANE-HANDSHAKE-015] rejects unsupported transports before fetch", async () => {
    let called = false;
    const reader = createGitHubActionSourcePackageConfigReader(async () => {
      called = true;
      return new Response(null, { status: 500 });
    });

    const result = await reader.readConfig({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      configPath: "appaloft.yml",
      sourceRoot: ".",
      sourcePackage: {
        transport: "remote-archive-url",
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        configPath: "appaloft.yml",
        sourceRoot: ".",
        repositoryFullName: "appaloft/www",
        revision: "abc123",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "source-package-validation",
        transport: "remote-archive-url",
      },
    });
    expect(called).toBe(false);
  });

  test("[CONTROL-PLANE-HANDSHAKE-015] rejects unsafe GitHub revision path separators", async () => {
    let called = false;
    const reader = createGitHubActionSourcePackageConfigReader(async () => {
      called = true;
      return new Response(null, { status: 500 });
    });

    const result = await reader.readConfig({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      configPath: "appaloft.yml",
      sourceRoot: ".",
      sourcePackage: {
        transport: "server-github-fetch",
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        configPath: "appaloft.yml",
        sourceRoot: ".",
        repositoryFullName: "appaloft/www",
        revision: "feature/app",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "source-package-validation",
        field: "sourcePackage.revision",
      },
    });
    expect(called).toBe(false);
  });
});
