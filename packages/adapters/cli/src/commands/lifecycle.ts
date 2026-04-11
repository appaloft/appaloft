import { Command as EffectCommand } from "@effect/cli";
import { DoctorQuery } from "@yundu/application";
import { Effect } from "effect";
import { CliRuntime, print, runQuery } from "../runtime.js";

export const versionCommand = EffectCommand.make("version", {}, () =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;

    yield* print({
      name: "Yundu",
      version: cli.version,
    });
  }),
).pipe(EffectCommand.withDescription("Show CLI and API version metadata"));

export const serveCommand = EffectCommand.make("serve", {}, () =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;

    yield* Effect.promise(() => cli.startServer());
    yield* Effect.never;
  }),
).pipe(EffectCommand.withDescription("Start the Yundu backend service"));

export const initCommand = EffectCommand.make("init", {}, () =>
  print({
    name: "Yundu",
    guide: [
      "Use yundu deploy . for the smallest local self-hosted flow",
      "Use yundu serve to run the API",
      "Use yundu db migrate for external PostgreSQL or explicit schema control",
    ],
  }),
).pipe(EffectCommand.withDescription("Print local bootstrap guidance"));

export const doctorCommand = EffectCommand.make("doctor", {}, () =>
  runQuery(DoctorQuery.create()),
).pipe(EffectCommand.withDescription("Run readiness diagnostics"));
