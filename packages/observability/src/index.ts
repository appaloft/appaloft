import {
  type AppTracer,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionContextFactory as ExecutionContextFactoryContract,
  type IdGenerator,
} from "@appaloft/application";
import { createAppaloftTranslator, normalizeAppaloftLocale } from "@appaloft/i18n";

export { bootstrapOpenTelemetry } from "./bootstrap";
export {
  createLogger,
  createPinoLogger,
  createPinoLoggerOptions,
  PinoAppLogger,
} from "./logger";
export {
  finishActiveHttpServerSpan,
  readActiveTraceLogContext,
  updateActiveHttpServerSpan,
  wrapHttpRequestHandlerWithSpan,
  writeActiveTraceResponseHeaders,
} from "./trace-headers";

class DefaultExecutionContextFactory implements ExecutionContextFactory {
  constructor(
    private readonly idGenerator: IdGenerator,
    private readonly tracer: AppTracer,
  ) {}

  create(input: Parameters<ExecutionContextFactoryContract["create"]>[0]): ExecutionContext {
    const locale = normalizeAppaloftLocale(input.locale);

    return {
      requestId: input.requestId ?? this.idGenerator.next("req"),
      entrypoint: input.entrypoint,
      locale,
      t: createAppaloftTranslator({ locale }),
      tracer: this.tracer,
      ...(input.actor ? { actor: input.actor } : {}),
    };
  }
}

export function createExecutionContextFactory(input: {
  idGenerator: IdGenerator;
  tracer: AppTracer;
}): ExecutionContextFactory {
  return new DefaultExecutionContextFactory(input.idGenerator, input.tracer);
}
