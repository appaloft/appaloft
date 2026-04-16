#!/usr/bin/env bun

import { yunduTraceAttributes } from "@yundu/application/execution-context";

type AttributeValue = string | number | boolean;
type AttributeMap = Record<string, AttributeValue>;
type SpanCategory =
  | "http.server"
  | "http.client"
  | "command"
  | "query"
  | "repository"
  | "read_model"
  | "runtime_logs"
  | "adapter"
  | "integration"
  | "database"
  | "other";

interface CliOptions {
  baseUrl: string;
  help: boolean;
  input?: string;
  json: boolean;
  stdin: boolean;
  thresholdMs: number;
  top: number;
}

interface YunduAttributeKeys {
  commandName: string;
  errorCategory: string;
  errorCode: string;
  handlerName: string;
  integrationKey: string;
  mutationSpecName: string;
  queryName: string;
  readModelName: string;
  repositoryName: string;
  deploymentId: string;
  resourceId: string;
  requestId: string;
  runtimeKind: string;
  runtimeLogCloseReason: string;
  runtimeLogCommand: string;
  runtimeLogFollow: string;
  runtimeLogLineCount: string;
  runtimeLogServiceName: string;
  runtimeLogTailLines: string;
  selectionSpecName: string;
  sourceLocator: string;
}

interface SpanNode {
  attributes: AttributeMap;
  category: SpanCategory;
  childSpanIds: string[];
  durationMs: number;
  durationUs: number;
  endUs: number;
  errorReasons: string[];
  operationName: string;
  parentSpanIds: string[];
  processId?: string;
  selfMs: number;
  serviceName: string;
  spanId: string;
  startOffsetMs: number;
  startUs: number;
  traceId: string;
}

interface CategoryStats {
  count: number;
  errorCount: number;
  maxMs: number;
  selfMs: number;
  totalMs: number;
}

interface SummarySpan {
  attrs: Record<string, AttributeValue>;
  category: SpanCategory;
  durationMs: number;
  errors: string[];
  name: string;
  selfMs: number;
  service: string;
  spanId: string;
  startMs: number;
}

interface TraceSummary {
  categories: Record<SpanCategory, CategoryStats>;
  criticalPath: {
    scoreMs: number;
    spans: SummarySpan[];
  };
  durationMs: number;
  errorSpans: SummarySpan[];
  rootSpans: SummarySpan[];
  services: string[];
  slowSelfSpans: SummarySpan[];
  slowSpans: SummarySpan[];
  spanCount: number;
  thresholdMs: number;
  traceId: string;
}

const fallbackYunduTraceAttributes: YunduAttributeKeys = {
  commandName: "yundu.command.name",
  errorCategory: "yundu.error.category",
  errorCode: "yundu.error.code",
  handlerName: "yundu.handler.name",
  integrationKey: "yundu.integration.key",
  mutationSpecName: "yundu.mutation_spec.name",
  queryName: "yundu.query.name",
  readModelName: "yundu.read_model.name",
  repositoryName: "yundu.repository.name",
  deploymentId: "yundu.deployment.id",
  resourceId: "yundu.resource.id",
  requestId: "yundu.request.id",
  runtimeKind: "yundu.runtime.kind",
  runtimeLogCloseReason: "yundu.runtime_logs.close_reason",
  runtimeLogCommand: "yundu.runtime_logs.command",
  runtimeLogFollow: "yundu.runtime_logs.follow",
  runtimeLogLineCount: "yundu.runtime_logs.line_count",
  runtimeLogServiceName: "yundu.runtime_logs.service_name",
  runtimeLogTailLines: "yundu.runtime_logs.tail_lines",
  selectionSpecName: "yundu.selection_spec.name",
  sourceLocator: "yundu.source.locator",
};

const allCategories: SpanCategory[] = [
  "http.server",
  "http.client",
  "command",
  "query",
  "repository",
  "read_model",
  "runtime_logs",
  "adapter",
  "integration",
  "database",
  "other",
];

