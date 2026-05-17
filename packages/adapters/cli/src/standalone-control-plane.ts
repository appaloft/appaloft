import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftSdkFetch } from "@appaloft/sdk";
import {
  type CliControlPlaneEnvironment,
  type CliControlPlaneMode,
  type CliControlPlaneProfileStore,
} from "./control-plane-profile.js";
import {
  activeControlPlaneProfile,
  type CliControlPlaneDependencies,
  controlPlaneStatus,
  dispatchRemoteProjectOperation,
  loginControlPlane,
  logoutControlPlane,
  unsupportedRemoteProjectOperation,
  useControlPlaneProfile,
} from "./control-plane-service.js";

export interface StandaloneControlPlaneCliInput {
  readonly argv?: readonly string[];
  readonly env?: CliControlPlaneEnvironment;
  readonly fetch?: AppaloftSdkFetch;
  readonly store?: CliControlPlaneProfileStore;
  readonly now?: () => string;
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
  readonly values: Readonly<Record<string, string>>;
  readonly positional: readonly string[];
}

const projectRemoteUnsupportedSubcommands = new Set([
  "archive",
  "create",
  "delete",
  "delete-check",
  "rename",
  "restore",
  "set-description",
]);

function commandArgs(argv: readonly string[]): readonly string[] {
  const args = argv.slice(2);
  return args[0] === "appaloft" ? args.slice(1) : args;
}

function parseOptions(
  args: readonly string[],
  optionNames: readonly string[],
): Result<ParsedOptions> {
  const values: Record<string, string> = {};
  const positional: string[] = [];
  const allowed = new Set(optionNames);

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
    ...(input.store ? { store: input.store } : {}),
    ...(input.now ? { now: input.now } : {}),
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
  const parsed = parseOptions(args, ["url", "mode", "profile"]);
  if (parsed.isErr()) {
    return finish(parsed, input);
  }
  const mode = modeValue(parsed.value.values.mode);
  if (mode.isErr()) {
    return finish(mode, input);
  }
  const url = parsed.value.values.url;
  if (!url) {
    return finish(parseError("Login requires --url"), input);
  }

  return finish(
    loginControlPlane(
      {
        url,
        ...(mode.value ? { mode: mode.value } : {}),
        ...(parsed.value.values.profile ? { profile: parsed.value.values.profile } : {}),
      },
      deps(input),
    ),
    input,
  );
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

async function hasActiveProfile(input: StandaloneControlPlaneCliInput): Promise<Result<boolean>> {
  const profile = await activeControlPlaneProfile(deps(input));
  if (profile.isErr()) {
    return err(profile.error);
  }
  return ok(Boolean(profile.value));
}

async function handleProject(
  args: readonly string[],
  input: StandaloneControlPlaneCliInput,
): Promise<StandaloneControlPlaneCliResult> {
  const subcommand = args[0];
  if (subcommand === "list") {
    if (args.length > 1) {
      return finish(parseError("project list does not accept positional arguments"), input);
    }
    const profile = await hasActiveProfile(input);
    if (profile.isErr()) {
      return finish(profile, input);
    }
    if (!profile.value) {
      return { handled: false };
    }
    return finish(
      dispatchRemoteProjectOperation({
        operationKey: "projects.list",
        deps: deps(input),
      }),
      input,
    );
  }

  if (subcommand === "show") {
    const profile = await hasActiveProfile(input);
    if (profile.isErr()) {
      return finish(profile, input);
    }
    if (!profile.value) {
      return { handled: false };
    }
    const projectId = args[1];
    if (!projectId) {
      return finish(parseError("project show requires a project id"), input);
    }
    if (args.length > 2) {
      return finish(parseError("project show accepts exactly one project id"), input);
    }
    return finish(
      dispatchRemoteProjectOperation({
        operationKey: "projects.show",
        projectId,
        deps: deps(input),
      }),
      input,
    );
  }

  if (subcommand && projectRemoteUnsupportedSubcommands.has(subcommand)) {
    const profile = await hasActiveProfile(input);
    if (profile.isErr()) {
      return finish(profile, input);
    }
    if (!profile.value) {
      return { handled: false };
    }
    return finish(err(unsupportedRemoteProjectOperation(subcommand)), input);
  }

  return { handled: false };
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
  if (command === "project") {
    return handleProject(args.slice(1), input);
  }

  return { handled: false };
}
