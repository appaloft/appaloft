import { readFile, writeFile } from "node:fs/promises";
import {
  ControlPlanePortabilityExportPlanQuery,
  ControlPlanePortabilityImportPlanQuery,
  DeleteControlPlanePortabilityArtifactCommand,
  ExportControlPlaneCommand,
  ImportControlPlaneCommand,
  ListControlPlanePortabilityArtifactsQuery,
  ShowControlPlanePortabilityArtifactQuery,
} from "@appaloft/application";
import { domainError } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import {
  CliRuntime,
  print,
  readProcessStdinText,
  resultToEffect,
  runCommand,
  runQuery,
} from "../runtime.js";

const passphraseStdinOption = Options.boolean("passphrase-stdin").pipe(Options.withDefault(false));
const modeOption = Options.choice("mode", ["merge", "replace"]).pipe(Options.withDefault("merge"));
const acknowledgeReplaceOption = Options.boolean("acknowledge-replace").pipe(
  Options.withDefault(false),
);
const forceOption = Options.boolean("force").pipe(Options.withDefault(false));
const outputOption = Options.text("output");
const artifactFileArg = Args.text({ name: "artifactFile" });
const artifactIdArg = Args.text({ name: "artifactId" });

const readPassphrase = (enabled: boolean) =>
  Effect.gen(function* () {
    if (!enabled) {
      return yield* Effect.fail(
        domainError.validation(
          "Use --passphrase-stdin so the passphrase is not exposed in shell history",
        ),
      );
    }
    const cli = yield* CliRuntime;
    const raw = yield* Effect.tryPromise({
      try: () => (cli.readStdinText ?? readProcessStdinText)(),
      catch: () =>
        domainError.infra("Control-plane portability passphrase could not be read", {
          phase: "control-plane-portability-cli-stdin",
        }),
    });
    return raw.replace(/\r?\n$/u, "");
  });

const readArtifact = (path: string) =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: () =>
      domainError.validation("Control-plane portability artifact file could not be read", {
        phase: "control-plane-portability-cli-artifact-read",
        path,
      }),
  });

const exportPlanCommand = EffectCommand.make("export-plan", {}, () =>
  runQuery(ControlPlanePortabilityExportPlanQuery.create({})),
).pipe(EffectCommand.withDescription("Plan a whole-instance encrypted control-plane export"));

const exportCommand = EffectCommand.make(
  "export",
  { output: outputOption, passphraseStdin: passphraseStdinOption, force: forceOption },
  ({ force, output, passphraseStdin }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const passphrase = yield* readPassphrase(passphraseStdin);
      const command = yield* resultToEffect(ExportControlPlaneCommand.create({ passphrase }));
      const result = yield* Effect.promise(() => cli.executeCommand(command));
      const exported = yield* resultToEffect(result);
      yield* Effect.tryPromise({
        try: () =>
          writeFile(output, exported.encryptedEnvelope, {
            encoding: "utf8",
            mode: 0o600,
            flag: force ? "w" : "wx",
          }),
        catch: () =>
          domainError.conflict("Control-plane portability output file could not be created", {
            phase: "control-plane-portability-cli-artifact-write",
            path: output,
            hint: force ? "check-path-permissions" : "use-force-to-replace",
          }),
      });
      yield* print({ schemaVersion: exported.schemaVersion, artifact: exported.artifact, output });
    }),
).pipe(
  EffectCommand.withDescription("Export the whole control plane to an encrypted artifact file"),
);

const importPlanCommand = EffectCommand.make(
  "import-plan",
  { artifactFile: artifactFileArg, mode: modeOption, passphraseStdin: passphraseStdinOption },
  ({ artifactFile, mode, passphraseStdin }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const passphrase = yield* readPassphrase(passphraseStdin);
      const encryptedEnvelope = yield* readArtifact(artifactFile);
      const query = yield* resultToEffect(
        ControlPlanePortabilityImportPlanQuery.create({ encryptedEnvelope, passphrase, mode }),
      );
      const result = yield* Effect.promise(() => cli.executeQuery(query));
      yield* print(yield* resultToEffect(result));
    }),
).pipe(EffectCommand.withDescription("Validate and plan a whole-instance import without mutation"));

const importCommand = EffectCommand.make(
  "import",
  {
    artifactFile: artifactFileArg,
    mode: modeOption,
    passphraseStdin: passphraseStdinOption,
    acknowledgeReplace: acknowledgeReplaceOption,
  },
  ({ acknowledgeReplace, artifactFile, mode, passphraseStdin }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const passphrase = yield* readPassphrase(passphraseStdin);
      const encryptedEnvelope = yield* readArtifact(artifactFile);
      const command = yield* resultToEffect(
        ImportControlPlaneCommand.create({
          encryptedEnvelope,
          passphrase,
          mode,
          acknowledgeReplace,
        }),
      );
      const result = yield* Effect.promise(() => cli.executeCommand(command));
      yield* print(yield* resultToEffect(result));
    }),
).pipe(EffectCommand.withDescription("Import a whole-instance encrypted control-plane artifact"));

const artifactListCommand = EffectCommand.make("list", {}, () =>
  runQuery(ListControlPlanePortabilityArtifactsQuery.create({})),
).pipe(EffectCommand.withDescription("List control-plane portability artifact metadata"));

const artifactShowCommand = EffectCommand.make(
  "show",
  { artifactId: artifactIdArg },
  ({ artifactId }) => runQuery(ShowControlPlanePortabilityArtifactQuery.create({ artifactId })),
).pipe(EffectCommand.withDescription("Show one control-plane portability artifact"));

const artifactDeleteCommand = EffectCommand.make(
  "delete",
  { artifactId: artifactIdArg },
  ({ artifactId }) =>
    runCommand(DeleteControlPlanePortabilityArtifactCommand.create({ artifactId })),
).pipe(EffectCommand.withDescription("Delete one exact control-plane portability artifact"));

const artifactCommand = EffectCommand.make("artifact").pipe(
  EffectCommand.withDescription("Manage encrypted control-plane portability artifacts"),
  EffectCommand.withSubcommands([artifactListCommand, artifactShowCommand, artifactDeleteCommand]),
);

const portabilityCommand = EffectCommand.make("portability").pipe(
  EffectCommand.withDescription("Whole-instance encrypted export and import"),
  EffectCommand.withSubcommands([
    exportPlanCommand,
    exportCommand,
    importPlanCommand,
    importCommand,
    artifactCommand,
  ]),
);

export const instanceCommand = EffectCommand.make("instance").pipe(
  EffectCommand.withDescription("Manage this Appaloft control-plane instance"),
  EffectCommand.withSubcommands([portabilityCommand]),
);