function usage(): string {
  return `Usage:
  bun scripts/analyze-jaeger-trace.ts <trace-url|trace-id|trace-json-file> [--top 10]
  bun scripts/analyze-jaeger-trace.ts --stdin [--json] < trace.json

Options:
  --base-url <url>       Jaeger base URL for raw trace IDs. Defaults to JAEGER_BASE_URL or http://localhost:16686
  --json                 Emit compact JSON instead of Markdown
  --stdin                Read Jaeger trace JSON from stdin
  --threshold-ms <n>     Mark spans at or above this duration as notable. Defaults to 50
  --top <n>              Number of slow spans to show. Defaults to 10
  --help                 Show this help`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    baseUrl: process.env.JAEGER_BASE_URL ?? "http://localhost:16686",
    help: false,
    json: false,
    stdin: false,
    thresholdMs: 50,
    top: 10,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === undefined) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--stdin") {
      options.stdin = true;
      continue;
    }

    if (arg === "--base-url") {
      index += 1;
      options.baseUrl = readRequiredOption(argv, index, "--base-url");
      continue;
    }

    if (arg === "--top") {
      index += 1;
      options.top = readPositiveNumber(readRequiredOption(argv, index, "--top"), "--top");
      continue;
    }

    if (arg === "--threshold-ms") {
      index += 1;
      options.thresholdMs = readPositiveNumber(
        readRequiredOption(argv, index, "--threshold-ms"),
        "--threshold-ms",
      );
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.input) {
      throw new Error(`Only one input is supported. Unexpected extra input: ${arg}`);
    }

    options.input = arg;
  }

  return options;
}

