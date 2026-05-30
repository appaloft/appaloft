import { type Result } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { type CliControlPlaneMode } from "../control-plane-profile.js";
import {
  controlPlaneStatus,
  loginControlPlane,
  logoutControlPlane,
  useControlPlaneProfile,
} from "../control-plane-service.js";
import { optionalValue, print, resultToEffect } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const controlPlaneModes = ["cloud", "self-hosted"] as const;

const urlOption = Options.text("url").pipe(Options.optional);
const profileOption = Options.text("profile").pipe(Options.optional);
const modeOption = Options.choice("mode", controlPlaneModes).pipe(Options.optional);
const noBrowserOption = Options.boolean("no-browser").pipe(Options.withDefault(false));
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
