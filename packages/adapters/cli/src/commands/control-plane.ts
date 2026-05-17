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

const controlPlaneModes = ["cloud", "self-hosted"] as const;

const urlOption = Options.text("url");
const profileOption = Options.text("profile").pipe(Options.optional);
const modeOption = Options.choice("mode", controlPlaneModes).pipe(Options.optional);
const profileArg = Args.text({ name: "profile" });

function runControlPlaneTask<T>(task: Promise<Result<T>>) {
  return Effect.gen(function* () {
    const result = yield* Effect.promise(() => task);
    const output = yield* resultToEffect(result);
    yield* print(output);
  });
}

function loginTask(input: {
  readonly url: string;
  readonly mode?: CliControlPlaneMode;
  readonly profile?: string;
}) {
  return runControlPlaneTask(loginControlPlane(input));
}

function loginInput(
  url: string,
  mode: CliControlPlaneMode | undefined,
  profile: string | undefined,
) {
  return {
    url,
    ...(mode ? { mode } : {}),
    ...(profile ? { profile } : {}),
  };
}

const authLoginCommand = EffectCommand.make(
  "login",
  {
    url: urlOption,
    mode: modeOption,
    profile: profileOption,
  },
  ({ mode, profile, url }) =>
    loginTask(loginInput(url, optionalValue(mode), optionalValue(profile))),
).pipe(EffectCommand.withDescription("Login to an Appaloft control plane"));

const authStatusCommand = EffectCommand.make(
  "status",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(controlPlaneStatus(optionalValue(profile))),
).pipe(EffectCommand.withDescription("Show local Appaloft control-plane profile status"));

const authLogoutCommand = EffectCommand.make(
  "logout",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(logoutControlPlane(optionalValue(profile))),
).pipe(EffectCommand.withDescription("Logout from an Appaloft control-plane profile"));

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
    profile: profileOption,
  },
  ({ mode, profile, url }) =>
    loginTask(loginInput(url, optionalValue(mode), optionalValue(profile))),
).pipe(EffectCommand.withDescription("Login to an Appaloft control plane"));

export const logoutCommand = EffectCommand.make(
  "logout",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(logoutControlPlane(optionalValue(profile))),
).pipe(EffectCommand.withDescription("Logout from an Appaloft control-plane profile"));

const contextListCommand = EffectCommand.make("list", {}, () =>
  runControlPlaneTask(controlPlaneStatus()),
).pipe(EffectCommand.withDescription("List local Appaloft control-plane profiles"));

const contextShowCommand = EffectCommand.make(
  "show",
  {
    profile: profileOption,
  },
  ({ profile }) => runControlPlaneTask(controlPlaneStatus(optionalValue(profile))),
).pipe(EffectCommand.withDescription("Show the active Appaloft control-plane profile"));

const contextUseCommand = EffectCommand.make(
  "use",
  {
    profile: profileArg,
  },
  ({ profile }) => runControlPlaneTask(useControlPlaneProfile(profile)),
).pipe(EffectCommand.withDescription("Select the active Appaloft control-plane profile"));

export const contextCommand = EffectCommand.make("context").pipe(
  EffectCommand.withDescription("Manage local Appaloft control-plane profiles"),
  EffectCommand.withSubcommands([contextListCommand, contextShowCommand, contextUseCommand]),
);
