import { readFile } from "node:fs/promises";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { type CliControlPlaneMode } from "../control-plane-profile.js";
import {
  controlPlaneStatus,
  loginControlPlane,
  logoutControlPlane,
  tokenLoginControlPlane,
  useControlPlaneProfile,
} from "../control-plane-service.js";
import { optionalValue, print, resultToEffect } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const controlPlaneModes = ["cloud", "self-hosted"] as const;

const urlOption = Options.text("url").pipe(Options.optional);
const profileOption = Options.text("profile").pipe(Options.optional);
const modeOption = Options.choice("mode", controlPlaneModes).pipe(Options.optional);
const noBrowserOption = Options.boolean("no-browser").pipe(Options.withDefault(false));
const stdinOption = Options.boolean("stdin").pipe(Options.withDefault(false));
const tokenFileOption = Options.text("token-file").pipe(Options.optional);
const profileArg = Args.text({ name: "profile" });

function runControlPlaneTask<T>(task: Promise<Result<T>>) {
  return Effect.gen(function* () {
    const result = yield* Effect.promise(() => task);
    const output = yield* resultToEffect(result);
    yield* print(output);
  });
}

function loginTask(input: {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly openBrowser?: boolean;
  readonly profile?: string;
}) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      process.once("SIGINT", abort);
      return { abort, abortController };
    }),
    ({ abortController }) =>
      runControlPlaneTask(
        loginControlPlane({
          ...input,
          signal: abortController.signal,
        }),
      ),
    ({ abort }) => Effect.sync(() => process.off("SIGINT", abort)),
  );
}

function loginInput(
  url: string | undefined,
  mode: CliControlPlaneMode | undefined,
  noBrowser: boolean,
  profile: string | undefined,
) {
  return {
    ...(url ? { url } : {}),
    ...(mode ? { mode } : {}),
    ...(noBrowser ? { openBrowser: false } : {}),
    ...(profile ? { profile } : {}),
  };
}

function commandValidationError(message: string): DomainError {
  return {
    code: "validation_error",
    category: "user",
    message,
    retryable: false,
    details: {
      phase: "control-plane-cli-parse",
    },
  };
}

async function readStdinText(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readTokenMaterial(input: {
  readonly stdin: boolean;
  readonly tokenFile?: string;
}): Promise<Result<string | undefined>> {
  if (input.stdin && input.tokenFile) {
    return err(commandValidationError("Use either --stdin or --token-file, not both"));
  }
  if (input.tokenFile) {
    return ok(await readFile(input.tokenFile, "utf8"));
  }
  if (input.stdin) {
    return ok(await readStdinText());
  }
  return ok(undefined);
}

function tokenLoginTask(input: {
  readonly url?: string;
  readonly mode?: CliControlPlaneMode;
  readonly profile?: string;
  readonly stdin: boolean;
  readonly tokenFile?: string;
}) {
  return Effect.gen(function* () {
    const token = yield* resultToEffect(
      yield* Effect.promise(() =>
        readTokenMaterial({
          stdin: input.stdin,
          ...(input.tokenFile ? { tokenFile: input.tokenFile } : {}),
        }),
      ),
    );
    yield* runControlPlaneTask(
      tokenLoginControlPlane({
        ...(input.url ? { url: input.url } : {}),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
        ...(token === undefined ? {} : { token }),
      }),
    );
  });
}

const authLoginCommand = EffectCommand.make(
  "login",
  {
    url: urlOption,
    mode: modeOption,
    noBrowser: noBrowserOption,
    profile: profileOption,
  },
  ({ mode, noBrowser, profile, url }) =>
    loginTask(
      loginInput(optionalValue(url), optionalValue(mode), noBrowser, optionalValue(profile)),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneLogin));

const authTokenLoginCommand = EffectCommand.make(
  "login",
  {
    url: urlOption,
    mode: modeOption,
    profile: profileOption,
    stdin: stdinOption,
    tokenFile: tokenFileOption,
  },
  ({ mode, profile, stdin, tokenFile, url }) => {
    const resolvedUrl = optionalValue(url);
    const resolvedMode = optionalValue(mode);
    const resolvedProfile = optionalValue(profile);
    const resolvedTokenFile = optionalValue(tokenFile);
    return tokenLoginTask({
      ...(resolvedUrl ? { url: resolvedUrl } : {}),
      ...(resolvedMode ? { mode: resolvedMode } : {}),
      ...(resolvedProfile ? { profile: resolvedProfile } : {}),
      stdin,
      ...(resolvedTokenFile ? { tokenFile: resolvedTokenFile } : {}),
    });
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneTokenLogin));

const authTokenCommand = EffectCommand.make("token").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.controlPlaneToken),
  EffectCommand.withSubcommands([authTokenLoginCommand]),
);

const authStatusCommand = EffectCommand.make(
  "status",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(controlPlaneStatus(optionalValue(profile))),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneStatus));

const authLogoutCommand = EffectCommand.make(
  "logout",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(logoutControlPlane(optionalValue(profile))),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneLogout));

export const authControlPlaneCommands = [
  authLoginCommand,
  authTokenCommand,
  authStatusCommand,
  authLogoutCommand,
] as const;

export const loginCommand = EffectCommand.make(
  "login",
  {
    url: urlOption,
    mode: modeOption,
    noBrowser: noBrowserOption,
    profile: profileOption,
  },
  ({ mode, noBrowser, profile, url }) =>
    loginTask(
      loginInput(optionalValue(url), optionalValue(mode), noBrowser, optionalValue(profile)),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneLogin));

export const logoutCommand = EffectCommand.make(
  "logout",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(logoutControlPlane(optionalValue(profile))),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneLogout));

const contextListCommand = EffectCommand.make("list", {}, () =>
  runControlPlaneTask(controlPlaneStatus()),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneContextList));

const contextShowCommand = EffectCommand.make(
  "show",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(controlPlaneStatus(optionalValue(profile))),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneContextShow));

const contextUseCommand = EffectCommand.make(
  "use",
  {
    profile: profileArg,
  },
  ({ profile }) => runControlPlaneTask(useControlPlaneProfile(profile)),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.controlPlaneContextUse));

export const contextCommand = EffectCommand.make("context").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.controlPlaneContext),
  EffectCommand.withSubcommands([contextListCommand, contextShowCommand, contextUseCommand]),
);
