import { ConfigureDefaultAccessDomainPolicyCommand } from "@appaloft/application";
import { Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const policyScopes = ["system", "deployment-target"] as const;
const policyModes = ["disabled", "provider", "custom-template"] as const;

const scopeOption = Options.choice("scope", policyScopes).pipe(Options.withDefault("system"));
const serverOption = Options.text("server").pipe(Options.optional);
const modeOption = Options.choice("mode", policyModes).pipe(Options.withDefault("provider"));
const providerOption = Options.text("provider").pipe(Options.optional);
const templateRefOption = Options.text("template-ref").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);

const configureCommand = EffectCommand.make(
  "configure",
  {
    scope: scopeOption,
    server: serverOption,
    mode: modeOption,
    provider: providerOption,
    templateRef: templateRefOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, mode, provider, scope, server, templateRef }) =>
    runCommand(
      ConfigureDefaultAccessDomainPolicyCommand.create({
        scope:
          scope === "deployment-target"
            ? {
                kind: "deployment-target",
                serverId: optionalValue(server) ?? "",
              }
            : {
                kind: "system",
              },
        mode,
        ...(optionalValue(provider) ? { providerKey: optionalValue(provider) } : {}),
        ...(optionalValue(templateRef) ? { templateRef: optionalValue(templateRef) } : {}),
        ...(optionalValue(idempotencyKey) ? { idempotencyKey: optionalValue(idempotencyKey) } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.defaultAccessConfigure));

export const defaultAccessCommand = EffectCommand.make("default-access").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.defaultAccess),
  EffectCommand.withSubcommands([configureCommand]),
);