function readRequiredOption(argv: string[], index: number, name: string): string {
  const value = argv[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function readPositiveNumber(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];

  return Array.isArray(value) ? value : [];
}

function toAttributeValue(value: unknown): AttributeValue | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function loadYunduAttributeKeys(): YunduAttributeKeys {
  return {
    commandName: yunduTraceAttributes.commandName ?? fallbackYunduTraceAttributes.commandName,
    errorCategory: yunduTraceAttributes.errorCategory ?? fallbackYunduTraceAttributes.errorCategory,
    errorCode: yunduTraceAttributes.errorCode ?? fallbackYunduTraceAttributes.errorCode,
    handlerName: yunduTraceAttributes.handlerName ?? fallbackYunduTraceAttributes.handlerName,
    integrationKey:
      yunduTraceAttributes.integrationKey ?? fallbackYunduTraceAttributes.integrationKey,
    mutationSpecName:
      yunduTraceAttributes.mutationSpecName ?? fallbackYunduTraceAttributes.mutationSpecName,
    queryName: yunduTraceAttributes.queryName ?? fallbackYunduTraceAttributes.queryName,
    readModelName: yunduTraceAttributes.readModelName ?? fallbackYunduTraceAttributes.readModelName,
    repositoryName:
      yunduTraceAttributes.repositoryName ?? fallbackYunduTraceAttributes.repositoryName,
    deploymentId: yunduTraceAttributes.deploymentId ?? fallbackYunduTraceAttributes.deploymentId,
    resourceId: yunduTraceAttributes.resourceId ?? fallbackYunduTraceAttributes.resourceId,
    requestId: yunduTraceAttributes.requestId ?? fallbackYunduTraceAttributes.requestId,
    runtimeKind: yunduTraceAttributes.runtimeKind ?? fallbackYunduTraceAttributes.runtimeKind,
    runtimeLogCloseReason:
      yunduTraceAttributes.runtimeLogCloseReason ??
      fallbackYunduTraceAttributes.runtimeLogCloseReason,
    runtimeLogCommand:
      yunduTraceAttributes.runtimeLogCommand ?? fallbackYunduTraceAttributes.runtimeLogCommand,
    runtimeLogFollow:
      yunduTraceAttributes.runtimeLogFollow ?? fallbackYunduTraceAttributes.runtimeLogFollow,
    runtimeLogLineCount:
      yunduTraceAttributes.runtimeLogLineCount ?? fallbackYunduTraceAttributes.runtimeLogLineCount,
    runtimeLogServiceName:
      yunduTraceAttributes.runtimeLogServiceName ??
      fallbackYunduTraceAttributes.runtimeLogServiceName,
    runtimeLogTailLines:
      yunduTraceAttributes.runtimeLogTailLines ?? fallbackYunduTraceAttributes.runtimeLogTailLines,
    selectionSpecName:
      yunduTraceAttributes.selectionSpecName ?? fallbackYunduTraceAttributes.selectionSpecName,
    sourceLocator: yunduTraceAttributes.sourceLocator ?? fallbackYunduTraceAttributes.sourceLocator,
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function extractTraceIdFromUrl(url: URL): string | undefined {
  const segments = url.pathname.split("/").filter(Boolean);
  const traceIndex = segments.findIndex((segment) => segment === "trace" || segment === "traces");
  const candidate = traceIndex >= 0 ? segments[traceIndex + 1] : segments.at(-1);

  return candidate && /^[a-f0-9]{16,32}$/i.test(candidate) ? candidate : undefined;
}

function createJaegerApiUrl(input: string, baseUrl: string): { apiUrl: string; traceId: string } {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const traceId = extractTraceIdFromUrl(url);

    if (!traceId) {
      throw new Error(`Could not extract a trace ID from URL: ${input}`);
    }

    return {
      apiUrl: `${url.origin}/api/traces/${traceId}`,
      traceId,
    };
  } catch (error) {
    if (error instanceof TypeError) {
      if (!/^[a-f0-9]{16,32}$/i.test(trimmed)) {
        throw new Error(`Input is not a Jaeger URL, trace ID, or readable JSON file: ${input}`);
      }

      const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

      return {
        apiUrl: `${normalizedBaseUrl}/api/traces/${trimmed}`,
        traceId: trimmed,
      };
    }

    throw error;
  }
}

async function readPayload(options: CliOptions): Promise<unknown> {
  if (options.stdin) {
    return JSON.parse(await Bun.stdin.text()) as unknown;
  }

  if (!options.input) {
    throw new Error("Missing input. Provide a Jaeger trace URL, trace ID, JSON file, or --stdin.");
  }

  const file = Bun.file(options.input);

  if (await file.exists()) {
    return JSON.parse(await file.text()) as unknown;
  }

  const { apiUrl } = createJaegerApiUrl(options.input, options.baseUrl);
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(
      `Jaeger API request failed: ${response.status} ${response.statusText} (${apiUrl})`,
    );
  }

  return (await response.json()) as unknown;
}

function extractTraceRecord(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error("Trace payload must be a JSON object");
  }

  const data = readArray(payload, "data");
  const firstTrace = data.find(isRecord);

  if (firstTrace) {
    return firstTrace;
  }

  if (Array.isArray(payload.spans)) {
    return payload;
  }

  throw new Error("Could not find a Jaeger trace record in payload.data[0] or payload.spans");
}

function readTags(value: unknown): AttributeMap {
  if (!Array.isArray(value)) {
    return {};
  }

  const attributes: AttributeMap = {};

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const key = readString(item, "key");
    const attributeValue = toAttributeValue(item.value);

    if (key && attributeValue !== undefined) {
      attributes[key] = attributeValue;
    }
  }

  return attributes;
}

function readProcesses(traceRecord: Record<string, unknown>): Record<string, string> {
  const processes = traceRecord.processes;
  const serviceNames: Record<string, string> = {};

  if (!isRecord(processes)) {
    return serviceNames;
  }

  for (const [processId, processValue] of Object.entries(processes)) {
    if (!isRecord(processValue)) {
      continue;
    }

    serviceNames[processId] = readString(processValue, "serviceName") ?? "unknown-service";
  }

  return serviceNames;
}

function readParentSpanIds(spanRecord: Record<string, unknown>): string[] {
  const references = readArray(spanRecord, "references");

  return references
    .filter(isRecord)
    .filter((reference) => {
      const refType = readString(reference, "refType");

      return refType === undefined || refType === "CHILD_OF" || refType === "FOLLOWS_FROM";
    })
    .map((reference) => readString(reference, "spanID"))
    .filter((spanId): spanId is string => spanId !== undefined);
}

