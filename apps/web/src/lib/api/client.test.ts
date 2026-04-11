import { afterEach, describe, expect, test, vi } from "vitest";

import { readErrorMessage, request } from "./client";

describe("api client helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("requests JSON data from the backend API", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = input instanceof Request ? input.url : String(input);
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "yundu",
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const data = await request<{ status: string; service: string }>("/api/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedUrl).toBe("http://localhost:3001/api/health");
    expect(data).toEqual({
      status: "ok",
      service: "yundu",
    });
  });

  test("extracts readable request errors", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response('password authentication failed for user "postgres"', {
        status: 500,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/projects")).rejects.toThrow(
      'API request failed for /api/projects: 500 password authentication failed for user "postgres"',
    );
    expect(readErrorMessage(new Error("boom"))).toBe("boom");
    expect(readErrorMessage("opaque")).toBe("Unknown request failure");
  });
});
