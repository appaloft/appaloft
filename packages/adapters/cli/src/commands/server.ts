import {
  type Query as AppQuery,
  BootstrapServerProxyCommand,
  CheckServerDeleteSafetyQuery,
  ConfigureScheduledRuntimePrunePolicyCommand,
  ConfigureServerCredentialCommand,
  ConfigureServerWorkloadRolesCommand,
  CreateSshCredentialCommand,
  DeactivateServerCommand,
  DeleteServerCommand,
  DeleteSshCredentialCommand,
  InspectServerCapacityQuery,
  ListScheduledRuntimePrunePoliciesQuery,
  ListServersQuery,
  ListSshCredentialsQuery,
  OpenTerminalSessionCommand,
  PrepareServerRuntimeCommand,
  PruneServerCapacityCommand,
  prepareServerRuntimeModeSchema,
  RegisterServerCommand,
  RenameServerCommand,
  ReorderServersCommand,
  RotateSshCredentialCommand,
  runtimeTargetPruneCategories,
  ShowScheduledRuntimePrunePolicyQuery,
  ShowServerQuery,
  ShowSshCredentialQuery,
  scheduledRuntimePrunePolicyScopeSchema,
  TestServerConnectivityCommand,
} from "@appaloft/application";
import {
  type DomainError,
  deploymentTargetCredentialKinds,
  type Result,
  serverWorkloadRoles,
  targetKinds,
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
  runTerminalCommand,
} from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const nameOption = Options.text("name");
const hostOption = Options.text("host");
const portOption = Options.text("port").pipe(Options.withDefault("22"));
const providerOption = Options.text("provider").pipe(Options.withDefault("generic-ssh"));
const targetKindOption = Options.choice("target-kind", targetKinds).pipe(
  Options.withDefault("single-server"),
);
const credentialKindOption = Options.choice("kind", deploymentTargetCredentialKinds).pipe(
  Options.withDefault("local-ssh-agent"),
);
const workloadRoleOption = Options.choice("workload-role", serverWorkloadRoles).pipe(
  Options.repeated,
);
const usernameOption = Options.text("username").pipe(Options.optional);
const publicKeyOption = Options.text("public-key").pipe(Options.optional);
const privateKeyFileOption = Options.text("private-key-file").pipe(Options.optional);
const requiredPrivateKeyFileOption = Options.text("private-key-file");
const credentialIdOption = Options.text("credential-id").pipe(Options.optional);
const reasonOption = Options.text("reason").pipe(Options.optional);
const confirmServerIdOption = Options.text("confirm");
const confirmCredentialIdOption = Options.text("confirm");
const acknowledgeServerUsageOption = Options.boolean("acknowledge-server-usage").pipe(
  Options.withDefault(false),
);
const serverIdArg = Args.text({ name: "serverId" });
const credentialIdArg = Args.text({ name: "credentialId" });
const rowsOption = Options.text("rows").pipe(Options.withDefault("24"));
const colsOption = Options.text("cols").pipe(Options.withDefault("80"));
const attachTerminalOption = Options.boolean("attach").pipe(Options.withDefault(false));
const scheduledRuntimePrunePolicyScopes = scheduledRuntimePrunePolicyScopeSchema.options;
const prepareRuntimeModeOption = Options.choice(
  "mode",
  prepareServerRuntimeModeSchema.options,
).pipe(Options.withDefault("prepare"));
const policyIdArg = Args.text({ name: "policyId" });
const policyIdOption = Options.text("policy-id").pipe(Options.optional);
const policyVersionOption = Options.text("version").pipe(Options.optional);
const policyScopeOption = Options.choice("scope", scheduledRuntimePrunePolicyScopes);
const optionalPolicyScopeOption = Options.choice("scope", scheduledRuntimePrunePolicyScopes).pipe(
  Options.optional,
);
const optionalServerIdOption = Options.text("server-id").pipe(Options.optional);
const serverIdsOption = Options.text("server-ids");
const startOffsetOption = Options.integer("start-offset").pipe(Options.optional);

const generalPurposeWorkloadRoleMeaning = "General purpose (all workload types)";

function renderServerWorkloadRoles(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.items)) {
    return {
      ...record,
      items: record.items.map(renderServerWorkloadRoles),
    };
  }
  if (record.server && typeof record.server === "object") {
    return {
      ...record,
      server: renderServerWorkloadRoles(record.server),
    };
  }
  if (!Array.isArray(record.workloadRoles)) return value;

  return {
    ...record,
    workloadRoles: record.workloadRoles,
    workloadRoleMeaning:
      record.workloadRoles.length === 0
        ? generalPurposeWorkloadRoleMeaning
        : record.workloadRoles.join(", "),
  };
}

