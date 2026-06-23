import { describe, expect, test } from "vitest";

import { shouldRetryQueryError } from "./query-client";

describe("query client retry policy", () => {
  test("[QUERY-RETRY-001] retries query errors only once for HTTP 5xx responses", () => {
    expect(shouldRetryQueryError(0, { status: 500 })).toBe(true);
    expect(shouldRetryQueryError(0, { response: { status: 503 } })).toBe(true);
    expect(shouldRetryQueryError(1, { status: 503 })).toBe(false);
  });

  test("[QUERY-RETRY-002] does not retry expected client errors or unknown status failures", () => {
    expect(shouldRetryQueryError(0, { status: 404 })).toBe(false);
    expect(shouldRetryQueryError(0, { data: { status: 409 } })).toBe(false);
    expect(shouldRetryQueryError(0, new Error("network unavailable"))).toBe(false);
  });
});