function hasAttribute(attributes: AttributeMap, key: string): boolean {
  return Object.hasOwn(attributes, key);
}

function classifySpan(
  operationName: string,
  attributes: AttributeMap,
  yunduAttributes: YunduAttributeKeys,
): SpanCategory {
  if (/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) /.test(operationName)) {
    return "http.server";
  }

  if (
    operationName.startsWith("yundu.command.") ||
    hasAttribute(attributes, yunduAttributes.commandName)
  ) {
    return "command";
  }

  if (
    operationName.startsWith("yundu.query.") ||
    hasAttribute(attributes, yunduAttributes.queryName)
  ) {
    return "query";
  }

  if (
    operationName.startsWith("yundu.repository.") ||
    hasAttribute(attributes, yunduAttributes.repositoryName)
  ) {
    return "repository";
  }

  if (
    operationName.startsWith("yundu.read_model.") ||
    hasAttribute(attributes, yunduAttributes.readModelName)
  ) {
    return "read_model";
  }

  if (operationName.startsWith("yundu.adapter.")) {
    return "adapter";
  }

  if (operationName.startsWith("yundu.runtime_logs.")) {
    return "runtime_logs";
  }

  if (operationName.startsWith("db.") || hasAttribute(attributes, "db.system.name")) {
    return "database";
  }

  if (hasAttribute(attributes, yunduAttributes.integrationKey)) {
    return "integration";
  }

  if (hasAttribute(attributes, "http.request.method")) {
    return "http.client";
  }

  return "other";
}

function findErrorReasons(attributes: AttributeMap, yunduAttributes: YunduAttributeKeys): string[] {
  const reasons: string[] = [];
  const errorValue = attributes.error;
  const statusCode = attributes["http.response.status_code"];
  const otelStatusCode = attributes["otel.status_code"];
  const yunduErrorCode = attributes[yunduAttributes.errorCode];
  const yunduErrorCategory = attributes[yunduAttributes.errorCategory];

  if (errorValue === true || errorValue === "true") {
    reasons.push("error=true");
  }

  if (otelStatusCode === "ERROR") {
    reasons.push("otel.status_code=ERROR");
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    reasons.push(`http.response.status_code=${statusCode}`);
  }

  if (yunduErrorCode !== undefined) {
    reasons.push(`${yunduAttributes.errorCode}=${String(yunduErrorCode)}`);
  }

  if (yunduErrorCategory !== undefined) {
    reasons.push(`${yunduAttributes.errorCategory}=${String(yunduErrorCategory)}`);
  }

  return reasons;
}

