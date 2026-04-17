import { type DomainError } from "@appaloft/core";
import {
  type AppaloftLocale,
  type AppaloftTranslate,
  createAppaloftTranslator,
  defaultAppaloftLocale,
  normalizeAppaloftLocale,
  type TranslationKey,
  type TranslationValues,
} from "@appaloft/i18n";

export type TraceAttributeValue = boolean | number | string;
export type TraceAttributes = Record<string, TraceAttributeValue | undefined>;

export type AppEntrypoint = "cli" | "http" | "rpc" | "system";

export interface ExecutionActor {
  kind: "system" | "user";
  id: string;
  label?: string;
}

export interface AppSpan {
  addEvent(name: string, attributes?: TraceAttributes): void;
  recordError(error: Error | { message: string; name?: string; stack?: string }): void;
  setAttribute(name: string, value: TraceAttributeValue): void;
  setAttributes(attributes: TraceAttributes): void;
  setStatus(status: "error" | "ok", message?: string): void;
}

export interface AppTracer {
  startActiveSpan<T>(
    name: string,
    options: {
      attributes?: TraceAttributes;
    },
    callback: (span: AppSpan) => Promise<T> | T,
  ): Promise<T>;
}

export interface ExecutionContext {
  actor?: ExecutionActor;
  entrypoint: AppEntrypoint;
  locale: AppaloftLocale;
  requestId: string;
  t: AppaloftTranslate;
  tracer: AppTracer;
}

export interface RepositoryContext {
  actor?: ExecutionActor;
  locale: AppaloftLocale;
  requestId: string;
  t: AppaloftTranslate;
  tracer: AppTracer;
  transaction?: unknown;
}

export interface ExecutionContextFactory {
  create(input: {
    actor?: ExecutionActor;
    entrypoint: AppEntrypoint;
    locale?: string;
    requestId?: string;
  }): ExecutionContext;
}

const defaultTranslate = createAppaloftTranslator({ locale: defaultAppaloftLocale });

export const translateKey = (key: TranslationKey, values?: TranslationValues): string =>
  defaultTranslate(key, values);

const noopSpan: AppSpan = {
  addEvent() {},
  recordError() {},
  setAttribute() {},
  setAttributes() {},
  setStatus() {},
};

const noopTracer: AppTracer = {
  startActiveSpan(_name, _options, callback) {
    return Promise.resolve(callback(noopSpan));
  },
};

function createRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function createExecutionContext(input: {
  actor?: ExecutionActor;
  entrypoint: AppEntrypoint;
  locale?: string;
  requestId?: string;
  tracer?: AppTracer;
  t?: AppaloftTranslate;
}): ExecutionContext {
  const locale = normalizeAppaloftLocale(input.locale);
  const t = input.t ?? createAppaloftTranslator({ locale });

  return {
    entrypoint: input.entrypoint,
    locale,
    requestId: input.requestId ?? createRequestId(),
    t,
    tracer: input.tracer ?? noopTracer,
    ...(input.actor ? { actor: input.actor } : {}),
  };
}

export const appaloftTraceAttributePrefix = "appaloft";

export const appaloftTraceAttributes = {
  actorId: `${appaloftTraceAttributePrefix}.actor.id`,
  actorKind: `${appaloftTraceAttributePrefix}.actor.kind`,
  commandName: `${appaloftTraceAttributePrefix}.command.name`,
  entrypoint: `${appaloftTraceAttributePrefix}.entrypoint`,
  errorCategory: `${appaloftTraceAttributePrefix}.error.category`,
  errorCode: `${appaloftTraceAttributePrefix}.error.code`,
  handlerName: `${appaloftTraceAttributePrefix}.handler.name`,
  integrationKey: `${appaloftTraceAttributePrefix}.integration.key`,
  locale: `${appaloftTraceAttributePrefix}.locale`,
  mutationSpecName: `${appaloftTraceAttributePrefix}.mutation_spec.name`,
  queryName: `${appaloftTraceAttributePrefix}.query.name`,
  readModelName: `${appaloftTraceAttributePrefix}.read_model.name`,
  repositoryName: `${appaloftTraceAttributePrefix}.repository.name`,
  deploymentId: `${appaloftTraceAttributePrefix}.deployment.id`,
  resourceId: `${appaloftTraceAttributePrefix}.resource.id`,
  requestId: `${appaloftTraceAttributePrefix}.request.id`,
  runtimeKind: `${appaloftTraceAttributePrefix}.runtime.kind`,
  runtimeLogCloseReason: `${appaloftTraceAttributePrefix}.runtime_logs.close_reason`,
  runtimeLogCommand: `${appaloftTraceAttributePrefix}.runtime_logs.command`,
  runtimeLogFollow: `${appaloftTraceAttributePrefix}.runtime_logs.follow`,
  runtimeLogLineCount: `${appaloftTraceAttributePrefix}.runtime_logs.line_count`,
  runtimeLogServiceName: `${appaloftTraceAttributePrefix}.runtime_logs.service_name`,
  runtimeLogTailLines: `${appaloftTraceAttributePrefix}.runtime_logs.tail_lines`,
  runtimeLogTimeoutMs: `${appaloftTraceAttributePrefix}.runtime_logs.timeout_ms`,
  selectionSpecName: `${appaloftTraceAttributePrefix}.selection_spec.name`,
  sourceLocator: `${appaloftTraceAttributePrefix}.source.locator`,
  targetProviderKey: `${appaloftTraceAttributePrefix}.target.provider_key`,
} as const;

export function createExecutionContextAttributes(context: ExecutionContext): TraceAttributes {
  return {
    [appaloftTraceAttributes.requestId]: context.requestId,
    [appaloftTraceAttributes.entrypoint]: context.entrypoint,
    [appaloftTraceAttributes.locale]: context.locale,
    [appaloftTraceAttributes.actorId]: context.actor?.id,
    [appaloftTraceAttributes.actorKind]: context.actor?.kind,
  };
}

export function createDomainErrorTraceAttributes(error: DomainError): TraceAttributes {
  return {
    [appaloftTraceAttributes.errorCode]: error.code,
    [appaloftTraceAttributes.errorCategory]: error.category,
  };
}

export function toRepositoryContext(
  context: ExecutionContext,
  input?: {
    transaction?: unknown;
  },
): RepositoryContext {
  return {
    locale: context.locale,
    requestId: context.requestId,
    t: context.t,
    tracer: context.tracer,
    ...(context.actor ? { actor: context.actor } : {}),
    ...(input?.transaction ? { transaction: input.transaction } : {}),
  };
}

function toSpanSegment(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function createCommandSpanName(commandName: string): string {
  return `appaloft.command.${toSpanSegment(commandName)}`;
}

export function createQuerySpanName(queryName: string): string {
  return `appaloft.query.${toSpanSegment(queryName)}`;
}

export function createRepositorySpanName(repositoryName: string, operation: string): string {
  return `appaloft.repository.${toSpanSegment(repositoryName)}.${toSpanSegment(operation)}`;
}

export function createReadModelSpanName(readModelName: string, operation: string): string {
  return `appaloft.read_model.${toSpanSegment(readModelName)}.${toSpanSegment(operation)}`;
}

export function createAdapterSpanName(adapterName: string, operation: string): string {
  return `appaloft.adapter.${toSpanSegment(adapterName)}.${toSpanSegment(operation)}`;
}

export function createRuntimeLogsSpanName(operation: string): string {
  return `appaloft.runtime_logs.${toSpanSegment(operation)}`;
}
