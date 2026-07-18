import {
  AcceptConnectorCapabilityPlanCommand,
  ApplyConnectorCapabilityCommand,
  CompleteConnectionCallbackCommand,
  ListConnectionsQuery,
  ListConnectorCategoriesQuery,
  ListConnectorsQuery,
  type ListConnectorsQueryInput,
  PlanConnectorCapabilityQuery,
  RevokeConnectionCommand,
  ShowConnectionQuery,
  StartConnectionCommand,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand, runQuery } from "../runtime.js";

const categoryOption = Options.choice("category", [
  "source",
  "dns",
  "infrastructure",
  "notification",
  "billing",
  "identity",
  "observability",
  "storage",
]).pipe(Options.optional);
const includeUnavailableOption = Options.boolean("include-unavailable").pipe(
  Options.withDefault(false),
);
const connectorOption = Options.text("connector");
const capabilityOption = Options.text("capability");
const planIdOption = Options.text("plan-id");
const riskLevelOption = Options.choice("risk", ["low", "medium", "high"]);
const summaryOption = Options.text("summary");
const effectsJsonOption = Options.text("effects-json");
const acceptedByOption = Options.text("accepted-by").pipe(Options.optional);
const cleanupSupportedOption = Options.boolean("cleanup-supported").pipe(Options.optional);
const cleanupDescriptionOption = Options.text("cleanup-description").pipe(Options.optional);
const parametersJsonOption = Options.text("parameters-json").pipe(Options.optional);
const acceptedPlanIdOption = Options.text("accepted-plan-id").pipe(Options.optional);
const connectorArg = Args.text({ name: "connector" });
const connectionIdArg = Args.text({ name: "connectionId" });
const ownerScopeOption = Options.choice("owner-scope", [
  "account",
  "organization",
  "project",
  "environment",
  "resource",
  "operator",
]).pipe(Options.optional);
const ownerIdOption = Options.text("owner-id").pipe(Options.optional);
const displayNameOption = Options.text("display-name").pipe(Options.optional);
const secretRefOption = Options.text("secret-ref").pipe(Options.optional);
const externalAccountIdOption = Options.text("external-account-id").pipe(Options.optional);
const externalInstallationIdOption = Options.text("external-installation-id").pipe(
  Options.optional,
);
const returnUrlOption = Options.text("return-url").pipe(Options.optional);
const requestedCapabilityOption = Options.text("requested-capability").pipe(Options.optional);
const domainOption = Options.text("domain").pipe(Options.optional);
const originalHostnameOption = Options.text("original-hostname").pipe(Options.optional);

