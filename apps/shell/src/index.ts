import "reflect-metadata";

import { bootstrapOpenTelemetryFromEnv } from "@yundu/observability/bootstrap";

await bootstrapOpenTelemetryFromEnv();

const { runShellCli } = await import("./run");
await runShellCli();
