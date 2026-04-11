import { type Attributes, type Span, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

import {
  type AppLogger,
  type AppSpan,
  type AppTracer,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionContextFactory as ExecutionContextFactoryContract,
  type IdGenerator,
  type TraceAttributes,
  type TraceAttributeValue,
} from "@yundu/application";
import { type AppConfig } from "@yundu/config";

function sanitizeContext(value: unknown, secretMask: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeContext(item, secretMask));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, currentValue]) => {
      if (/secret|token|password|authorization|key/i.test(key)) {
        return [key, secretMask];
      }

      return [key, sanitizeContext(currentValue, secretMask)];
    });

    return Object.fromEntries(entries);
  }

  return value;
}

function toOtelAttributes(attributes?: TraceAttributes): Attributes | undefined {
  if (!attributes) {
    return undefined;
  }

  const pairs = Object.entries(attributes).filter(
    (entry): entry is [string, TraceAttributeValue] => entry[1] !== undefined,
  );

  return pairs.length > 0 ? Object.fromEntries(pairs) : undefined;
}

class NoopSpan implements AppSpan {
  addEvent(): void {}

  recordError(): void {}

  setAttribute(): void {}

  setAttributes(): void {}

  setStatus(): void {}
}

class NoopTracer implements AppTracer {
  async startActiveSpan<T>(
    _name: string,
    _options: {
      attributes?: TraceAttributes;
    },
    callback: (span: AppSpan) => Promise<T> | T,
  ): Promise<T> {
    return callback(new NoopSpan());
  }
}

class OpenTelemetrySpan implements AppSpan {
  constructor(private readonly span: Span) {}

  addEvent(name: string, attributes?: TraceAttributes): void {
    this.span.addEvent(name, toOtelAttributes(attributes));
  }

  recordError(error: Error | { message: string; name?: string; stack?: string }): void {
    this.span.recordException(error);
  }

  setAttribute(name: string, value: TraceAttributeValue): void {
    this.span.setAttribute(name, value);
  }

  setAttributes(attributes: TraceAttributes): void {
    const otelAttributes = toOtelAttributes(attributes);

    if (otelAttributes) {
      this.span.setAttributes(otelAttributes);
    }
  }

  setStatus(status: "error" | "ok", message?: string): void {
    this.span.setStatus({
      code: status === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      ...(message ? { message } : {}),
    });
  }
}

class OpenTelemetryAppTracer implements AppTracer {
  constructor(private readonly tracer: Tracer) {}

  async startActiveSpan<T>(
    name: string,
    options: {
      attributes?: TraceAttributes;
    },
    callback: (span: AppSpan) => Promise<T> | T,
  ): Promise<T> {
    const attributes = toOtelAttributes(options.attributes);
    const spanOptions = attributes ? { attributes } : {};

    return await new Promise<T>((resolve, reject) => {
      this.tracer.startActiveSpan(name, spanOptions, (span) => {
        Promise.resolve(callback(new OpenTelemetrySpan(span)))
          .then(resolve, reject)
          .finally(() => {
            span.end();
          });
      });
    });
  }
}

class DefaultExecutionContextFactory implements ExecutionContextFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly tracer: AppTracer,
  ) {}

  create(input: Parameters<ExecutionContextFactoryContract["create"]>[0]): ExecutionContext {
    return {
      requestId: input.requestId ?? this.idGenerator.next("req"),
      entrypoint: input.entrypoint,
      tracer: this.tracer,
      ...(input.actor ? { actor: input.actor } : {}),
    };
  }
}

export class JsonLogger implements AppLogger {
  constructor(
    private readonly level: AppConfig["logLevel"],
    private readonly secretMask: string,
  ) {}

  private shouldLog(targetLevel: AppConfig["logLevel"]): boolean {
    const order: Record<AppConfig["logLevel"], number> = {
      debug: 10,
      info: 20,
      warn: 30,
      error: 40,
    };

    return order[targetLevel] >= order[this.level];
  }

  private write(
    level: AppConfig["logLevel"],
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) {
      return;
    }

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        context: context ? sanitizeContext(context, this.secretMask) : undefined,
      }),
    );
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }
}

export function createLogger(config: AppConfig): AppLogger {
  return new JsonLogger(config.logLevel, config.secretMask);
}

export function createExecutionContextFactory(input: {
  idGenerator: IdGenerator;
  tracer: AppTracer;
}): ExecutionContextFactory {
  return new DefaultExecutionContextFactory(input.idGenerator, input.tracer);
}

export async function bootstrapOpenTelemetry(config: AppConfig): Promise<{
  shutdown(): Promise<void>;
  tracer: AppTracer;
}> {
  if (!config.otelEnabled) {
    return {
      tracer: new NoopTracer(),
      async shutdown(): Promise<void> {
        return;
      },
    };
  }

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: config.otelExporterEndpoint,
    }),
    serviceName: config.otelServiceName,
  });

  await sdk.start();

  return {
    tracer: new OpenTelemetryAppTracer(trace.getTracer("yundu.application", config.appVersion)),
    async shutdown(): Promise<void> {
      await sdk.shutdown();
    },
  };
}