const catalogCommand = EffectCommand.make(
  "catalog",
  {
    category: categoryOption,
    includeUnavailable: includeUnavailableOption,
  },
  ({ category, includeUnavailable }) =>
    runQuery(
      ListConnectorsQuery.create({
        ...(optionalValue(category)
          ? { category: optionalValue(category) as ListConnectorsQueryInput["category"] }
          : {}),
        ...(includeUnavailable ? { includeUnavailable: true } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription("List connector catalog entries"));

const listCommand = EffectCommand.make(
  "list",
  {
    category: categoryOption,
    connector: connectorOption.pipe(Options.optional),
    ownerScope: ownerScopeOption,
    ownerId: ownerIdOption,
  },
  ({ category, connector, ownerScope, ownerId }) =>
    runQuery(
      ListConnectionsQuery.create({
        category: optionalValue(category) as ListConnectorsQueryInput["category"],
        connectorKey: optionalValue(connector),
        owner: ownerRef(optionalValue(ownerScope), optionalValue(ownerId)),
      }),
    ),
).pipe(EffectCommand.withDescription("List connection instances"));

const showCommand = EffectCommand.make(
  "show",
  {
    connectionId: connectionIdArg,
  },
  ({ connectionId }) => runQuery(ShowConnectionQuery.create({ connectionId })),
).pipe(EffectCommand.withDescription("Show a connection instance"));

const statusCommand = EffectCommand.make(
  "status",
  {
    connectionId: connectionIdArg,
  },
  ({ connectionId }) => runQuery(ShowConnectionQuery.create({ connectionId })),
).pipe(EffectCommand.withDescription("Show a connection status"));

const categoriesCommand = EffectCommand.make("categories", {}, () =>
  runQuery(ListConnectorCategoriesQuery.create()),
).pipe(EffectCommand.withDescription("List connector categories"));

const planCommand = EffectCommand.make(
  "plan",
  {
    connector: connectorOption,
    capability: capabilityOption,
    parametersJson: parametersJsonOption,
  },
  ({ connector, capability, parametersJson }) =>
    runQuery(
      parseParametersJson(optionalValue(parametersJson)).andThen((parameters) =>
        PlanConnectorCapabilityQuery.create({
          connectorKey: connector,
          capabilityKey: capability,
          ...(parameters ? { parameters } : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription("Plan a connector capability without applying changes"));

const acceptCommand = EffectCommand.make(
  "accept",
  {
    connector: connectorOption,
    capability: capabilityOption,
    planId: planIdOption,
    risk: riskLevelOption,
    summary: summaryOption,
    effectsJson: effectsJsonOption,
    acceptedBy: acceptedByOption,
    cleanupSupported: cleanupSupportedOption,
    cleanupDescription: cleanupDescriptionOption,
    ownerScope: ownerScopeOption,
    ownerId: ownerIdOption,
  },
  ({
    connector,
    capability,
    planId,
    risk,
    summary,
    effectsJson,
    acceptedBy,
    cleanupSupported,
    cleanupDescription,
    ownerScope,
    ownerId,
  }) =>
    runCommand(
      parseEffectsJson(effectsJson).andThen((effects) =>
        AcceptConnectorCapabilityPlanCommand.create({
          connectorKey: connector,
          capabilityKey: capability,
          planId,
          riskLevel: risk,
          summary,
          effects,
          acceptedBy: optionalValue(acceptedBy),
          ownerRef: ownerRef(optionalValue(ownerScope), optionalValue(ownerId)),
          ...(optionalValue(cleanupSupported) !== undefined ||
          optionalValue(cleanupDescription) !== undefined
            ? {
                cleanup: {
                  supported: optionalValue(cleanupSupported) ?? false,
                  description: optionalValue(cleanupDescription),
                },
              }
            : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription("Accept a planned connector capability mutation"));

const applyCommand = EffectCommand.make(
  "apply",
  {
    connector: connectorOption,
    capability: capabilityOption,
    parametersJson: parametersJsonOption,
    acceptedPlanId: acceptedPlanIdOption,
    ownerScope: ownerScopeOption,
    ownerId: ownerIdOption,
  },
  ({ connector, capability, parametersJson, acceptedPlanId, ownerScope, ownerId }) =>
    runCommand(
      parseParametersJson(optionalValue(parametersJson)).andThen((parameters) =>
        ApplyConnectorCapabilityCommand.create({
          connectorKey: connector,
          capabilityKey: capability,
          ownerRef: ownerRef(optionalValue(ownerScope), optionalValue(ownerId)),
          acceptedPlanId: optionalValue(acceptedPlanId),
          ...(parameters ? { parameters } : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription("Apply, verify, or clean up a connector capability"));

const connectCommand = EffectCommand.make(
  "connect",
  {
    connector: connectorArg,
    ownerScope: ownerScopeOption,
    ownerId: ownerIdOption,
    displayName: displayNameOption,
    secretRef: secretRefOption,
    externalAccountId: externalAccountIdOption,
    externalInstallationId: externalInstallationIdOption,
    returnUrl: returnUrlOption,
    requestedCapability: requestedCapabilityOption,
    domain: domainOption,
    originalHostname: originalHostnameOption,
  },
  ({
    connector,
    ownerScope,
    ownerId,
    displayName,
    secretRef,
    externalAccountId,
    externalInstallationId,
    returnUrl,
    requestedCapability,
    domain,
    originalHostname,
  }) =>
    runCommand(
      StartConnectionCommand.create({
        connectorKey: connector,
        owner: ownerRef(optionalValue(ownerScope), optionalValue(ownerId)),
        displayName: optionalValue(displayName),
        returnUrl: optionalValue(returnUrl),
        requestedCapabilityKey: optionalValue(requestedCapability),
        originalHostname: optionalValue(originalHostname) ?? optionalValue(domain),
        credentialGrant: optionalValue(secretRef)
          ? {
              kind: "manual-secret-reference",
              storage: "secret-ref",
              secretRef: optionalValue(secretRef),
              externalAccountId: optionalValue(externalAccountId),
              externalInstallationId: optionalValue(externalInstallationId),
            }
          : undefined,
      }),
    ),
).pipe(EffectCommand.withDescription("Start or register a connection instance"));

const callbackCommand = EffectCommand.make(
  "callback",
  {
    connectionId: connectionIdArg,
    externalAccountId: externalAccountIdOption,
    externalInstallationId: externalInstallationIdOption,
  },
  ({ connectionId, externalAccountId, externalInstallationId }) =>
    runCommand(
      CompleteConnectionCallbackCommand.create({
        connectionId,
        status: "success",
        externalAccountId: optionalValue(externalAccountId),
        externalInstallationId: optionalValue(externalInstallationId),
      }),
    ),
).pipe(EffectCommand.withDescription("Complete a provider connection callback"));

const revokeCommand = EffectCommand.make(
  "revoke",
  {
    connectionId: connectionIdArg,
  },
  ({ connectionId }) => runCommand(RevokeConnectionCommand.create({ connectionId })),
).pipe(EffectCommand.withDescription("Revoke a connection instance"));

export const connectorsCommand = EffectCommand.make("connectors").pipe(
  EffectCommand.withDescription("Connector catalog operations"),
  EffectCommand.withSubcommands([
    catalogCommand,
    listCommand,
    categoriesCommand,
    showCommand,
    statusCommand,
    connectCommand,
    callbackCommand,
    revokeCommand,
    planCommand,
    acceptCommand,
    applyCommand,
  ]),
);

function parseParametersJson(
  value: string | undefined,
): Result<Record<string, unknown> | undefined> {
  if (!value) {
    return ok(undefined);
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return err(domainError.validation("Connector parameters JSON must be an object"));
    }
    return ok(parsed as Record<string, unknown>);
  } catch {
    return err(domainError.validation("Connector parameters JSON is invalid"));
  }
}

function parseEffectsJson(
  value: string,
): Result<{ kind: string; title: string; description?: string }[]> {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return err(domainError.validation("Connector effects JSON must be an array"));
    }
    const effects: { kind: string; title: string; description?: string }[] = [];
    for (const [index, item] of parsed.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return err(domainError.validation(`Connector effect ${index + 1} JSON must be an object`));
      }
      const record = item as Record<string, unknown>;
      if (typeof record.kind !== "string" || typeof record.title !== "string") {
        return err(
          domainError.validation(
            `Connector effect ${index + 1} JSON must include kind and title strings`,
          ),
        );
      }
      effects.push({
        kind: record.kind,
        title: record.title,
        ...(typeof record.description === "string" ? { description: record.description } : {}),
      });
    }
    return ok(effects);
  } catch {
    return err(domainError.validation("Connector effects JSON is invalid"));
  }
}

function ownerRef(
  scope: string | undefined,
  id: string | undefined,
):
  | {
      scope: "account" | "organization" | "project" | "environment" | "resource" | "operator";
      id: string;
    }
  | undefined {
  if (!scope && !id) {
    return undefined;
  }
  return {
    scope: (scope ?? "operator") as
      | "account"
      | "organization"
      | "project"
      | "environment"
      | "resource"
      | "operator",
    id: id ?? "local",
  };
}
