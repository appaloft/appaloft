import {
  ArchiveEnvironmentCommand,
  CloneEnvironmentCommand,
  CreateEnvironmentCommand,
  DiffEnvironmentProfileQuery,
  DiffEnvironmentsQuery,
  DuplicateEnvironmentProfileCommand,
  type DuplicateEnvironmentProfileCommandInput,
  type EnvironmentDuplicateDependencyCandidate,
  type EnvironmentDuplicatePlanSummary,
  EnvironmentEffectivePrecedenceQuery,
  ListEnvironmentsQuery,
  LockEnvironmentCommand,
  PlanDuplicateEnvironmentQuery,
  PromoteEnvironmentCommand,
  RenameEnvironmentCommand,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  SyncEnvironmentProfileCommand,
  UnlockEnvironmentCommand,
  UnsetEnvironmentVariableCommand,
} from "@appaloft/application";
import {
  configScopes,
  domainError,
  environmentKinds,
  variableExposures,
  variableKinds,
} from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import {
  CliRuntime,
  optionalValue,
  print,
  resultToEffect,
  runCommand,
  runQuery,
} from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const environmentIdArg = Args.text({ name: "environmentId" });
const otherEnvironmentIdArg = Args.text({ name: "otherEnvironmentId" });
const keyArg = Args.text({ name: "key" });
const valueArg = Args.text({ name: "value" });
const targetNameArg = Args.text({ name: "targetName" });

const projectOption = Options.text("project").pipe(Options.optional);
const nameOption = Options.text("name");
const kindOption = Options.choice("kind", environmentKinds);
const parentOption = Options.text("parent").pipe(Options.optional);
const archiveReasonOption = Options.text("reason").pipe(Options.optional);
const cloneKindOption = Options.choice("kind", environmentKinds).pipe(Options.optional);
const dependencyDecisionsOption = Options.text("dependency-decisions").pipe(Options.optional);
const resourceDecisionsOption = Options.text("resource-decisions").pipe(Options.optional);
const copyDependenciesOption = Options.choice("dependencies", ["create-new", "defer"]).pipe(
  Options.withDefault("create-new" as const),
);
const copySecretsOption = Options.choice("secrets", ["regenerate", "configure-later"]).pipe(
  Options.withDefault("regenerate" as const),
);
const copyDataOption = Options.choice("data", ["empty", "configure-later"]).pipe(
  Options.withDefault("empty" as const),
);
const copyDomainsOption = Options.choice("domains", ["generated", "configure-later"]).pipe(
  Options.withDefault("generated" as const),
);
const copyStorageOption = Options.text("storage").pipe(Options.withDefault("empty"));
const copyNetworkOption = Options.choice("network", ["isolated"]).pipe(
  Options.withDefault("isolated" as const),
);
const dryRunOption = Options.boolean("dry-run").pipe(Options.withDefault(false));
const yesOption = Options.boolean("yes").pipe(Options.withDefault(false));
const jsonOption = Options.boolean("json").pipe(Options.withDefault(false));
const revealGeneratedSecretsOption = Options.boolean("reveal-generated-secrets").pipe(
  Options.withDefault(false),
);
const databasePolicyOption = Options.text("database").pipe(Options.optional);
const domainPolicyOption = Options.text("domain").pipe(Options.optional);
const reuseSourceOption = Options.text("reuse-source").pipe(Options.optional);
const acknowledgeSharedSourceOption = Options.boolean("acknowledge-shared-source").pipe(
  Options.withDefault(false),
);
const resourceIdsOption = Options.text("resource-ids");
const lockReasonOption = Options.text("reason").pipe(Options.optional);
const exposureOption = Options.choice("exposure", variableExposures);
const scopeOption = Options.choice("scope", configScopes).pipe(Options.optional);
const secretOption = Options.boolean("secret").pipe(Options.withDefault(false));
const variableKindOption = Options.choice("kind", variableKinds);

type CopyDependencyDecision = NonNullable<
  DuplicateEnvironmentProfileCommandInput["dependencyDecisions"]
>[number];

