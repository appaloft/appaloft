import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ApiRequestError,
  apiDomainErrorEventType,
  readErrorMessage,
  request,
  requestWithMetadata,
} from "./client";

describe("api client helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("requests JSON data from the backend API", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "appaloft",
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await request<{ status: string; service: string }>("/api/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl).toBe("http://localhost:3001/api/health");
    expect(data).toEqual({
      status: "ok",
      service: "appaloft",
    });
  });

  test("returns trace metadata from API response headers", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "dep_demo" }), {
        headers: {
          link: '<https://assets.example/preload>; rel="preload", <http://jaeger/trace/abc>; rel="trace"',
          traceparent: "00-abc00000000000000000000000000000-def0000000000000-01",
        },
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const metadataSpy = vi.fn();
    const result = await requestWithMetadata<{ id: string }>("/api/deployments", undefined, {
      onMetadata: metadataSpy,
    });

    expect(result.data).toEqual({ id: "dep_demo" });
    expect(result.metadata.trace).toEqual({
      traceLink: "http://jaeger/trace/abc",
      traceparent: "00-abc00000000000000000000000000000-def0000000000000-01",
    });
    expect(metadataSpy).toHaveBeenCalledWith(result.metadata);
  });

  test("extracts readable request errors", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('password authentication failed for user "postgres"', {
        status: 500,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/projects")).rejects.toThrow(
      'API 请求失败 /api/projects：500 password authentication failed for user "postgres"',
    );
    expect(readErrorMessage(new Error("boom"))).toBe("boom");
    expect(readErrorMessage("opaque")).toBe("未知请求失败");
  });

  test("dispatches structured domain errors for console extension hosts", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "cloud-plan-limit-exceeded",
            category: "user",
            message: "Plan limit exceeded",
            retryable: false,
            details: {
              planId: "free",
              limitKind: "servers",
              limit: 1,
            },
          },
        }),
        { status: 400 },
      );
    });
    const dispatchEvent = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      dispatchEvent,
      navigator: {
        language: "en-US",
      },
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
    vi.stubGlobal(
      "CustomEvent",
      class TestCustomEvent {
        readonly type: string;
        readonly detail: unknown;

        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    );

    await expect(request("/api/servers")).rejects.toMatchObject({
      domainError: {
        code: "cloud-plan-limit-exceeded",
        message: "Plan limit exceeded",
      },
    });
    await expect(request("/api/servers")).rejects.toBeInstanceOf(ApiRequestError);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: apiDomainErrorEventType,
        detail: expect.objectContaining({
          path: "/api/servers",
          status: 400,
          error: expect.objectContaining({
            code: "cloud-plan-limit-exceeded",
          }),
        }),
      }),
    );
  });
});
