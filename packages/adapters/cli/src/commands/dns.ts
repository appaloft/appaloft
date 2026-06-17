import {
  ApplyConnectorCapabilityCommand,
  PlanConnectorCapabilityQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

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

const connectCommand = EffectCommand.make(
  "connect",
  {
    domain: domainArg,
    provider: providerOption,
    hostname: hostnameOption,
    target: targetOption,
    type: recordTypeOption,
    purpose: purposeOption,
    ttl: ttlOption,
  },
  ({ domain, provider, hostname, target, type, purpose, ttl }) =>
    runQuery(
      PlanConnectorCapabilityQuery.create({
        connectorKey: `${provider}-dns`,
        capabilityKey: "dns.domain-connect.start",
        parameters: dnsParameters({
          domain,
          hostname: optionalValue(hostname),
          target,
          type,
          purpose,
          ttl: optionalValue(ttl),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription("Start temporary Domain Connect DNS setup"));

const applyCommand = EffectCommand.make(
  "apply",
  {
    domain: domainArg,
    provider: providerOption,
    hostname: hostnameOption,
    target: targetOption,
    type: recordTypeOption,
    purpose: purposeOption,
    ttl: ttlOption,
  },
  ({ domain, provider, hostname, target, type, purpose, ttl }) =>
    runCommand(
      ApplyConnectorCapabilityCommand.create({
        connectorKey: `${provider}-dns`,
        capabilityKey: "dns.records.apply",
        parameters: dnsParameters({
          domain,
          hostname: optionalValue(hostname),
          target,
          type,
          purpose,
          ttl: optionalValue(ttl),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription("Apply DNS records through a connector"));

const verifyCommand = EffectCommand.make(
  "verify",
  {
    domain: domainArg,
    provider: providerOption,
    hostname: hostnameOption,
    target: targetOption,
    type: recordTypeOption,
    purpose: purposeOption,
    ttl: ttlOption,
  },
  ({ domain, provider, hostname, target, type, purpose, ttl }) =>
    runCommand(
      ApplyConnectorCapabilityCommand.create({
        connectorKey: `${provider}-dns`,
        capabilityKey: "dns.records.verify",
        parameters: dnsParameters({
          domain,
          hostname: optionalValue(hostname),
          target,
          type,
          purpose,
          ttl: optionalValue(ttl),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription("Verify DNS records through a connector"));

const cleanupCommand = EffectCommand.make(
  "cleanup",
  {
    domain: domainArg,
    provider: providerOption,
    hostname: hostnameOption,
    target: targetOption,
    type: recordTypeOption,
    purpose: purposeOption,
    ttl: ttlOption,
  },
  ({ domain, provider, hostname, target, type, purpose, ttl }) =>
    runCommand(
      ApplyConnectorCapabilityCommand.create({
        connectorKey: `${provider}-dns`,
        capabilityKey: "dns.records.cleanup",
        parameters: dnsParameters({
          domain,
          hostname: optionalValue(hostname),
          target,
          type,
          purpose,
          ttl: optionalValue(ttl),
        }),
      }),
    ),
).pipe(EffectCommand.withDescription("Clean up Appaloft-managed DNS records through a connector"));

export const dnsCommand = EffectCommand.make("dns").pipe(
  EffectCommand.withDescription("Shortcut commands for connectors in the DNS category"),
  EffectCommand.withSubcommands([
    connectCommand,
    planCommand,
    applyCommand,
    verifyCommand,
    cleanupCommand,
  ]),
);

function dnsParameters(input: {
  domain: string;
  hostname: string | undefined;
  target: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  purpose: "domain-routing" | "domain-verification" | "certificate-validation" | "manual";
  ttl: number | undefined;
}): Record<string, unknown> {
  return {
    zoneName: input.domain,
    hostname: input.hostname ?? input.domain,
    target: input.target,
    recordType: input.type,
    purpose: input.purpose,
    ...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
  };
}
