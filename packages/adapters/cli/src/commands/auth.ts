import { BootstrapFirstAdminCommand, GetAuthBootstrapStatusQuery } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const emailOption = Options.text("email");
const displayNameOption = Options.text("display-name");
const passwordOption = Options.text("password").pipe(Options.optional);
const organizationNameOption = Options.text("organization-name").pipe(Options.optional);
const organizationSlugOption = Options.text("organization-slug").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);

const bootstrapStatusCommand = EffectCommand.make("bootstrap-status", {}, () =>
  runQuery(GetAuthBootstrapStatusQuery.create({})),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.authBootstrapStatus));

const bootstrapFirstAdminCommand = EffectCommand.make(
  "bootstrap-first-admin",
  {
    email: emailOption,
    displayName: displayNameOption,
    password: passwordOption,
    organizationName: organizationNameOption,
    organizationSlug: organizationSlugOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ displayName, email, idempotencyKey, organizationName, organizationSlug, password }) =>
    runCommand(
      BootstrapFirstAdminCommand.create({
        email,
        displayName,
        password: optionalValue(password),
        organizationName: optionalValue(organizationName),
        organizationSlug: optionalValue(organizationSlug),
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.authBootstrapFirstAdmin));

export const authCommand = EffectCommand.make("auth").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.auth),
  EffectCommand.withSubcommands([bootstrapStatusCommand, bootstrapFirstAdminCommand]),
);
