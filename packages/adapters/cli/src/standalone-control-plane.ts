import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneMode,
  type CliControlPlaneProfileStore,
} from "./control-plane-profile.js";
import {
  type CliControlPlaneDependencies,
  controlPlaneStatus,
  loginControlPlane,
  logoutControlPlane,
  useControlPlaneProfile,
} from "./control-plane-service.js";

export interface StandaloneControlPlaneCliInput {
  readonly argv?: readonly string[];
  readonly env?: CliControlPlaneEnvironment;
  readonly fetch?: AppaloftSdkFetch;
  readonly monotonicNow?: () => number;
  readonly store?: CliControlPlaneProfileStore;
  readonly now?: () => string;
  readonly openBrowser?: (url: string) => Promise<boolean> | boolean;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly stderr?: Pick<NodeJS.WriteStream, "write">;
}

export type StandaloneControlPlaneCliResult =
  | {
      readonly handled: false;
    }
  | {
      readonly handled: true;
      readonly exitCode: number;
    };

interface ParsedOptions {
  readonly booleans: Readonly<Record<string, boolean>>;
  readonly values: Readonly<Record<string, string>>;
  readonly positional: readonly string[];
}

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function parseOptions(
  args: readonly string[],
  optionNames: readonly string[],
  booleanOptionNames: readonly string[] = [],
): Result<ParsedOptions> {
  const booleans: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  const positional: string[] = [];
  const allowed = new Set(optionNames);
  const booleanAllowed = new Set(booleanOptionNames);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (booleanAllowed.has(key)) {
      booleans[key] = true;
      continue;
    }

    if (!allowed.has(key)) {
      return err({
        code: "validation_error",
        category: "user",
        message: `Unsupported option --${key}`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
        },
      });
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      return err({
        code: "validation_error",
        category: "user",
        message: `Option --${key} requires a value`,
        retryable: false,
        details: {
          phase: "control-plane-cli-parse",
        },
      });
    }
    values[key] = value;
    index += 1;
  }

  return ok({
    booleans,
    values,
    positional,
  });
}

function parseError(message: string): Result<never> {
  return err({
    code: "validation_error",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "control-plane-cli-parse",
    },
  } satisfies DomainError);
}

function renderJson(stdout: Pick<NodeJS.WriteStream, "write">, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function renderError(stderr: Pick<NodeJS.WriteStream, "write">, error: DomainError): void {
  const phase = typeof error.details?.phase === "string" ? error.details.phase : undefined;
  stderr.write(
    `${error.message}\ncode=${error.code} category=${error.category}${
      phase ? ` phase=${phase}` : ""
    } retryable=${String(error.retryable)}\n`,
  );
}

function deps(input: StandaloneControlPlaneCliInput): CliControlPlaneDependencies {
  return {
    ...(input.env ? { env: input.env } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
    ...(input.monotonicNow ? { monotonicNow: input.monotonicNow } : {}),
    ...(input.store ? { store: input.store } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.openBrowser ? { openBrowser: input.openBrowser } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  };
}

function modeValue(value: string | undefined): Result<CliControlPlaneMode | undefined> {
  if (value === undefined) {
    return ok(undefined);
  }
  if (value === "cloud" || value === "self-hosted") {
    return ok(value);
  }

  return parseError("Control plane mode must be cloud or self-hosted");
}

async function finish<T>(
  result: Promise<Result<T>> | Result<T>,
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const stdout = input.stdout ?? process.stdout;
  const stderr = input.stderr ?? process.stderr;
  const awaited = await result;

  if (awaited.isErr()) {
    renderError(stderr, awaited.error);
    return { handled: true, exitCode: 1 };
  }

  renderJson(stdout, awaited.value);
  return { handled: true, exitCode: 0 };
}

async function handleLogin(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const parsed = parseOptions(args, ["url", "mode", "profile"], ["no-browser"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const mode = modeValue(parsed.value.values.mode);
  if (mode.isErr()) {
    return finish(mode, input);
  }
  const url = parsed.value.values.url;
  const abortController = new AbortController();
  const abort = () => abortController.abort();
  process.once("SIGINT", abort);

  try {
    return await finish(
      loginControlPlane(
        {
          ...(url ? { url } : {}),
          ...(mode.value ? { mode: mode.value } : {}),
          ...(parsed.value.booleans["no-browser"] ? { openBrowser: false } : {}),
          ...(parsed.value.values.profile ? { profile: parsed.value.values.profile } : {}),
          signal: abortController.signal,
        },
        deps(input),
      ),
      input,
    );
  } finally {
    process.off("SIGINT", abort);
  }
}

function handleStatus(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const parsed = parseOptions(args, ["profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  return finish(controlPlaneStatus(parsed.value.values.profile, deps(input)), input);
}

function handleLogout(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const parsed = parseOptions(args, ["profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  return finish(logoutControlPlane(parsed.value.values.profile, deps(input)), input);
}

function handleContext(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const subcommand = args[0];
  if (subcommand === "list") {
    return handleStatus(args.slice(1), input);
  }
  if (subcommand === "show") {
    return handleStatus(args.slice(1), input);
  }
  if (subcommand === "use") {
    const profile = args[1];
    if (!profile) {
      return finish(parseError("context use requires a profile name"), input);
    }
    return finish(useControlPlaneProfile(profile, deps(input)), input);
  }

  return finish(parseError("context requires list, show, or use"), input);
}

export async function runStandaloneControlPlaneCli(
  input: StandaloneControlPlaneCliInput = {},
): Promise<StandaloneControlPlaneCliResult> {
  const args = commandArgs(input.argv ?? process.argv);
  const command = args[0];

  if (command === "login") {
    return handleLogin(args.slice(1), input);
  }
  if (command === "logout") {
    return handleLogout(args.slice(1), input);
  }
  if (command === "auth") {
    const subcommand = args[1];
    if (subcommand === "login") {
      return handleLogin(args.slice(2), input);
    }
    if (subcommand === "status") {
      return handleStatus(args.slice(2), input);
    }
    if (subcommand === "logout") {
      return handleLogout(args.slice(2), input);
    }
    return { handled: false };
  }
  if (command === "context") {
    return handleContext(args.slice(1), input);
  }
  return { handled: false };
}
