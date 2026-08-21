import {
  isOccupancyHelpArgs,
  reportOccupancyCliStartupOnce,
  shouldPrintOccupancyLineProgress,
  shouldWarmOccupancyTui,
} from "./occupancy-cli-progress";
import {
  enterOccupancyAltScreen,
  exitQuietlyOnOccupancyEpipe,
  ignoreOccupancyTerminalEpipe,
  installOccupancyAltScreenRestore,
  leaveOccupancyAltScreen,
  restoreOccupancyAltScreenIfEntered,
} from "./occupancy-tui-first-frame";

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

function shellCommandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2).filter((arg) => arg !== "--");
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function isHelpFlag(args: readonly string[]): boolean {
  return isOccupancyHelpArgs(args);
}

function exitProcess(code: number): never {
  restoreOccupancyAltScreenIfEntered();
  process.exit(code);
}

installOccupancyAltScreenRestore();
process.stdout.on("error", ignoreOccupancyTerminalEpipe);
process.stderr.on("error", ignoreOccupancyTerminalEpipe);
process.on("uncaughtException", exitQuietlyOnOccupancyEpipe);
process.on("unhandledRejection", exitQuietlyOnOccupancyEpipe);

const args = shellCommandArgs(process.argv);
const command = args[0];
if (command === "code" && isHelpFlag(args)) {
  const { renderCodeHelp } = await import("@appaloft/adapter-cli/code-help");
  renderCodeHelp(process.stdout);
  exitProcess(0);
}
if (command === "setup" && isHelpFlag(args)) {
  const { renderSetupHelp } = await import("@appaloft/adapter-cli/setup-help");
  renderSetupHelp(process.stdout);
  exitProcess(0);
}
if (shouldPrintOccupancyLineProgress(args)) {
  reportOccupancyCliStartupOnce(args);
} else if (shouldWarmOccupancyTui(args)) {
  enterOccupancyAltScreen();
  void import("@appaloft/adapter-cli/workspace-tui-launch")
    .then(({ warmupWorkspaceControlRenderer }) => warmupWorkspaceControlRenderer())
    .catch(() => {
      leaveOccupancyAltScreen();
    });
}
const standaloneCommand =
  !command ||
  command === "login" ||
  command === "logout" ||
  command === "auth" ||
  command === "context" ||
  command === "help" ||
  command === "--help" ||
  command === "-h" ||
  command === "--version" ||
  command === "version";

const shouldBootstrapOtel = shouldBootstrapOpenTelemetry(process.env);
const shouldCaptureStdin =
  process.argv.includes("--stdin") ||
  process.argv.includes("--token-stdin") ||
  process.argv.includes("--connection-url-stdin") ||
  process.argv.includes("--passphrase-stdin");
let capturedStdinText: string | undefined;
if (shouldCaptureStdin) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  capturedStdinText = Buffer.concat(chunks).toString("utf8");
}

await import("reflect-metadata");

if (standaloneCommand) {
  const { runStandaloneControlPlaneCli } = await import("@appaloft/adapter-cli");
  const result = await runStandaloneControlPlaneCli({
    argv: process.argv,
    env: process.env,
    ...(capturedStdinText === undefined ? {} : { stdinText: capturedStdinText }),
  });
  if (result.handled) {
    exitProcess(result.exitCode);
  }
}

if (
  isHelpFlag(args) &&
  command !== "worker" &&
  command !== "mcp" &&
  command !== "dev" &&
  command !== "setup"
) {
  const { createCliHelpProgram } = await import("@appaloft/adapter-cli");
  const helpProgram = createCliHelpProgram({
    version: process.env.APPALOFT_APP_VERSION ?? "0.0.0",
  });
  try {
    await helpProgram.parseAsync(process.argv);
    exitProcess(0);
  } catch {
    exitProcess(1);
  }
}

if (shouldBootstrapOtel) {
  const { bootstrapOpenTelemetryFromEnv } = await import("@appaloft/observability/bootstrap");
  await bootstrapOpenTelemetryFromEnv();
}

const { runShellCli } = await import("./run");
await runShellCli(undefined, capturedStdinText);
