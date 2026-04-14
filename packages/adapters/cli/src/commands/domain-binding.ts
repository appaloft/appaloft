import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { CreateDomainBindingCommand, ListDomainBindingsQuery } from "@yundu/application";
import { certificatePolicies, edgeProxyKinds, tlsModes } from "@yundu/core";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const projectIdOption = Options.text("project-id");
const environmentIdOption = Options.text("environment-id");
const resourceIdOption = Options.text("resource-id");
const serverIdOption = Options.text("server-id");
const destinationIdOption = Options.text("destination-id");
const domainNameArg = Args.text({ name: "domainName" });
const pathPrefixOption = Options.text("path-prefix").pipe(Options.withDefault("/"));
const proxyKindOption = Options.choice("proxy-kind", edgeProxyKinds);
const tlsModeOption = Options.choice("tls-mode", tlsModes).pipe(Options.withDefault("auto"));
const certificatePolicyOption = Options.choice("certificate-policy", certificatePolicies).pipe(
  Options.optional,
);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const listProjectIdOption = Options.text("project").pipe(Options.optional);
const listEnvironmentIdOption = Options.text("environment").pipe(Options.optional);
const listResourceIdOption = Options.text("resource").pipe(Options.optional);

const createCommand = EffectCommand.make(
  "create",
  {
    projectId: projectIdOption,
    environmentId: environmentIdOption,
    resourceId: resourceIdOption,
    serverId: serverIdOption,
    destinationId: destinationIdOption,
    domainName: domainNameArg,
    pathPrefix: pathPrefixOption,
    proxyKind: proxyKindOption,
    tlsMode: tlsModeOption,
    certificatePolicy: certificatePolicyOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    certificatePolicy,
    destinationId,
    domainName,
    environmentId,
    idempotencyKey,
    pathPrefix,
    projectId,
    proxyKind,
    resourceId,
    serverId,
    tlsMode,
  }) => {
    const certificatePolicyValue = optionalValue(certificatePolicy);
    const idempotencyKeyValue = optionalValue(idempotencyKey);

    return runCommand(
      CreateDomainBindingCommand.create({
        projectId,
        environmentId,
        resourceId,
        serverId,
        destinationId,
        domainName,
        pathPrefix,
        proxyKind,
        tlsMode,
        ...(certificatePolicyValue ? { certificatePolicy: certificatePolicyValue } : {}),
        ...(idempotencyKeyValue ? { idempotencyKey: idempotencyKeyValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription("Create a durable domain binding"));

const listCommand = EffectCommand.make(
  "list",
  {
    project: listProjectIdOption,
    environment: listEnvironmentIdOption,
    resource: listResourceIdOption,
  },
  ({ environment, project, resource }) =>
    runQuery(
      ListDomainBindingsQuery.create({
        projectId: optionalValue(project),
        environmentId: optionalValue(environment),
        resourceId: optionalValue(resource),
      }),
    ),
).pipe(EffectCommand.withDescription("List domain bindings"));

export const domainBindingCommand = EffectCommand.make("domain-binding").pipe(
  EffectCommand.withDescription("Domain binding operations"),
  EffectCommand.withSubcommands([createCommand, listCommand]),
);