const runServerRead = <T>(
  message: Result<AppQuery<T>>,
): Effect.Effect<void, DomainError, CliRuntime> =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const query = yield* resultToEffect(message);
    const result = yield* Effect.promise(() => cli.executeQuery(query));
    const output = yield* resultToEffect(result);
    yield* print(renderServerWorkloadRoles(output));
  });

const registerCommand = EffectCommand.make(
  "register",
  {
    name: nameOption,
    host: hostOption,
    port: portOption,
    provider: providerOption,
    targetKind: targetKindOption,
    workloadRoles: workloadRoleOption,
  },
  ({ host, name, port, provider, targetKind, workloadRoles }) =>
    runCommand(
      RegisterServerCommand.create({
        name,
        host,
        port: Number(port),
        providerKey: provider,
        proxyKind: "traefik",
        targetKind,
        workloadRoles,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverRegister));

const listCommand = EffectCommand.make("list", {}, () =>
  runServerRead(ListServersQuery.create()),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverList));

const showCommand = EffectCommand.make(
  "show",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runServerRead(
      ShowServerQuery.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverShow));

const configureWorkloadRolesCommand = EffectCommand.make(
  "configure-workload-roles",
  {
    serverId: serverIdArg,
    workloadRoles: workloadRoleOption,
  },
  ({ serverId, workloadRoles }) =>
    runCommand(
      ConfigureServerWorkloadRolesCommand.create({
        serverId,
        workloadRoles,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverConfigureWorkloadRoles));

const renameCommand = EffectCommand.make(
  "rename",
  {
    serverId: serverIdArg,
    name: nameOption,
  },
  ({ name, serverId }) =>
    runCommand(
      RenameServerCommand.create({
        serverId,
        name,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverRename));

const reorderCommand = EffectCommand.make(
  "reorder",
  {
    serverIds: serverIdsOption,
    startOffset: startOffsetOption,
  },
  ({ serverIds, startOffset }) =>
    runCommand(
      ReorderServersCommand.create({
        serverIds: serverIds
          .split(",")
          .map((serverId) => serverId.trim())
          .filter(Boolean),
        startOffset: optionalValue(startOffset),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverReorder));

const deactivateCommand = EffectCommand.make(
  "deactivate",
  {
    serverId: serverIdArg,
    reason: reasonOption,
  },
  ({ reason, serverId }) => {
    const reasonValue = optionalValue(reason);
    return runCommand(
      DeactivateServerCommand.create({
        serverId,
        ...(reasonValue ? { reason: reasonValue } : {}),
      }),
    );
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDeactivate));

const deleteCheckCommand = EffectCommand.make(
  "delete-check",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runQuery(
      CheckServerDeleteSafetyQuery.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDeleteCheck));

const deleteCommand = EffectCommand.make(
  "delete",
  {
    serverId: serverIdArg,
    confirm: confirmServerIdOption,
  },
  ({ confirm, serverId }) =>
    runCommand(
      DeleteServerCommand.create({
        serverId,
        confirmation: {
          serverId: confirm,
        },
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDelete));

const credentialCommand = EffectCommand.make(
  "credential",
  {
    serverId: serverIdArg,
    kind: credentialKindOption,
    username: usernameOption,
    publicKey: publicKeyOption,
    privateKeyFile: privateKeyFileOption,
    credentialId: credentialIdOption,
  },
  ({ credentialId, kind, privateKeyFile, publicKey, serverId, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const credentialIdValue = optionalValue(credentialId);
      const privateKeyPath = optionalValue(privateKeyFile);
      const privateKey = privateKeyPath
        ? yield* Effect.promise(() => Bun.file(privateKeyPath).text())
        : "";

      yield* runCommand(
        ConfigureServerCredentialCommand.create({
          serverId,
          credential: credentialIdValue
            ? {
                kind: "stored-ssh-private-key",
                credentialId: credentialIdValue,
                ...(usernameValue ? { username: usernameValue } : {}),
              }
            : kind === "ssh-private-key"
              ? {
                  kind,
                  ...(usernameValue ? { username: usernameValue } : {}),
                  ...(optionalValue(publicKey) ? { publicKey: optionalValue(publicKey) } : {}),
                  privateKey,
                }
              : {
                  kind,
                  ...(usernameValue ? { username: usernameValue } : {}),
                },
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredential));

const credentialCreateCommand = EffectCommand.make(
  "credential-create",
  {
    name: nameOption,
    username: usernameOption,
    publicKey: publicKeyOption,
    privateKeyFile: requiredPrivateKeyFileOption,
  },
  ({ name, privateKeyFile, publicKey, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const privateKey = yield* Effect.promise(() => Bun.file(privateKeyFile).text());

      yield* runCommand(
        CreateSshCredentialCommand.create({
          name,
          kind: "ssh-private-key",
          ...(usernameValue ? { username: usernameValue } : {}),
          ...(optionalValue(publicKey) ? { publicKey: optionalValue(publicKey) } : {}),
          privateKey,
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialCreate));

const credentialListCommand = EffectCommand.make("credential-list", {}, () =>
  runQuery(ListSshCredentialsQuery.create()),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialList));

const credentialShowCommand = EffectCommand.make(
  "credential-show",
  {
    credentialId: credentialIdArg,
  },
  ({ credentialId }) =>
    runQuery(
      ShowSshCredentialQuery.create({
        credentialId,
        includeUsage: true,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialShow));

const credentialDeleteCommand = EffectCommand.make(
  "credential-delete",
  {
    credentialId: credentialIdArg,
    confirm: confirmCredentialIdOption,
  },
  ({ confirm, credentialId }) =>
    runCommand(
      DeleteSshCredentialCommand.create({
        credentialId,
        confirmation: {
          credentialId: confirm,
        },
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialDelete));

const credentialRotateCommand = EffectCommand.make(
  "credential-rotate",
  {
    credentialId: credentialIdArg,
    privateKeyFile: requiredPrivateKeyFileOption,
    publicKey: publicKeyOption,
    username: usernameOption,
    confirm: confirmCredentialIdOption,
    acknowledgeServerUsage: acknowledgeServerUsageOption,
  },
  ({ acknowledgeServerUsage, confirm, credentialId, privateKeyFile, publicKey, username }) =>
    Effect.gen(function* () {
      const usernameValue = optionalValue(username);
      const publicKeyValue = optionalValue(publicKey);
      const privateKey = yield* Effect.promise(() => Bun.file(privateKeyFile).text());

      yield* runCommand(
        RotateSshCredentialCommand.create({
          credentialId,
          privateKey,
          ...(publicKeyValue ? { publicKey: publicKeyValue } : {}),
          ...(usernameValue ? { username: usernameValue } : {}),
          confirmation: {
            credentialId: confirm,
            ...(acknowledgeServerUsage ? { acknowledgeServerUsage } : {}),
          },
        }),
      );
    }),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCredentialRotate));

const testCommand = EffectCommand.make(
  "test",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      TestServerConnectivityCommand.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverTest));

const doctorCommand = EffectCommand.make(
  "doctor",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      TestServerConnectivityCommand.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverDoctor));

const capacityInspectCommand = EffectCommand.make(
  "inspect",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runQuery(
      InspectServerCapacityQuery.create({
        serverId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCapacityInspect));

const capacityPruneCommand = EffectCommand.make(
  "prune",
  {
    serverId: serverIdArg,
    before: Options.text("before"),
    category: Options.choice("category", runtimeTargetPruneCategories).pipe(Options.repeated),
    target: Options.text("target").pipe(Options.optional),
    dryRun: Options.boolean("dry-run").pipe(Options.withDefault(true)),
    includeOrphanRunning: Options.boolean("include-orphan-running").pipe(
      Options.withDefault(false),
    ),
  },
  ({ serverId, before, category, target, dryRun, includeOrphanRunning }) =>
    runCommand(
      PruneServerCapacityCommand.create({
        serverId,
        before,
        categories: category.length > 0 ? [...category] : undefined,
        target: optionalValue(target),
        dryRun,
        includeOrphanRunning,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCapacityPrune));

const capacityPolicyConfigureCommand = EffectCommand.make(
  "configure",
  {
    policyId: policyIdOption,
    version: policyVersionOption,
    scope: policyScopeOption,
    serverId: optionalServerIdOption,
    retentionDays: Options.text("retention-days"),
    destructive: Options.boolean("destructive").pipe(Options.withDefault(false)),
    category: Options.choice("category", runtimeTargetPruneCategories).pipe(Options.repeated),
    retryOnFailure: Options.boolean("retry-on-failure").pipe(Options.withDefault(true)),
    enabled: Options.boolean("enabled").pipe(Options.withDefault(true)),
  },
  ({
    category,
    destructive,
    enabled,
    policyId,
    retentionDays,
    retryOnFailure,
    scope,
    serverId,
    version,
  }) =>
    runCommand(
      ConfigureScheduledRuntimePrunePolicyCommand.create({
        ...(optionalValue(policyId) ? { policyId: optionalValue(policyId) } : {}),
        ...(optionalValue(version) ? { version: optionalValue(version) } : {}),
        scope,
        ...(optionalValue(serverId) ? { serverId: optionalValue(serverId) } : {}),
        retentionDays: Number(retentionDays),
        destructive,
        categories: category.length > 0 ? [...category] : undefined,
        retryOnFailure,
        enabled,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCapacityPolicyConfigure));

const capacityPolicyListCommand = EffectCommand.make(
  "list",
  {
    serverId: optionalServerIdOption,
    scope: optionalPolicyScopeOption,
    enabledOnly: Options.boolean("enabled-only").pipe(Options.withDefault(false)),
  },
  ({ enabledOnly, scope, serverId }) =>
    runQuery(
      ListScheduledRuntimePrunePoliciesQuery.create({
        ...(optionalValue(serverId) ? { serverId: optionalValue(serverId) } : {}),
        ...(optionalValue(scope) ? { scope: optionalValue(scope) } : {}),
        enabledOnly,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCapacityPolicyList));

const capacityPolicyShowCommand = EffectCommand.make(
  "show",
  {
    policyId: policyIdArg,
  },
  ({ policyId }) =>
    runQuery(
      ShowScheduledRuntimePrunePolicyQuery.create({
        policyId,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverCapacityPolicyShow));

const capacityPolicyCommand = EffectCommand.make("policy").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverCapacityPolicy),
  EffectCommand.withSubcommands([
    capacityPolicyConfigureCommand,
    capacityPolicyListCommand,
    capacityPolicyShowCommand,
  ]),
);

const capacityCommand = EffectCommand.make("capacity").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverCapacity),
  EffectCommand.withSubcommands([
    capacityInspectCommand,
    capacityPruneCommand,
    capacityPolicyCommand,
  ]),
);

const proxyRepairCommand = EffectCommand.make(
  "repair",
  {
    serverId: serverIdArg,
  },
  ({ serverId }) =>
    runCommand(
      BootstrapServerProxyCommand.create({
        serverId,
        reason: "repair",
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverProxyRepair));

const proxyCommand = EffectCommand.make("proxy").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverProxy),
  EffectCommand.withSubcommands([proxyRepairCommand]),
);

const runtimePrepareCommand = EffectCommand.make(
  "prepare",
  {
    serverId: serverIdArg,
    mode: prepareRuntimeModeOption,
  },
  ({ mode, serverId }) =>
    runCommand(
      PrepareServerRuntimeCommand.create({
        serverId,
        mode,
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverRuntimePrepare));

const runtimeCommand = EffectCommand.make("runtime").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.serverRuntime),
  EffectCommand.withSubcommands([runtimePrepareCommand]),
);

const terminalCommand = EffectCommand.make(
  "terminal",
  {
    serverId: serverIdArg,
    rows: rowsOption,
    cols: colsOption,
    attach: attachTerminalOption,
  },
  ({ attach, cols, rows, serverId }) =>
    runTerminalCommand(
      OpenTerminalSessionCommand.create({
        scope: {
          kind: "server",
          serverId,
        },
        initialRows: Number(rows),
        initialCols: Number(cols),
      }),
      {
        attach,
        initialRows: Number(rows),
        initialCols: Number(cols),
      },
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverTerminal));

export const serverCommand = EffectCommand.make("server").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.server),
  EffectCommand.withSubcommands([
    registerCommand,
    listCommand,
    showCommand,
    configureWorkloadRolesCommand,
    renameCommand,
    reorderCommand,
    deactivateCommand,
    deleteCheckCommand,
    deleteCommand,
    credentialCommand,
    credentialCreateCommand,
    credentialListCommand,
    credentialShowCommand,
    credentialDeleteCommand,
    credentialRotateCommand,
    testCommand,
    doctorCommand,
    capacityCommand,
    runtimeCommand,
    terminalCommand,
    proxyCommand,
  ]),
);