const listCommand = EffectCommand.make(
  "list",
  {
    project: projectOption,
  },
  ({ project }) =>
    runQuery(
      ListEnvironmentsQuery.create({
        projectId: optionalValue(project),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentList));

const createCommand = EffectCommand.make(
  "create",
  {
    project: Options.text("project"),
    name: nameOption,
    kind: kindOption,
    parent: parentOption,
  },
  ({ kind, name, parent, project }) =>
    runCommand(
      CreateEnvironmentCommand.create({
        projectId: project,
        name,
        kind,
        parentEnvironmentId: optionalValue(parent),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentCreate));

const showCommand = EffectCommand.make(
  "show",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) => runQuery(ShowEnvironmentQuery.create({ environmentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentShow));

const archiveCommand = EffectCommand.make(
  "archive",
  {
    environmentId: environmentIdArg,
    reason: archiveReasonOption,
  },
  ({ environmentId, reason }) =>
    runCommand(
      ArchiveEnvironmentCommand.create({
        environmentId,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentArchive));

const cloneCommand = EffectCommand.make(
  "clone",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    kind: cloneKindOption,
  },
  ({ environmentId, kind, name }) =>
    runCommand(
      CloneEnvironmentCommand.create({
        environmentId,
        targetName: name,
        targetKind: optionalValue(kind),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentClone));

const renameCommand = EffectCommand.make(
  "rename",
  {
    environmentId: environmentIdArg,
    name: nameOption,
  },
  ({ environmentId, name }) =>
    runCommand(
      RenameEnvironmentCommand.create({
        environmentId,
        name,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentRename));

const lockCommand = EffectCommand.make(
  "lock",
  {
    environmentId: environmentIdArg,
    reason: lockReasonOption,
  },
  ({ environmentId, reason }) =>
    runCommand(
      LockEnvironmentCommand.create({
        environmentId,
        reason: optionalValue(reason),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentLock));

const unlockCommand = EffectCommand.make(
  "unlock",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) =>
    runCommand(
      UnlockEnvironmentCommand.create({
        environmentId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentUnlock));

const setCommand = EffectCommand.make(
  "set",
  {
    environmentId: environmentIdArg,
    key: keyArg,
    value: valueArg,
    kind: variableKindOption,
    exposure: exposureOption,
    scope: scopeOption,
    secret: secretOption,
  },
  ({ environmentId, exposure, key, kind, scope, secret, value }) =>
    runCommand(
      SetEnvironmentVariableCommand.create({
        environmentId,
        key,
        value,
        kind,
        exposure,
        scope: optionalValue(scope),
        isSecret: secret,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentSet));

const unsetCommand = EffectCommand.make(
  "unset",
  {
    environmentId: environmentIdArg,
    key: keyArg,
    exposure: exposureOption,
    scope: scopeOption,
  },
  ({ environmentId, exposure, key, scope }) =>
    runCommand(
      UnsetEnvironmentVariableCommand.create({
        environmentId,
        key,
        exposure,
        scope: optionalValue(scope),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentUnset));

const diffCommand = EffectCommand.make(
  "diff",
  {
    environmentId: environmentIdArg,
    otherEnvironmentId: otherEnvironmentIdArg,
  },
  ({ environmentId, otherEnvironmentId }) =>
    runQuery(
      DiffEnvironmentsQuery.create({
        environmentId,
        otherEnvironmentId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDiff));

const diffProfileCommand = EffectCommand.make(
  "diff-profile",
  {
    environmentId: environmentIdArg,
    targetEnvironmentId: Args.text({ name: "targetEnvironmentId" }),
    includeUnchanged: Options.boolean("include-unchanged").pipe(Options.optional),
  },
  ({ environmentId, includeUnchanged, targetEnvironmentId }) =>
    runQuery(
      DiffEnvironmentProfileQuery.create({
        environmentId,
        targetEnvironmentId,
        includeUnchanged: optionalValue(includeUnchanged),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDiffProfile));

const duplicatePlanCommand = EffectCommand.make(
  "plan",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    project: projectOption,
    target: Options.text("target").pipe(Options.optional),
  },
  ({ environmentId, name, project, target }) =>
    runQuery(
      PlanDuplicateEnvironmentQuery.create({
        environmentId,
        targetName: name,
        targetProjectId: optionalValue(project),
        targetEnvironmentId: optionalValue(target),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicatePlan));

const duplicateApplyCommand = EffectCommand.make(
  "apply",
  {
    environmentId: environmentIdArg,
    name: nameOption,
    kind: cloneKindOption,
    dependencyDecisions: dependencyDecisionsOption,
    resourceDecisions: resourceDecisionsOption,
  },
  ({ dependencyDecisions, environmentId, kind, name, resourceDecisions }) =>
    runCommand(
      DuplicateEnvironmentProfileCommand.create({
        environmentId,
        targetName: name,
        targetKind: optionalValue(kind),
        dependencyDecisions: parseJsonArrayOption(
          optionalValue(dependencyDecisions),
          "dependency-decisions",
        ) as DuplicateEnvironmentProfileCommandInput["dependencyDecisions"],
        resourceDecisions: parseJsonArrayOption(
          optionalValue(resourceDecisions),
          "resource-decisions",
        ) as DuplicateEnvironmentProfileCommandInput["resourceDecisions"],
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicateApply));

const duplicateCommand = EffectCommand.make("duplicate").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.environmentDuplicate),
  EffectCommand.withSubcommands([duplicatePlanCommand, duplicateApplyCommand]),
);

const copyCommand = EffectCommand.make(
  "copy",
  {
    environmentId: environmentIdArg,
    targetName: targetNameArg,
    dependencies: copyDependenciesOption,
    secrets: copySecretsOption,
    data: copyDataOption,
    domains: copyDomainsOption,
    storage: copyStorageOption,
    network: copyNetworkOption,
    dryRun: dryRunOption,
    yes: yesOption,
    json: jsonOption,
    revealGeneratedSecrets: revealGeneratedSecretsOption,
    database: databasePolicyOption,
    domain: domainPolicyOption,
    reuseSource: reuseSourceOption,
    acknowledgeSharedSource: acknowledgeSharedSourceOption,
  },
  ({
    acknowledgeSharedSource,
    database,
    domain,
    data,
    dependencies,
    domains,
    dryRun,
    environmentId,
    json,
    network,
    revealGeneratedSecrets,
    reuseSource,
    secrets,
    storage,
    targetName,
    yes,
  }) =>
    runEnvironmentCopy({
      environmentId,
      targetName,
      dependencies,
      secrets,
      data,
      domains,
      storage,
      network,
      dryRun,
      yes,
      json,
      revealGeneratedSecrets,
      database: optionalValue(database),
      domain: optionalValue(domain),
      reuseSource: optionalValue(reuseSource),
      acknowledgeSharedSource,
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentCopy));

const effectivePrecedenceCommand = EffectCommand.make(
  "effective-precedence",
  {
    environmentId: environmentIdArg,
  },
  ({ environmentId }) => runQuery(EnvironmentEffectivePrecedenceQuery.create({ environmentId })),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentEffectivePrecedence));

const promoteCommand = EffectCommand.make(
  "promote",
  {
    environmentId: environmentIdArg,
    targetName: targetNameArg,
    kind: kindOption,
  },
  ({ environmentId, kind, targetName }) =>
    runCommand(
      PromoteEnvironmentCommand.create({
        environmentId,
        targetName,
        targetKind: kind,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentPromote));

const syncProfileCommand = EffectCommand.make(
  "sync-profile",
  {
    environmentId: environmentIdArg,
    targetEnvironmentId: Args.text({ name: "targetEnvironmentId" }),
    resourceIds: resourceIdsOption,
  },
  ({ environmentId, resourceIds, targetEnvironmentId }) =>
    runCommand(
      SyncEnvironmentProfileCommand.create({
        environmentId,
        targetEnvironmentId,
        resourceIds: parseCommaSeparatedOption(resourceIds, "resource-ids"),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.environmentSyncProfile));

export const envCommand = EffectCommand.make("env").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.environment),
  EffectCommand.withSubcommands([
    listCommand,
    createCommand,
    showCommand,
    renameCommand,
    lockCommand,
    unlockCommand,
    archiveCommand,
    cloneCommand,
    setCommand,
    unsetCommand,
    effectivePrecedenceCommand,
    diffCommand,
    diffProfileCommand,
    copyCommand,
    duplicateCommand,
    syncProfileCommand,
    promoteCommand,
  ]),
);

function runEnvironmentCopy(input: {
  readonly environmentId: string;
  readonly targetName: string;
  readonly dependencies: "create-new" | "defer";
  readonly secrets: "regenerate" | "configure-later";
  readonly data: "empty" | "configure-later";
  readonly domains: "generated" | "configure-later";
  readonly storage: string;
  readonly network: "isolated";
  readonly dryRun: boolean;
  readonly yes: boolean;
  readonly json: boolean;
  readonly revealGeneratedSecrets: boolean;
  readonly database: string | undefined;
  readonly domain: string | undefined;
  readonly reuseSource: string | undefined;
  readonly acknowledgeSharedSource: boolean;
}) {
  return Effect.gen(function* () {
    if (input.revealGeneratedSecrets && input.json) {
      return yield* Effect.fail(
        domainError.validation("Generated secret reveal is not available with JSON output", {
          phase: "environment-profile-copy-cli",
        }),
      );
    }

    const cli = yield* CliRuntime;
    if (input.revealGeneratedSecrets && !cli.terminalIO.stdin.isTTY) {
      return yield* Effect.fail(
        domainError.validation("Generated secret reveal requires an interactive TTY", {
          phase: "environment-profile-copy-cli",
        }),
      );
    }

    const planQuery = yield* resultToEffect(
      PlanDuplicateEnvironmentQuery.create({
        environmentId: input.environmentId,
        targetName: input.targetName,
      }),
    );
    const planResult = yield* Effect.promise(() => cli.executeQuery(planQuery));
    const plan = yield* resultToEffect(planResult);
    const copyPlan = defaultEnvironmentCopyPlan(plan, input);

    if (input.dryRun) {
      yield* print(copyPlan);
      return;
    }

    const command = yield* resultToEffect(
      DuplicateEnvironmentProfileCommand.create({
        environmentId: input.environmentId,
        targetName: input.targetName,
        dependencyDecisions: copyPlan.dependencyDecisions,
      }),
    );
    const applyResult = yield* Effect.promise(() => cli.executeCommand(command));
    const output = yield* resultToEffect(applyResult);
    yield* print({
      schemaVersion: "environments.copy/v1",
      status: "applied",
      sourceEnvironmentId: input.environmentId,
      targetName: input.targetName,
      defaultPolicies: copyPlan.defaultPolicies,
      oneTimeSecretRevealRefs: [],
      result: output,
      ...(input.yes ? { confirmed: true } : {}),
    });
  });
}

function defaultEnvironmentCopyPlan(
  plan: EnvironmentDuplicatePlanSummary,
  input: {
    readonly dependencies: "create-new" | "defer";
    readonly secrets: "regenerate" | "configure-later";
    readonly data: "empty" | "configure-later";
    readonly domains: "generated" | "configure-later";
    readonly storage: string;
    readonly network: "isolated";
    readonly database: string | undefined;
    readonly domain: string | undefined;
    readonly reuseSource: string | undefined;
    readonly acknowledgeSharedSource: boolean;
  },
) {
  return {
    schemaVersion: "environments.copy-plan/v1" as const,
    sourceEnvironmentId: plan.sourceEnvironment.id,
    targetName: plan.target.name,
    defaultPolicies: {
      services: "copy-and-redeploy",
      network: input.network,
      dependencies: input.dependencies === "create-new" ? "create-new-managed" : "defer",
      secrets: input.secrets,
      data: databaseDataPolicy(input),
      domains: domainPolicy(input),
      storage: storagePolicy(input.storage),
    },
    dependencyDecisions: plan.dependencyCandidates.map((candidate) =>
      dependencyDecisionFromCopyPlan(candidate, input),
    ),
    unresolvedBlockers: [
      ...(input.secrets === "configure-later" ? ["secret-values"] : []),
      ...(input.data === "configure-later" ? ["database-data"] : []),
      ...(input.domains === "configure-later" ? ["custom-domain-routes"] : []),
      ...(input.storage === "configure-later" ? ["storage-data"] : []),
    ],
    warnings: plan.warnings,
    generatedAt: plan.generatedAt,
  };
}

function databaseDataPolicy(input: {
  readonly data: "empty" | "configure-later";
  readonly database: string | undefined;
}) {
  if (input.database?.startsWith("restore:")) {
    return input.database;
  }
  return input.data;
}

function domainPolicy(input: {
  readonly domains: "generated" | "configure-later";
  readonly domain: string | undefined;
}) {
  if (input.domain?.startsWith("rebind:")) {
    return input.domain;
  }
  if (input.domain === "generated") {
    return "generated-route";
  }
  if (input.domain === "defer" || input.domain === "configure-later") {
    return "configure-later";
  }
  return input.domains === "generated" ? "generated-route" : "configure-later";
}

function storagePolicy(value: string) {
  if (value === "empty") {
    return "empty-volume";
  }
  if (value === "configure-later" || value === "defer") {
    return "configure-later";
  }
  if (value.startsWith("restore:") || value.startsWith("import:")) {
    return value;
  }
  return "configure-later";
}

function dependencyDecisionFromCopyPlan(
  candidate: EnvironmentDuplicateDependencyCandidate,
  input: {
    readonly dependencies: "create-new" | "defer";
    readonly database: string | undefined;
    readonly reuseSource: string | undefined;
    readonly acknowledgeSharedSource: boolean;
  },
): CopyDependencyDecision {
  const databaseDecision = dependencyDatabaseDecision(candidate, input.database);
  if (databaseDecision) {
    return databaseDecision;
  }

  if (input.reuseSource && dependencyMatchesAlias(candidate, input.reuseSource)) {
    return {
      dependencyResourceId: candidate.dependencyResourceId,
      decision: "reuse-source",
      acknowledgement: input.acknowledgeSharedSource
        ? "I understand this target environment will share the source dependency."
        : "",
    };
  }

  if (input.dependencies === "defer" || !candidate.providerManaged) {
    return { dependencyResourceId: candidate.dependencyResourceId, decision: "defer" };
  }

  return {
    dependencyResourceId: candidate.dependencyResourceId,
    decision: "create-new-managed",
    providerKey: candidate.providerKey,
  };
}

function dependencyDatabaseDecision(
  candidate: EnvironmentDuplicateDependencyCandidate,
  value: string | undefined,
): CopyDependencyDecision | null {
  if (!value || !dependencyMatchesAlias(candidate, "db")) {
    return null;
  }

  if (value === "create-new") {
    return {
      dependencyResourceId: candidate.dependencyResourceId,
      decision: "create-new-managed",
      providerKey: candidate.providerKey,
    };
  }
  if (value === "defer") {
    return { dependencyResourceId: candidate.dependencyResourceId, decision: "defer" };
  }
  if (value.startsWith("bind-existing:")) {
    return {
      dependencyResourceId: candidate.dependencyResourceId,
      decision: "bind-existing",
      targetDependencyResourceId: value.slice("bind-existing:".length),
    };
  }
  return { dependencyResourceId: candidate.dependencyResourceId, decision: "defer" };
}

function dependencyMatchesAlias(
  candidate: EnvironmentDuplicateDependencyCandidate,
  alias: string,
): boolean {
  const normalized = alias.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "db" || normalized === "database") {
    return candidate.kind === "postgres" || candidate.kind === "mysql";
  }
  return candidate.kind === normalized || candidate.slug === normalized;
}

function parseJsonArrayOption(text: string | undefined, optionName: string): unknown[] {
  if (!text?.trim()) {
    return [];
  }

  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`--${optionName} must be a JSON array`);
  }
  return parsed;
}

function parseCommaSeparatedOption(text: string, optionName: string): string[] {
  const values = text
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error(`--${optionName} must include at least one value`);
  }
  return values;
}
