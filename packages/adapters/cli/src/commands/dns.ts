import { PlanConnectorCapabilityQuery } from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runQuery } from "../runtime.js";

const providerOption = Options.choice("provider", ["cloudflare"]).pipe(
  Options.withDefault("cloudflare"),
);
const hostnameOption = Options.text("hostname").pipe(Options.optional);
const targetOption = Options.text("target");
const recordTypeOption = Options.choice("type", ["A", "AAAA", "CNAME", "TXT"]).pipe(
  Options.withDefault("CNAME"),
);
const purposeOption = Options.choice("purpose", [
  "domain-routing",
  "domain-verification",
  "certificate-validation",
  "manual",
]).pipe(Options.withDefault("domain-routing"));
const ttlOption = Options.integer("ttl").pipe(Options.optional);
const domainArg = Args.text({ name: "domain" });

const planCommand = EffectCommand.make(
  "plan",
  {
    domain: domainArg,
    provider: providerOption,
    hostname: hostnameOption,
    target: targetOption,
    type: recordTypeOption,
    purpose: purposeOption,
    ttl: ttlOption,
  },
  ({ domain, provider, hostname, target, type, purpose, ttl }) => {
    const ttlValue = optionalValue(ttl);
    return runQuery(
      PlanConnectorCapabilityQuery.create({
        connectorKey: `${provider}-dns`,
        capabilityKey: "dns.records.plan",
        parameters: {
          zoneName: domain,
          hostname: optionalValue(hostname) ?? domain,
          target,
          recordType: type,
          purpose,
          ...(ttlValue !== undefined ? { ttl: ttlValue } : {}),
        },
      }),
    );
  },
).pipe(EffectCommand.withDescription("Plan DNS records through a connector"));

export const dnsCommand = EffectCommand.make("dns").pipe(
  EffectCommand.withDescription("DNS connector operations"),
  EffectCommand.withSubcommands([planCommand]),
);
