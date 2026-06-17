import { PlanConnectorCapabilityQuery } from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";

const providerOption = Options.choice("provider", ["vultr"]).pipe(Options.withDefault("vultr"));
const regionOption = Options.text("region").pipe(Options.withDefault("ewr"));
const sizeOption = Options.text("size").pipe(Options.withDefault("vc2-1c-1gb"));
const imageOption = Options.text("image").pipe(Options.withDefault("ubuntu-24.04"));
const serverNameOption = Options.text("server-name").pipe(Options.optional);
const osUserOption = Options.text("os-user").pipe(Options.withDefault("root"));
const sshPortOption = Options.integer("ssh-port").pipe(Options.withDefault(22));
const sshPublicKeyRefOption = Options.text("ssh-public-key-ref").pipe(Options.optional);
const estimatedMonthlyCostOption = Options.float("estimated-monthly-cost-usd").pipe(
  Options.optional,
);
const targetArg = Args.text({ name: "target" }).pipe(Args.withDefault("appaloft-edge-1"));

const proposeCommand = EffectCommand.make(
  "propose",
  {
    target: targetArg,
    provider: providerOption,
    region: regionOption,
    size: sizeOption,
    image: imageOption,
    serverName: serverNameOption,
    osUser: osUserOption,
    sshPort: sshPortOption,
    sshPublicKeyRef: sshPublicKeyRefOption,
    estimatedMonthlyCostUsd: estimatedMonthlyCostOption,
  },
  ({
    target,
    provider,
    region,
    size,
    image,
    serverName,
    osUser,
    sshPort,
    sshPublicKeyRef,
    estimatedMonthlyCostUsd,
  }) =>
    runQuery(
      PlanConnectorCapabilityQuery.create({
        connectorKey: `${provider}-infrastructure`,
        capabilityKey: "infrastructure.server.propose",
        parameters: {
          serverName: optionalValue(serverName) ?? target,
          region,
          size,
          image,
          osUser,
          sshPort,
          ...(optionalValue(sshPublicKeyRef)
            ? { sshPublicKeyRef: optionalValue(sshPublicKeyRef) }
            : {}),
          ...(optionalValue(estimatedMonthlyCostUsd) !== undefined
            ? { estimatedMonthlyCostUsd: optionalValue(estimatedMonthlyCostUsd) }
            : {}),
        },
      }),
    ),
).pipe(EffectCommand.withDescription("Propose an infrastructure connector server target"));

export const infrastructureCommand = EffectCommand.make("infrastructure").pipe(
  EffectCommand.withDescription("Shortcut commands for infrastructure connector capabilities"),
  EffectCommand.withSubcommands([proposeCommand]),
);
