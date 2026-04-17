import { IssueOrRenewCertificateCommand, ListCertificatesQuery } from "@appaloft/application";
import { certificateIssueReasons } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const domainBindingIdArg = Args.text({ name: "domainBindingId" });
const reasonOption = Options.choice("reason", certificateIssueReasons).pipe(
  Options.withDefault("issue"),
);
const certificateIdOption = Options.text("certificate-id").pipe(Options.optional);
const providerKeyOption = Options.text("provider").pipe(Options.optional);
const challengeTypeOption = Options.text("challenge").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const domainBindingFilterOption = Options.text("domain-binding").pipe(Options.optional);

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
).pipe(EffectCommand.withDescription("Request certificate issuance or renewal"));

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
).pipe(EffectCommand.withDescription("List certificate lifecycle state"));

export const certificateCommand = EffectCommand.make("certificate").pipe(
  EffectCommand.withDescription("Certificate operations"),
  EffectCommand.withSubcommands([issueOrRenewCommand, listCommand]),
);
