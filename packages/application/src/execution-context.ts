import { type DomainError } from "@yundu/core";

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
  requestId: string;
  tracer: AppTracer;
}

export interface RepositoryContext {
  actor?: ExecutionActor;
  requestId: string;
  tracer: AppTracer;
  transaction?: unknown;
}

export interface ExecutionContextFactory {
  create(input: {
    actor?: ExecutionActor;
    entrypoint: AppEntrypoint;
    requestId?: string;
  }): ExecutionContext;
}

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
  requestId?: string;
  tracer?: AppTracer;
}): ExecutionContext {
  return {
    entrypoint: input.entrypoint,
    requestId: input.requestId ?? createRequestId(),
    tracer: input.tracer ?? noopTracer,
    ...(input.actor ? { actor: input.actor } : {}),
  };
}

export const yunduTraceAttributePrefix = "yundu";

export const yunduTraceAttributes = {
  actorId: `${yunduTraceAttributePrefix}.actor.id`,
  actorKind: `${yunduTraceAttributePrefix}.actor.kind`,
  commandName: `${yunduTraceAttributePrefix}.command.name`,
  entrypoint: `${yunduTraceAttributePrefix}.entrypoint`,
  errorCategory: `${yunduTraceAttributePrefix}.error.category`,
  errorCode: `${yunduTraceAttributePrefix}.error.code`,
  handlerName: `${yunduTraceAttributePrefix}.handler.name`,
  integrationKey: `${yunduTraceAttributePrefix}.integration.key`,
  mutationSpecName: `${yunduTraceAttributePrefix}.mutation_spec.name`,
  queryName: `${yunduTraceAttributePrefix}.query.name`,
  readModelName: `${yunduTraceAttributePrefix}.read_model.name`,
  repositoryName: `${yunduTraceAttributePrefix}.repository.name`,
  requestId: `${yunduTraceAttributePrefix}.request.id`,
  selectionSpecName: `${yunduTraceAttributePrefix}.selection_spec.name`,
  sourceLocator: `${yunduTraceAttributePrefix}.source.locator`,
} as const;

export function createExecutionContextAttributes(context: ExecutionContext): TraceAttributes {
  return {
    [yunduTraceAttributes.requestId]: context.requestId,
    [yunduTraceAttributes.entrypoint]: context.entrypoint,
    [yunduTraceAttributes.actorId]: context.actor?.id,
    [yunduTraceAttributes.actorKind]: context.actor?.kind,
  };
}

export function createDomainErrorTraceAttributes(error: DomainError): TraceAttributes {
  return {
    [yunduTraceAttributes.errorCode]: error.code,
    [yunduTraceAttributes.errorCategory]: error.category,
  };
}

export function toRepositoryContext(
  context: ExecutionContext,
  input?: {
    transaction?: unknown;
  },
): RepositoryContext {
  return {
    requestId: context.requestId,
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
  return `yundu.command.${toSpanSegment(commandName)}`;
}

export function createQuerySpanName(queryName: string): string {
  return `yundu.query.${toSpanSegment(queryName)}`;
}

export function createRepositorySpanName(repositoryName: string, operation: string): string {
  return `yundu.repository.${toSpanSegment(repositoryName)}.${toSpanSegment(operation)}`;
}

export function createReadModelSpanName(readModelName: string, operation: string): string {
  return `yundu.read_model.${toSpanSegment(readModelName)}.${toSpanSegment(operation)}`;
}

export function createAdapterSpanName(adapterName: string, operation: string): string {
  return `yundu.adapter.${toSpanSegment(adapterName)}.${toSpanSegment(operation)}`;
}
