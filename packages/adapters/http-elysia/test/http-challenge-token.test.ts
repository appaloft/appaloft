import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type CertificateHttpChallengeToken,
  type CertificateHttpChallengeTokenStore,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type QueryBus,
} from "@yundu/application";
import { resolveConfig } from "@yundu/config";
import { ok, type Result } from "@yundu/core";

import { createHttpApp } from "../src";

class TestChallengeTokenStore implements CertificateHttpChallengeTokenStore {
  private readonly tokens = new Map<string, CertificateHttpChallengeToken>();

  publish(
    _context: ExecutionContext,
    token: CertificateHttpChallengeToken,
  ): Promise<Result<CertificateHttpChallengeToken>> {
    this.tokens.set(`${token.domainName}:${token.token}`, token);
    return Promise.resolve(ok(token));
  }

  find(
    _context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<CertificateHttpChallengeToken | null>> {
    return Promise.resolve(ok(this.tokens.get(`${input.domainName}:${input.token}`) ?? null));
  }

  remove(
    _context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<void>> {
    this.tokens.delete(`${input.domainName}:${input.token}`);
    return Promise.resolve(ok(undefined));
  }
}

function createTestApp(challengeTokenStore: CertificateHttpChallengeTokenStore) {
  return createHttpApp({
    config: resolveConfig({
      flags: {
        appVersion: "0.1.0-test",
        authProvider: "none",
        webStaticDir: "",
      },
    }),
    commandBus: {} as unknown as CommandBus,
    queryBus: {} as unknown as QueryBus,
    logger: {
      debug() {},
      error() {},
      info() {},
      warn() {},
    },
    executionContextFactory: {
      create(input) {
        return createExecutionContext(input);
      },
    },
    certificateHttpChallengeTokenStore: challengeTokenStore,
  });
}

async function withServer<T>(
  app: ReturnType<typeof createHttpApp>,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  app.listen({
    hostname: "127.0.0.1",
    port: 0,
  });

  const port = app.server?.port;
  if (typeof port !== "number") {
    throw new Error("HTTP test server did not expose a port");
  }

  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    app.server?.stop(true);
  }
}

describe("HTTP-01 challenge token serving", () => {
  test("[ROUTE-TLS-CHALLENGE-001] serves a published key authorization as plain text", async () => {
    const store = new TestChallengeTokenStore();
    await store.publish(createExecutionContext({ entrypoint: "test" }), {
      domainName: "app.example.com",
      token: "token-123",
      keyAuthorization: "token-123.thumbprint",
      publishedAt: new Date(0).toISOString(),
    });

    await withServer(createTestApp(store), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/.well-known/acme-challenge/token-123`, {
        headers: {
          host: "app.example.com",
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")?.startsWith("text/plain")).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toBe("token-123.thumbprint");
    });
  });

  test("[ROUTE-TLS-CHALLENGE-002] returns 404 for an unknown token", async () => {
    const store = new TestChallengeTokenStore();

    await withServer(createTestApp(store), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/.well-known/acme-challenge/missing-token`, {
        headers: {
          host: "app.example.com",
        },
      });

      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain("<!doctype html>");
    });
  });

  test("[ROUTE-TLS-CHALLENGE-003] returns 404 for a host-mismatched token", async () => {
    const store = new TestChallengeTokenStore();
    await store.publish(createExecutionContext({ entrypoint: "test" }), {
      domainName: "other.example.com",
      token: "token-456",
      keyAuthorization: "token-456.thumbprint",
      publishedAt: new Date(0).toISOString(),
    });

    await withServer(createTestApp(store), async (baseUrl) => {
      const response = await fetch(`${baseUrl}/.well-known/acme-challenge/token-456`, {
        headers: {
          host: "app.example.com",
        },
      });

      expect(response.status).toBe(404);
    });
  });
});
