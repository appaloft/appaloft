import {
  type AppLogger,
  type AppTracer,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionContextFactory as ExecutionContextFactoryContract,
  type IdGenerator,
} from "@yundu/application";
import { type AppConfig } from "@yundu/config";
import { createYunduTranslator, normalizeYunduLocale } from "@yundu/i18n";
import { readActiveTraceLogContext } from "./trace-headers";

export { bootstrapOpenTelemetry } from "./bootstrap";
export {
  finishActiveHttpServerSpan,
  readActiveTraceLogContext,
  updateActiveHttpServerSpan,
  wrapHttpRequestHandlerWithSpan,
  writeActiveTraceResponseHeaders,
} from "./trace-headers";

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

class DefaultExecutionContextFactory implements ExecutionContextFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly tracer: AppTracer,
  ) {}

  create(input: Parameters<ExecutionContextFactoryContract["create"]>[0]): ExecutionContext {
    const locale = normalizeYunduLocale(input.locale);

    return {
      requestId: input.requestId ?? this.idGenerator.next("req"),
      entrypoint: input.entrypoint,
      locale,
      t: createYunduTranslator({ locale }),
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

    const traceContext = readActiveTraceLogContext();

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...(traceContext ? { trace: traceContext } : {}),
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
