import "reflect-metadata";

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

function shouldBootstrapOpenTelemetry(env: Record<string, string | undefined>): boolean {
  if (parseBoolean(env.OTEL_SDK_DISABLED) === true) {
    return false;
  }

  const explicitEnabled = parseBoolean(env.APPALOFT_OTEL_ENABLED);
  if (explicitEnabled !== undefined) {
    return explicitEnabled;
  }

  return Boolean(
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
      env.OTEL_EXPORTER_OTLP_ENDPOINT ??
      env.APPALOFT_OTEL_EXPORTER_OTLP_ENDPOINT,
  );
}

const shouldBootstrapOtel = shouldBootstrapOpenTelemetry(process.env);
const shouldCaptureStdin =
  process.argv.includes("--stdin") || process.argv.includes("--connection-url-stdin");
let capturedStdinText: string | undefined;
if (shouldCaptureStdin) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  capturedStdinText = Buffer.concat(chunks).toString("utf8");
}

if (shouldBootstrapOtel) {
  const { bootstrapOpenTelemetryFromEnv } = await import("@appaloft/observability/bootstrap");
  await bootstrapOpenTelemetryFromEnv();
}

const { runShellCli } = await import("./run");
await runShellCli(undefined, capturedStdinText);
