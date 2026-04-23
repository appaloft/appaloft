import {
  ImportCertificateCommand,
  IssueOrRenewCertificateCommand,
  ListCertificatesQuery,
} from "@appaloft/application";
import { certificateIssueReasons } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const domainBindingIdArg = Args.text({ name: "domainBindingId" });
const reasonOption = Options.choice("reason", certificateIssueReasons).pipe(
  Options.withDefault("issue"),
);
const certificateIdOption = Options.text("certificate-id").pipe(Options.optional);
const providerKeyOption = Options.text("provider").pipe(Options.optional);
const challengeTypeOption = Options.text("challenge").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const domainBindingFilterOption = Options.text("domain-binding").pipe(Options.optional);
const certificateChainFileOption = Options.text("chain-file");
const privateKeyFileOption = Options.text("key-file");
const passphraseFileOption = Options.text("passphrase-file").pipe(Options.optional);

const issueOrRenewCommand = EffectCommand.make(
  "issue-or-renew",
  {
    domainBindingId: domainBindingIdArg,
    reason: reasonOption,
    certificateId: certificateIdOption,
    providerKey: providerKeyOption,
    challengeType: challengeTypeOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ certificateId, challengeType, domainBindingId, idempotencyKey, providerKey, reason }) =>
    runCommand(
      IssueOrRenewCertificateCommand.create({
        domainBindingId,
        reason,
        certificateId: optionalValue(certificateId),
        providerKey: optionalValue(providerKey),
        challengeType: optionalValue(challengeType),
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.certificateIssueOrRenew));

const importCommand = EffectCommand.make(
  "import",
  {
    domainBindingId: domainBindingIdArg,
    certificateChainFile: certificateChainFileOption,
    privateKeyFile: privateKeyFileOption,
    passphraseFile: passphraseFileOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ certificateChainFile, domainBindingId, idempotencyKey, passphraseFile, privateKeyFile }) =>
    Effect.gen(function* () {
      const certificateChain = yield* Effect.promise(() => Bun.file(certificateChainFile).text());
      const privateKey = yield* Effect.promise(() => Bun.file(privateKeyFile).text());
      const passphrasePath = optionalValue(passphraseFile);
      const passphrase = passphrasePath
        ? yield* Effect.promise(() => Bun.file(passphrasePath).text())
        : undefined;

      yield* runCommand(
        ImportCertificateCommand.create({
          domainBindingId,
          certificateChain,
          privateKey,
          ...(passphrase ? { passphrase } : {}),
          ...(optionalValue(idempotencyKey)
            ? { idempotencyKey: optionalValue(idempotencyKey) }
            : {}),
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.certificateImport));

const listCommand = EffectCommand.make(
  "list",
  {
    domainBindingId: domainBindingFilterOption,
  },
  ({ domainBindingId }) =>
    runQuery(
      ListCertificatesQuery.create({
        domainBindingId: optionalValue(domainBindingId),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.certificateList));

export const certificateCommand = EffectCommand.make("certificate").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.certificate),
  EffectCommand.withSubcommands([importCommand, issueOrRenewCommand, listCommand]),
);
