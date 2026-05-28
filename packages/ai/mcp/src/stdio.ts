#!/usr/bin/env bun
import "reflect-metadata";

import { bootstrapOpenTelemetryFromEnv } from "@appaloft/observability/bootstrap";

await bootstrapOpenTelemetryFromEnv();

const { runShellCli } = await import("../../../../apps/shell/src/run");

process.argv = [process.argv[0] ?? "bun", process.argv[1] ?? "appaloft-mcp", "mcp", "stdio"];

await runShellCli();