function buildSpanNodes(
  traceRecord: Record<string, unknown>,
  yunduAttributes: YunduAttributeKeys,
): SpanNode[] {
  const traceId = readString(traceRecord, "traceID") ?? "unknown-trace";
  const serviceNames = readProcesses(traceRecord);
  const spanRecords = readArray(traceRecord, "spans").filter(isRecord);
  const minStartUs = Math.min(
    ...spanRecords
      .map((spanRecord) => readNumber(spanRecord, "startTime"))
      .filter((startTime): startTime is number => startTime !== undefined),
  );
  const safeMinStartUs = Number.isFinite(minStartUs) ? minStartUs : 0;

  const spans = spanRecords
    .map((spanRecord): SpanNode | undefined => {
      const spanId = readString(spanRecord, "spanID");
      const operationName = readString(spanRecord, "operationName");
      const startUs = readNumber(spanRecord, "startTime");
      const durationUs = readNumber(spanRecord, "duration");

      if (!spanId || !operationName || startUs === undefined || durationUs === undefined) {
        return undefined;
      }

      const attributes = readTags(spanRecord.tags);
      const processId = readString(spanRecord, "processID");
      const category = classifySpan(operationName, attributes, yunduAttributes);

      return {
        attributes,
        category,
        childSpanIds: [],
        durationMs: durationUs / 1000,
        durationUs,
        endUs: startUs + durationUs,
        errorReasons: findErrorReasons(attributes, yunduAttributes),
        operationName,
        parentSpanIds: readParentSpanIds(spanRecord),
        ...(processId ? { processId } : {}),
        selfMs: durationUs / 1000,
        serviceName: processId ? (serviceNames[processId] ?? "unknown-service") : "unknown-service",
        spanId,
        startOffsetMs: (startUs - safeMinStartUs) / 1000,
        startUs,
        traceId: readString(spanRecord, "traceID") ?? traceId,
      };
    })
    .filter((span): span is SpanNode => span !== undefined);

  const spanIds = new Set(spans.map((span) => span.spanId));
  const spanById = new Map(spans.map((span) => [span.spanId, span]));

  for (const span of spans) {
    span.parentSpanIds = span.parentSpanIds.filter((spanId) => spanIds.has(spanId));

    for (const parentSpanId of span.parentSpanIds) {
      spanById.get(parentSpanId)?.childSpanIds.push(span.spanId);
    }
  }

  for (const span of spans) {
    const children = span.childSpanIds
      .map((spanId) => spanById.get(spanId))
      .filter((child): child is SpanNode => child !== undefined);
    span.selfMs = Math.max(0, (span.durationUs - coveredChildDurationUs(span, children)) / 1000);
  }

  return spans;
}

function coveredChildDurationUs(parent: SpanNode, children: SpanNode[]): number {
  const intervals = children
    .map((child) => ({
      endUs: Math.min(parent.endUs, child.endUs),
      startUs: Math.max(parent.startUs, child.startUs),
    }))
    .filter((interval) => interval.endUs > interval.startUs)
    .sort((left, right) => left.startUs - right.startUs);

  let total = 0;
  let currentStart: number | undefined;
  let currentEnd: number | undefined;

  for (const interval of intervals) {
    if (currentStart === undefined || currentEnd === undefined) {
      currentStart = interval.startUs;
      currentEnd = interval.endUs;
      continue;
    }

    if (interval.startUs <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endUs);
      continue;
    }

    total += currentEnd - currentStart;
    currentStart = interval.startUs;
    currentEnd = interval.endUs;
  }

  if (currentStart !== undefined && currentEnd !== undefined) {
    total += currentEnd - currentStart;
  }

  return total;
}

