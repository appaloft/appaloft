import { beforeAll, describe, expect, test } from "bun:test";
import { context, TraceFlags, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";

import {
  createTraceUrl,
  type TraceResponseHeaderTarget,
  writeActiveTraceResponseHeaders,
} from "../src/trace-headers";

const traceId = "1234567890abcdef1234567890abcdef";
const spanId = "1234567890abcdef";

beforeAll(() => {
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
});

class HeaderTarget implements TraceResponseHeaderTarget {
  destroyed = false;
  ended = false;
  headersSent = false;
  writableEnded = false;
  readonly headers = new Map<string, string>();

  getHeader(name: string): string | undefined {
    return this.headers.get(name.toLowerCase());
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }
}

function withActiveSpanContext<T>(callback: () => T): T {
  const span = trace.wrapSpanContext({
    traceId,
    spanId,
    traceFlags: TraceFlags.SAMPLED,
  });

  return context.with(trace.setSpan(context.active(), span), callback);
}

describe("trace response headers", () => {
  test("writes traceparent when an active span exists", () => {
    const target = new HeaderTarget();

    const written = withActiveSpanContext(() => writeActiveTraceResponseHeaders(target, {}));

    expect(written).toBe(true);
    expect(target.getHeader("traceparent")).toBe(`00-${traceId}-${spanId}-01`);
  });

  test("writes Link when TRACE_LINK_BASE_URL is configured", () => {
    const target = new HeaderTarget();

    withActiveSpanContext(() =>
      writeActiveTraceResponseHeaders(target, {
        traceLinkBaseUrl: "http://localhost:16686",
      }),
    );

    expect(target.getHeader("link")).toBe(`<http://localhost:16686/trace/${traceId}>; rel="trace"`);
  });

  test("prefers TRACE_LINK_URL_TEMPLATE over TRACE_LINK_BASE_URL", () => {
    const target = new HeaderTarget();

    withActiveSpanContext(() =>
      writeActiveTraceResponseHeaders(target, {
        traceLinkBaseUrl: "http://localhost:16686",
        traceLinkUrlTemplate: "http://traces.local/detail/{traceId}",
      }),
    );

    expect(target.getHeader("link")).toBe(`<http://traces.local/detail/${traceId}>; rel="trace"`);
  });

  test("does not write Link when trace link config is absent", () => {
    const target = new HeaderTarget();

    withActiveSpanContext(() => writeActiveTraceResponseHeaders(target, {}));

    expect(target.getHeader("link")).toBeUndefined();
  });

  test("does not write headers after response headers are sent", () => {
    const target = new HeaderTarget();
    target.headersSent = true;

    const written = withActiveSpanContext(() => writeActiveTraceResponseHeaders(target, {}));

    expect(written).toBe(false);
    expect(target.getHeader("traceparent")).toBeUndefined();
    expect(target.getHeader("link")).toBeUndefined();
  });

  test("normalizes trailing slashes in TRACE_LINK_BASE_URL", () => {
    expect(
      createTraceUrl(traceId, {
        traceLinkBaseUrl: "http://localhost:16686///",
      }),
    ).toBe(`http://localhost:16686/trace/${traceId}`);
  });

  test("does not write headers without an active span", () => {
    const target = new HeaderTarget();

    const written = writeActiveTraceResponseHeaders(target, {
      traceLinkBaseUrl: "http://localhost:16686",
    });

    expect(written).toBe(false);
    expect(target.getHeader("traceparent")).toBeUndefined();
    expect(target.getHeader("link")).toBeUndefined();
  });
});
