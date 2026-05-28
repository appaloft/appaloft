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

export type AppEntrypoint = "cli" | "http" | "mcp" | "rpc" | "system";

export interface ExecutionActor {
  kind: "deploy-token" | "system" | "user";
  id: string;
  label?: string;
}

export type ExecutionOrganizationTeamRole = "admin" | "billing" | "developer" | "owner" | "viewer";
export type ExecutionProductOrganizationRole = "admin" | "member" | "owner";

export interface ExecutionOrganizationRoleContext {
  organizationId: string;
  role: ExecutionOrganizationTeamRole;
  productRole?: ExecutionProductOrganizationRole;
}

export type ExecutionContextMode = "hosted" | "local-development" | "self-hosted" | (string & {});

export interface ExecutionTenantContext {
  tenantId: string;
  accountId?: string;
  organizationId?: string;
  subjectId?: string;
  mode?: ExecutionContextMode;
  source?: string;
}

export interface ExecutionPrincipal {
  kind: ExecutionActor["kind"];
  actorId: string;
  activeOrganization?: ExecutionOrganizationRoleContext;
  email?: string;
  userId?: string;
}

export interface ExecutionProviderAccessTokens {
  github?: string | undefined;
}

export interface ExecutionAuthContext {
  authorizationHeader?: string;
  cookieHeader?: string;
  providerAccessTokens?: ExecutionProviderAccessTokens;
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
  auth?: ExecutionAuthContext;
  entrypoint: AppEntrypoint;
  locale: AppaloftLocale;
  principal?: ExecutionPrincipal;
  requestId: string;
  tenant?: ExecutionTenantContext;
  t: AppaloftTranslate;
  tracer: AppTracer;
}

export interface RepositoryContext {
  actor?: ExecutionActor;
  locale: AppaloftLocale;
  principal?: ExecutionPrincipal;
  requestId: string;
  tenant?: ExecutionTenantContext;
  t: AppaloftTranslate;
  tracer: AppTracer;
  transaction?: unknown;
}

export interface ExecutionContextFactory {
  create(input: {
    actor?: ExecutionActor;
    auth?: ExecutionAuthContext;
    entrypoint: AppEntrypoint;
    locale?: string;
    principal?: ExecutionPrincipal;
    requestId?: string;
    tenant?: ExecutionTenantContext;
  }): ExecutionContext;
}

export function tenantContextForPrincipal(principal: ExecutionPrincipal): ExecutionTenantContext {
  const organizationId = principal.activeOrganization?.organizationId;

  return {
    tenantId: organizationId ?? principal.actorId,
    ...(organizationId ? { organizationId } : {}),
    subjectId: principal.userId ?? principal.actorId,
    source: "product-session",
  };
}

export function defaultExecutionTenantContext(): ExecutionTenantContext {
  return {
    tenantId: "tenant_instance",
    source: "instance-default",
  };
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
  auth?: ExecutionAuthContext;
  entrypoint: AppEntrypoint;
  locale?: string;
  principal?: ExecutionPrincipal;
  requestId?: string;
  tenant?: ExecutionTenantContext;
  tracer?: AppTracer;
  t?: AppaloftTranslate;
}): ExecutionContext {
  const locale = normalizeAppaloftLocale(input.locale);
  const t = input.t ?? createAppaloftTranslator({ locale });
  const tenant =
    input.tenant ??
    (input.principal
      ? tenantContextForPrincipal(input.principal)
      : defaultExecutionTenantContext());

  return {
    entrypoint: input.entrypoint,
    locale,
    requestId: input.requestId ?? createRequestId(),
    tenant,
    t,
    tracer: input.tracer ?? noopTracer,
    ...(input.actor ? { actor: input.actor } : {}),
    ...(input.auth ? { auth: input.auth } : {}),
    ...(input.principal ? { principal: input.principal } : {}),
  };
}

export function getExecutionAuthProviderAccessToken(
  context: ExecutionContext,
  providerKey: keyof ExecutionProviderAccessTokens,
): string | null {
  const accessToken = context.auth?.providerAccessTokens?.[providerKey]?.trim();
  return accessToken || null;
}

function normalizeExecutionProviderAccessTokens(
  providerAccessTokens: ExecutionProviderAccessTokens | undefined,
): ExecutionProviderAccessTokens | undefined {
  const github = providerAccessTokens?.github?.trim();
  if (!github) {
    return undefined;
  }

  return { github };
}

export function withExecutionAuthProviderAccessTokens(
  context: ExecutionContext,
  providerAccessTokens: ExecutionProviderAccessTokens | undefined,
): ExecutionContext {
  const normalizedProviderAccessTokens =
    normalizeExecutionProviderAccessTokens(providerAccessTokens);
  if (!normalizedProviderAccessTokens) {
    return context;
  }

  return {
    ...context,
    auth: {
      ...context.auth,
      providerAccessTokens: {
        ...context.auth?.providerAccessTokens,
        ...normalizedProviderAccessTokens,
      },
    },
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
  organizationId: `${appaloftTraceAttributePrefix}.organization.id`,
  organizationRole: `${appaloftTraceAttributePrefix}.organization.role`,
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
    [appaloftTraceAttributes.organizationId]: context.principal?.activeOrganization?.organizationId,
    [appaloftTraceAttributes.organizationRole]: context.principal?.activeOrganization?.role,
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
    ...(context.principal ? { principal: context.principal } : {}),
    ...(context.tenant ? { tenant: context.tenant } : {}),
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