function pickInterestingAttributes(
  span: SpanNode,
  yunduAttributes: YunduAttributeKeys,
): Record<string, AttributeValue> {
  const keys = [
    "http.route",
    "http.request.method",
    "http.response.status_code",
    "url.path",
    "db.system.name",
    "db.operation.name",
    "db.response.returned_rows",
    yunduAttributes.commandName,
    yunduAttributes.queryName,
    yunduAttributes.repositoryName,
    yunduAttributes.readModelName,
    yunduAttributes.handlerName,
    yunduAttributes.integrationKey,
    yunduAttributes.mutationSpecName,
    yunduAttributes.selectionSpecName,
    yunduAttributes.resourceId,
    yunduAttributes.deploymentId,
    yunduAttributes.requestId,
    yunduAttributes.runtimeKind,
    yunduAttributes.runtimeLogCloseReason,
    yunduAttributes.runtimeLogCommand,
    yunduAttributes.runtimeLogFollow,
    yunduAttributes.runtimeLogLineCount,
    yunduAttributes.runtimeLogServiceName,
    yunduAttributes.runtimeLogTailLines,
    yunduAttributes.sourceLocator,
    yunduAttributes.errorCode,
    yunduAttributes.errorCategory,
  ];
  const attributes: Record<string, AttributeValue> = {};

  for (const key of keys) {
    const value = span.attributes[key];

    if (value !== undefined) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function toSummarySpan(span: SpanNode, yunduAttributes: YunduAttributeKeys): SummarySpan {
  return {
    attrs: pickInterestingAttributes(span, yunduAttributes),
    category: span.category,
    durationMs: roundMs(span.durationMs),
    errors: span.errorReasons,
    name: span.operationName,
    selfMs: roundMs(span.selfMs),
    service: span.serviceName,
    spanId: span.spanId,
    startMs: roundMs(span.startOffsetMs),
  };
}

function createEmptyCategoryStats(): Record<SpanCategory, CategoryStats> {
  return Object.fromEntries(
    allCategories.map((category) => [
      category,
      {
        count: 0,
        errorCount: 0,
        maxMs: 0,
        selfMs: 0,
        totalMs: 0,
      },
    ]),
  ) as Record<SpanCategory, CategoryStats>;
}

function summarizeTrace(
  traceRecord: Record<string, unknown>,
  yunduAttributes: YunduAttributeKeys,
  options: CliOptions,
): TraceSummary {
  const spans = buildSpanNodes(traceRecord, yunduAttributes);

  if (spans.length === 0) {
    throw new Error("Trace does not contain readable spans");
  }

  const traceId = spans[0]?.traceId ?? readString(traceRecord, "traceID") ?? "unknown-trace";
  const minStartUs = Math.min(...spans.map((span) => span.startUs));
  const maxEndUs = Math.max(...spans.map((span) => span.endUs));
  const categories = createEmptyCategoryStats();
  const roots = spans.filter((span) => span.parentSpanIds.length === 0);
  const slowSpans = spans
    .filter((span) => span.durationMs >= options.thresholdMs)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, options.top);
  const slowSelfSpans = spans
    .filter((span) => span.selfMs >= options.thresholdMs)
    .sort((left, right) => right.selfMs - left.selfMs)
    .slice(0, options.top);
  const errorSpans = spans
    .filter((span) => span.errorReasons.length > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, options.top);

  for (const span of spans) {
    const stats = categories[span.category];
    stats.count += 1;
    stats.errorCount += span.errorReasons.length > 0 ? 1 : 0;
    stats.maxMs = Math.max(stats.maxMs, span.durationMs);
    stats.selfMs += span.selfMs;
    stats.totalMs += span.durationMs;
  }

  for (const stats of Object.values(categories)) {
    stats.maxMs = roundMs(stats.maxMs);
    stats.selfMs = roundMs(stats.selfMs);
    stats.totalMs = roundMs(stats.totalMs);
  }

  const criticalPath = computeCriticalPath(spans);

  return {
    categories,
    criticalPath: {
      scoreMs: roundMs(criticalPath.scoreMs),
      spans: criticalPath.spans.map((span) => toSummarySpan(span, yunduAttributes)),
    },
    durationMs: roundMs((maxEndUs - minStartUs) / 1000),
    errorSpans: errorSpans.map((span) => toSummarySpan(span, yunduAttributes)),
    rootSpans: roots.map((span) => toSummarySpan(span, yunduAttributes)),
    services: [...new Set(spans.map((span) => span.serviceName))].sort(),
    slowSelfSpans: slowSelfSpans.map((span) => toSummarySpan(span, yunduAttributes)),
    slowSpans: slowSpans.map((span) => toSummarySpan(span, yunduAttributes)),
    spanCount: spans.length,
    thresholdMs: options.thresholdMs,
    traceId,
  };
}

function computeCriticalPath(spans: SpanNode[]): { scoreMs: number; spans: SpanNode[] } {
  const spanById = new Map(spans.map((span) => [span.spanId, span]));
  const roots = spans.filter((span) => span.parentSpanIds.length === 0);
  const memo = new Map<string, { scoreMs: number; spans: SpanNode[] }>();

  function bestFrom(span: SpanNode): { scoreMs: number; spans: SpanNode[] } {
    const cached = memo.get(span.spanId);

    if (cached) {
      return cached;
    }

    const childPaths = span.childSpanIds
      .map((spanId) => spanById.get(spanId))
      .filter((child): child is SpanNode => child !== undefined)
      .map(bestFrom)
      .sort((left, right) => right.scoreMs - left.scoreMs);
    const bestChild = childPaths[0];
    const result = {
      scoreMs: span.durationMs + (bestChild?.scoreMs ?? 0),
      spans: [span, ...(bestChild?.spans ?? [])],
    };

    memo.set(span.spanId, result);

    return result;
  }

  const candidates = (roots.length > 0 ? roots : spans).map(bestFrom);

  return (
    candidates.sort((left, right) => right.scoreMs - left.scoreMs)[0] ?? {
      scoreMs: 0,
      spans: [],
    }
  );
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatMs(value: number): string {
  return `${value.toFixed(value >= 100 ? 1 : 3)}ms`;
}

function formatAttributes(attributes: Record<string, AttributeValue>): string {
  const entries = Object.entries(attributes);

  if (entries.length === 0) {
    return "";
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function spanRows(spans: SummarySpan[]): string {
  if (spans.length === 0) {
    return "_None._";
  }

  return [
    "| Category | Duration | Self | Start | Service | Span | Attributes |",
    "| --- | ---: | ---: | ---: | --- | --- | --- |",
    ...spans.map(
      (span) =>
        `| ${span.category} | ${formatMs(span.durationMs)} | ${formatMs(span.selfMs)} | ${formatMs(
          span.startMs,
        )} | ${escapeCell(span.service)} | ${escapeCell(span.name)} | ${escapeCell(
          formatAttributes(span.attrs),
        )} |`,
    ),
  ].join("\n");
}

function categoryRows(summary: TraceSummary): string {
  const rows = allCategories
    .map((category) => ({
      category,
      stats: summary.categories[category],
    }))
    .filter(({ stats }) => stats.count > 0)
    .sort((left, right) => right.stats.selfMs - left.stats.selfMs);

  return [
    "| Category | Count | Span Duration Sum | Self Estimate | Max Span | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      ({ category, stats }) =>
        `| ${category} | ${stats.count} | ${formatMs(stats.totalMs)} | ${formatMs(
          stats.selfMs,
        )} | ${formatMs(stats.maxMs)} | ${stats.errorCount} |`,
    ),
  ].join("\n");
}

function renderMarkdown(summary: TraceSummary): string {
  const lines = [
    `# Trace ${summary.traceId}`,
    "",
    `- Duration: ${formatMs(summary.durationMs)}`,
    `- Spans: ${summary.spanCount}`,
    `- Services: ${summary.services.join(", ") || "unknown"}`,
    `- Slow-span threshold: ${formatMs(summary.thresholdMs)}`,
    "",
    "## Root Spans",
    "",
    spanRows(summary.rootSpans),
    "",
    "## Category Breakdown",
    "",
    categoryRows(summary),
    "",
    "## Critical Path (Longest Causal Chain)",
    "",
    `Cumulative span-duration score: ${formatMs(summary.criticalPath.scoreMs)}. Nested spans can double-count; use this as a path finder, not wall-clock time.`,
    "",
    spanRows(summary.criticalPath.spans),
    "",
    "## Slow Spans By Duration",
    "",
    spanRows(summary.slowSpans),
    "",
    "## Slow Spans By Self-Time Estimate",
    "",
    spanRows(summary.slowSelfSpans),
    "",
    "## Error Spans",
    "",
    summary.errorSpans.length > 0
      ? [
          "| Category | Duration | Service | Span | Errors | Attributes |",
          "| --- | ---: | --- | --- | --- | --- |",
          ...summary.errorSpans.map(
            (span) =>
              `| ${span.category} | ${formatMs(span.durationMs)} | ${escapeCell(
                span.service,
              )} | ${escapeCell(span.name)} | ${escapeCell(span.errors.join(", "))} | ${escapeCell(
                formatAttributes(span.attrs),
              )} |`,
          ),
        ].join("\n")
      : "_None._",
  ];

  return lines.join("\n");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const yunduAttributes = loadYunduAttributeKeys();
  const payload = await readPayload(options);
  const traceRecord = extractTraceRecord(payload);
  const summary = summarizeTrace(traceRecord, yunduAttributes, options);

  console.log(options.json ? JSON.stringify(summary, null, 2) : renderMarkdown(summary));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
