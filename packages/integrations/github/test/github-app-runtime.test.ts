import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { createExecutionContext } from "@appaloft/application";

import { createGitHubAppRuntime } from "../src";

function testPrivateKey(): string {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      format: "pem",
      type: "pkcs8",
    },
    publicKeyEncoding: {
      format: "pem",
      type: "spki",
    },
  }).privateKey;
}

describe("GitHubApiAppRuntime", () => {
  test("creates a GitHub App JWT and exchanges an installation token", async () => {
    const authorizationHeaders: string[] = [];
    const runtime = createGitHubAppRuntime(
      {
        appId: "12345",
        privateKey: testPrivateKey(),
      },
      async (_url, init) => {
        authorizationHeaders.push(
          String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
        );
        return Response.json({
          expires_at: "2026-05-26T12:00:00.000Z",
          token: "installation-token",
        });
      },
    );

    const result = await runtime.createInstallationAccessToken(
      createExecutionContext({ entrypoint: "system" }),
      { installationId: "987" },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      expiresAt: "2026-05-26T12:00:00.000Z",
      token: "installation-token",
    });
    expect(authorizationHeaders[0]).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
  });

  test("supports base64 encoded private keys without exposing the key in errors", async () => {
    const runtime = createGitHubAppRuntime(
      {
        appId: "12345",
        privateKeyBase64: Buffer.from(testPrivateKey(), "utf8").toString("base64"),
      },
      async () => new Response("{}", { status: 403 }),
    );

    const result = await runtime.readInstallation(
      createExecutionContext({ entrypoint: "system" }),
      {
        installationId: "987",
      },
    );

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message).not.toContain("PRIVATE KEY");
  });
});
