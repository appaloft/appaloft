import {
  ConfirmDomainBindingOwnershipCommand,
  CreateDomainBindingCommand,
  ListDomainBindingsQuery,
} from "@appaloft/application";
import { certificatePolicies, edgeProxyKinds, tlsModes } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const projectIdOption = Options.text("project-id");
const environmentIdOption = Options.text("environment-id");
const resourceIdOption = Options.text("resource-id");
const serverIdOption = Options.text("server-id");
const destinationIdOption = Options.text("destination-id");
const domainNameArg = Args.text({ name: "domainName" });
const domainBindingIdArg = Args.text({ name: "domainBindingId" });
const pathPrefixOption = Options.text("path-prefix").pipe(Options.withDefault("/"));
const proxyKindOption = Options.choice("proxy-kind", edgeProxyKinds);
const tlsModeOption = Options.choice("tls-mode", tlsModes).pipe(Options.withDefault("auto"));
const redirectToOption = Options.text("redirect-to").pipe(Options.optional);
const redirectStatusOption = Options.choice("redirect-status", [
  "301",
  "302",
  "307",
  "308",
] as const).pipe(Options.optional);
const certificatePolicyOption = Options.choice("certificate-policy", certificatePolicies).pipe(
  Options.optional,
);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);
const verificationAttemptIdOption = Options.text("verification-attempt-id").pipe(Options.optional);
const verificationModeOption = Options.choice("verification-mode", ["dns", "manual"] as const).pipe(
  Options.optional,
);
const confirmedByOption = Options.text("confirmed-by").pipe(Options.optional);
const evidenceOption = Options.text("evidence").pipe(Options.optional);
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
    redirectTo: redirectToOption,
    redirectStatus: redirectStatusOption,
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
    redirectStatus,
    redirectTo,
    resourceId,
    serverId,
    tlsMode,
  }) => {
    const certificatePolicyValue = optionalValue(certificatePolicy);
    const idempotencyKeyValue = optionalValue(idempotencyKey);
    const redirectToValue = optionalValue(redirectTo);
    const redirectStatusValue = optionalValue(redirectStatus);

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
        ...(redirectToValue ? { redirectTo: redirectToValue } : {}),
        ...(redirectStatusValue
          ? { redirectStatus: Number(redirectStatusValue) as 301 | 302 | 307 | 308 }
          : {}),
        ...(certificatePolicyValue ? { certificatePolicy: certificatePolicyValue } : {}),
        ...(idempotencyKeyValue ? { idempotencyKey: idempotencyKeyValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.domainBindingCreate));

const confirmOwnershipCommand = EffectCommand.make(
  "confirm-ownership",
  {
    domainBindingId: domainBindingIdArg,
    verificationAttemptId: verificationAttemptIdOption,
    verificationMode: verificationModeOption,
    confirmedBy: confirmedByOption,
    evidence: evidenceOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({
    confirmedBy,
    domainBindingId,
    evidence,
    idempotencyKey,
    verificationAttemptId,
    verificationMode,
  }) =>
    runCommand(
      ConfirmDomainBindingOwnershipCommand.create({
        domainBindingId,
        verificationAttemptId: optionalValue(verificationAttemptId),
        verificationMode: optionalValue(verificationMode),
        confirmedBy: optionalValue(confirmedBy),
        evidence: optionalValue(evidence),
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.domainBindingConfirmOwnership));

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
).pipe(EffectCommand.withDescription(cliCommandDescriptions.domainBindingList));

export const domainBindingCommand = EffectCommand.make("domain-binding").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.domainBinding),
  EffectCommand.withSubcommands([createCommand, confirmOwnershipCommand, listCommand]),
);
