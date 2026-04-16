import { type Attributes, type Span, SpanStatusCode, type Tracer, trace } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  type Sampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import {
  type AppSpan,
  type AppTracer,
  type TraceAttributes,
  type TraceAttributeValue,
} from "@yundu/application";

export interface OpenTelemetryBootstrapConfig {
  appVersion?: string;
  environment?: string;
  otelEnabled: boolean;
  otelServiceName: string;
  otelExporterEndpoint?: string;
  otelExporterHeaders?: string;
  otelTracesSampler?: string;
  otelTracesSamplerArg?: string;
}

interface OpenTelemetryRuntime {
  shutdown(): Promise<void>;
  tracer: AppTracer;
}

const localOtlpTraceEndpoint = "http://localhost:4318/v1/traces";
let activeRuntime: OpenTelemetryRuntime | undefined;

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

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function normalizeTraceEndpointFromBase(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");

  if (trimmed.endsWith("/v1/traces")) {
    return trimmed;
  }

  return `${trimmed}/v1/traces`;
}

function parseOtlpHeaders(rawHeaders?: string): Record<string, string> | undefined {
  if (!rawHeaders) {
    return undefined;
  }

  const headers = Object.fromEntries(
    rawHeaders
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const separatorIndex = entry.indexOf("=");

        if (separatorIndex <= 0) {
          return undefined;
        }

        const name = entry.slice(0, separatorIndex).trim();
        const value = entry.slice(separatorIndex + 1).trim();

        if (!name) {
          return undefined;
        }

        return [name, decodeURIComponent(value)] as const;
      })
      .filter((entry): entry is readonly [string, string] => entry !== undefined),
  );

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function parseSamplingRatio(value?: string): number {
  const parsed = Number(value ?? "1");

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.min(1, Math.max(0, parsed));
}

function createSampler(config: OpenTelemetryBootstrapConfig): Sampler | undefined {
  const sampler = config.otelTracesSampler?.trim().toLowerCase();

  if (!sampler) {
    return undefined;
  }

  switch (sampler) {
    case "always_on":
      return new AlwaysOnSampler();
    case "always_off":
      return new AlwaysOffSampler();
    case "traceidratio":
      return new TraceIdRatioBasedSampler(parseSamplingRatio(config.otelTracesSamplerArg));
    case "parentbased_always_on":
      return new ParentBasedSampler({ root: new AlwaysOnSampler() });
    case "parentbased_always_off":
      return new ParentBasedSampler({ root: new AlwaysOffSampler() });
    case "parentbased_traceidratio":
      return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(parseSamplingRatio(config.otelTracesSamplerArg)),
      });
    default:
      return undefined;
  }
}

function resolveExporterEndpoint(config: OpenTelemetryBootstrapConfig): string | undefined {
  if (config.otelExporterEndpoint) {
    return config.otelExporterEndpoint;
  }

  return config.environment === "development" ? localOtlpTraceEndpoint : undefined;
}

function createNoopRuntime(): OpenTelemetryRuntime {
  return {
    tracer: new NoopTracer(),
    async shutdown(): Promise<void> {
      return;
    },
  };
}

function buildRuntime(config: OpenTelemetryBootstrapConfig): OpenTelemetryRuntime {
  if (!config.otelEnabled) {
    return createNoopRuntime();
  }

  const exporterEndpoint = resolveExporterEndpoint(config);

  if (!exporterEndpoint) {
    return createNoopRuntime();
  }

  const headers = parseOtlpHeaders(config.otelExporterHeaders);
  const sampler = createSampler(config);
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": {
          enabled: false,
        },
      }),
    ],
    logRecordProcessors: [],
    metricReaders: [],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.otelServiceName,
      ...(config.appVersion ? { [ATTR_SERVICE_VERSION]: config.appVersion } : {}),
    }),
    traceExporter: new OTLPTraceExporter({
      url: exporterEndpoint,
      ...(headers ? { headers } : {}),
    }),
    ...(sampler ? { sampler } : {}),
  });

  sdk.start();

  return {
    tracer: new OpenTelemetryAppTracer(trace.getTracer("yundu.application", config.appVersion)),
    async shutdown(): Promise<void> {
      await sdk.shutdown();
    },
  };
}

export async function bootstrapOpenTelemetry(
  config: OpenTelemetryBootstrapConfig,
): Promise<OpenTelemetryRuntime> {
  if (activeRuntime) {
    return activeRuntime;
  }

  try {
    activeRuntime = buildRuntime(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`OpenTelemetry initialization failed: ${message}`);
    activeRuntime = createNoopRuntime();
  }

  return activeRuntime;
}

export function resolveOpenTelemetryConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): OpenTelemetryBootstrapConfig {
  const disabled = parseBoolean(env.OTEL_SDK_DISABLED) === true;
  const legacyEnabled = parseBoolean(env.YUNDU_OTEL_ENABLED);
  const traceEndpoint =
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    (env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? normalizeTraceEndpointFromBase(env.OTEL_EXPORTER_OTLP_ENDPOINT)
      : undefined) ??
    env.YUNDU_OTEL_EXPORTER_OTLP_ENDPOINT;
  const enabled = disabled ? false : (legacyEnabled ?? Boolean(traceEndpoint));
  const appVersion = env.YUNDU_APP_VERSION;
  const exporterHeaders = env.OTEL_EXPORTER_OTLP_TRACES_HEADERS ?? env.OTEL_EXPORTER_OTLP_HEADERS;

  return {
    environment: env.YUNDU_ENV ?? env.NODE_ENV ?? "development",
    otelEnabled: enabled,
    otelServiceName: env.OTEL_SERVICE_NAME ?? env.YUNDU_OTEL_SERVICE_NAME ?? "yundu-backend",
    ...(appVersion ? { appVersion } : {}),
    ...(traceEndpoint ? { otelExporterEndpoint: traceEndpoint } : {}),
    ...(exporterHeaders ? { otelExporterHeaders: exporterHeaders } : {}),
    ...(env.OTEL_TRACES_SAMPLER ? { otelTracesSampler: env.OTEL_TRACES_SAMPLER } : {}),
    ...(env.OTEL_TRACES_SAMPLER_ARG ? { otelTracesSamplerArg: env.OTEL_TRACES_SAMPLER_ARG } : {}),
  };
}

export async function bootstrapOpenTelemetryFromEnv(
  env?: Record<string, string | undefined>,
): Promise<OpenTelemetryRuntime> {
  return bootstrapOpenTelemetry(resolveOpenTelemetryConfigFromEnv(env));
}
