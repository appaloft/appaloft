import {
  context,
  isSpanContextValid,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  trace,
} from "@opentelemetry/api";

export interface TraceLinkConfig {
  traceLinkBaseUrl?: string;
  traceLinkUrlTemplate?: string;
}

export interface TraceResponseHeaderTarget {
  destroyed?: boolean;
  ended?: boolean;
  headersSent?: boolean;
  writableEnded?: boolean;
  getHeader(name: string): string | undefined;
  setHeader(name: string, value: string): void;
}

export interface HttpServerSpanUpdate {
  error?: unknown;
  request: Request;
  requestId?: string;
  route?: string;
  statusCode?: number;
}

const httpServerTracerName = "yundu.http";
const traceLinkValue = (traceUrl: string): string => `<${traceUrl}>; rel="trace"`;
const endedSpans = new WeakSet<Span>();

function headersToCarrier(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function readPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function readUrlScheme(request: Request): string | undefined {
  try {
    return new URL(request.url).protocol.replace(/:$/, "");
  } catch {
    return undefined;
  }
}

function createHttpSpanName(request: Request, route?: string): string {
  return `${request.method} ${route ?? readPathname(request)}`;
}

function recordSpanError(span: Span, error: unknown): void {
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: String(error),
  });
}

function endSpanOnce(span: Span): void {
  if (endedSpans.has(span)) {
    return;
  }

  endedSpans.add(span);
  span.end();
}

function setHttpSpanAttributes(span: Span, input: HttpServerSpanUpdate): void {
  const route = input.route;
  const pathname = readPathname(input.request);
  const scheme = readUrlScheme(input.request);

  if (route) {
    span.updateName(createHttpSpanName(input.request, route));
  }

  span.setAttributes({
    "http.request.method": input.request.method,
    "url.path": pathname,
    ...(scheme ? { "url.scheme": scheme } : {}),
    ...(route ? { "http.route": route } : {}),
    ...(input.requestId ? { "yundu.request.id": input.requestId } : {}),
    ...(input.statusCode ? { "http.response.status_code": input.statusCode } : {}),
  });

  if (typeof input.statusCode === "number" && input.statusCode >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }

  if (input.error !== undefined) {
    recordSpanError(span, input.error);
  }
}

function canWriteHeaders(target: TraceResponseHeaderTarget): boolean {
  return !target.headersSent && !target.writableEnded && !target.ended && !target.destroyed;
}

function createTraceparent(spanContext: ReturnType<Span["spanContext"]>): string {
  const flags = (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED ? "01" : "00";

  return `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`;
}

export function createTraceUrl(traceId: string, config: TraceLinkConfig): string | undefined {
  if (config.traceLinkUrlTemplate) {
    return config.traceLinkUrlTemplate.replaceAll("{traceId}", traceId);
  }

  if (!config.traceLinkBaseUrl) {
    return undefined;
  }

  return `${config.traceLinkBaseUrl.replace(/\/+$/, "")}/trace/${traceId}`;
}

export function readActiveTraceLogContext():
  | {
      spanId: string;
      traceId: string;
    }
  | undefined {
  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();

  if (!spanContext || !isSpanContextValid(spanContext)) {
    return undefined;
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export function writeActiveTraceResponseHeaders(
  target: TraceResponseHeaderTarget,
  config: TraceLinkConfig,
): boolean {
  if (!canWriteHeaders(target)) {
    return false;
  }

  const activeSpan = trace.getActiveSpan();
  const spanContext = activeSpan?.spanContext();

  if (!spanContext || !isSpanContextValid(spanContext)) {
    return false;
  }

  try {
    target.setHeader("traceparent", createTraceparent(spanContext));

    const traceUrl = createTraceUrl(spanContext.traceId, config);

    if (traceUrl) {
      const existingLink = target.getHeader("link") ?? target.getHeader("Link");
      const nextLink = traceLinkValue(traceUrl);
      target.setHeader("Link", existingLink ? `${existingLink}, ${nextLink}` : nextLink);
    }

    return true;
  } catch {
    return false;
  }
}

export function wrapHttpRequestHandlerWithSpan(
  input: {
    request: Request;
    requestId?: string;
  },
  handler: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  const tracer = trace.getTracer(httpServerTracerName);
  const parentContext = propagation.extract(
    context.active(),
    headersToCarrier(input.request.headers),
  );
  const span = tracer.startSpan(
    createHttpSpanName(input.request),
    {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": input.request.method,
        "url.path": readPathname(input.request),
        ...(readUrlScheme(input.request) ? { "url.scheme": readUrlScheme(input.request) } : {}),
        ...(input.requestId ? { "yundu.request.id": input.requestId } : {}),
      },
    },
    parentContext,
  );
  const activeContext = trace.setSpan(parentContext, span);

  return (...args: unknown[]) =>
    context.with(activeContext, () => {
      try {
        const result = handler(...args);

        if (isPromiseLike(result)) {
          return Promise.resolve(result)
            .catch((error: unknown) => {
              recordSpanError(span, error);
              throw error;
            })
            .finally(() => {
              endSpanOnce(span);
            });
        }

        endSpanOnce(span);
        return result;
      } catch (error) {
        recordSpanError(span, error);
        endSpanOnce(span);
        throw error;
      }
    });
}

export function updateActiveHttpServerSpan(input: HttpServerSpanUpdate): void {
  const activeSpan = trace.getActiveSpan();

  if (!activeSpan || !isSpanContextValid(activeSpan.spanContext())) {
    return;
  }

  setHttpSpanAttributes(activeSpan, input);
}

export function finishActiveHttpServerSpan(input: HttpServerSpanUpdate): void {
  const activeSpan = trace.getActiveSpan();

  if (!activeSpan || !isSpanContextValid(activeSpan.spanContext())) {
    return;
  }

  setHttpSpanAttributes(activeSpan, input);
  endSpanOnce(activeSpan);
}
