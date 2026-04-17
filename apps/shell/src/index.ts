import "reflect-metadata";

import { bootstrapOpenTelemetryFromEnv } from "@appaloft/observability/bootstrap";

await bootstrapOpenTelemetryFromEnv();

const { runShellCli } = await import("./run");
await runShellCli();
