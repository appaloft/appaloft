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
  type PrepareServerRuntimeResult,
  PruneServerCapacityCommand,
  prepareServerRuntimeModeSchema,
  RegisterServerCommand,
  type RegisterServerResult,
  RenameServerCommand,
  ReorderServersCommand,
  RotateSshCredentialCommand,
  runtimeTargetPruneCategories,
  type ServerConnectivityResult,
  type ServerDetail,
  ShowScheduledRuntimePrunePolicyQuery,
  ShowServerQuery,
  ShowSshCredentialQuery,
  scheduledRuntimePrunePolicyScopeSchema,
  TestServerConnectivityCommand,
} from "@appaloft/application";
import {
  type DomainError,
  deploymentTargetCredentialKinds,
  domainError,
  err,
  ok,
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
const optionalNameOption = Options.text("name").pipe(Options.optional);
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
const enrollmentTargetArg = Args.text({ name: "target" }).pipe(Args.withDefault(""));
const enrollmentLocalOption = Options.boolean("local").pipe(Options.withDefault(false));
const enrollmentRuntimeModeOption = Options.choice(
  "runtime-mode",
  prepareServerRuntimeModeSchema.options,
).pipe(Options.withDefault("prepare"));

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

type ServerEnrollmentCredential =
  | { kind: "none" }
  | { kind: "local-ssh-agent"; username: string }
  | { kind: "stored-ssh-private-key"; credentialId: string; username: string }
  | { kind: "ssh-private-key-file"; path: string; username: string };

interface ServerEnrollmentTarget {
  kind: "local" | "ssh";
  name: string;
  host: string;
  port: number;
  providerKey: "local-shell" | "generic-ssh";
  credential: ServerEnrollmentCredential;
}

function enrollmentValidation(message: string): Result<never> {
  return err(
    domainError.validation(message, {
      phase: "server-enrollment-input",
    }),
  );
}

function decodeSshUsername(value: string): Result<string> {
  try {
    const username = decodeURIComponent(value).trim();
    return username.length > 0
      ? ok(username)
      : enrollmentValidation("Server enrollment SSH target requires a username");
  } catch {
    return enrollmentValidation("Server enrollment SSH username is invalid");
  }
}

function parseServerEnrollmentTarget(input: {
  local: boolean;
  target: string;
  name?: string;
  credentialId?: string;
  privateKeyFile?: string;
}): Result<ServerEnrollmentTarget> {
  const target = input.target.trim();
  if (input.local) {
    if (target.length > 0) {
      return enrollmentValidation("Use either --local or an SSH target, not both");
    }
    if (input.credentialId || input.privateKeyFile) {
      return enrollmentValidation("Local server enrollment does not accept SSH credential options");
    }
    return ok({
      kind: "local",
      name: input.name?.trim() || "Local machine",
      host: "localhost",
      port: 22,
      providerKey: "local-shell",
      credential: { kind: "none" },
    });
  }
  if (target.length === 0) {
    return enrollmentValidation("Server enrollment requires --local or an ssh:// target");
  }
  if (input.credentialId && input.privateKeyFile) {
    return enrollmentValidation("Use either --credential-id or --private-key-file, not both");
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return enrollmentValidation("Server enrollment target must be a valid ssh:// URL");
  }
  if (url.protocol !== "ssh:") {
    return enrollmentValidation("Server enrollment target must use the ssh:// scheme");
  }
  if (url.password.length > 0) {
    return enrollmentValidation("Server enrollment SSH target must not contain a password");
  }
  if (url.pathname.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    return enrollmentValidation(
      "Server enrollment SSH target must not contain a path, query, or fragment",
    );
  }
  if (url.hostname.length === 0) {
    return enrollmentValidation("Server enrollment SSH target requires a host");
  }
  const username = decodeSshUsername(url.username);
  if (username.isErr()) return err(username.error);
  const port = url.port.length > 0 ? Number(url.port) : 22;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return enrollmentValidation("Server enrollment SSH port must be between 1 and 65535");
  }

  return ok({
    kind: "ssh",
    name: input.name?.trim() || url.hostname,
    host: url.hostname,
    port,
    providerKey: "generic-ssh",
    credential: input.credentialId
      ? {
          kind: "stored-ssh-private-key",
          credentialId: input.credentialId,
          username: username.value,
        }
      : input.privateKeyFile
        ? {
            kind: "ssh-private-key-file",
            path: input.privateKeyFile,
            username: username.value,
          }
        : { kind: "local-ssh-agent", username: username.value },
  });
}

function executeEnrollmentCommand<T>(
  cli: CliRuntime["Type"],
  message: Result<import("@appaloft/application").Command<T>>,
): Effect.Effect<T, DomainError> {
  return Effect.gen(function* () {
    const command = yield* resultToEffect(message);
    return yield* resultToEffect(yield* Effect.promise(() => cli.executeCommand(command)));
  });
}

function executeEnrollmentQuery<T>(
  cli: CliRuntime["Type"],
  message: Result<AppQuery<T>>,
): Effect.Effect<T, DomainError> {
  return Effect.gen(function* () {
    const query = yield* resultToEffect(message);
    return yield* resultToEffect(yield* Effect.promise(() => cli.executeQuery(query)));
  });
}

function runServerEnrollment(input: {
  local: boolean;
  target: string;
  name?: string;
  credentialId?: string;
  privateKeyFile?: string;
  runtimeMode: "prepare" | "repair" | "upgrade";
  workloadRoles: readonly (typeof serverWorkloadRoles)[number][];
}): Effect.Effect<void, DomainError, CliRuntime> {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const target = yield* resultToEffect(parseServerEnrollmentTarget(input));
    const privateKeyPath =
      target.credential.kind === "ssh-private-key-file" ? target.credential.path : undefined;
    const privateKey = privateKeyPath
      ? yield* Effect.tryPromise({
          try: () => Bun.file(privateKeyPath).text(),
          catch: () =>
            domainError.validation("Server enrollment private key file could not be read", {
              phase: "server-enrollment-input",
            }),
        })
      : undefined;
    if (privateKey !== undefined && privateKey.trim().length === 0) {
      return yield* Effect.fail(
        domainError.validation("Server enrollment private key file must not be empty", {
          phase: "server-enrollment-input",
        }),
      );
    }

    const registered = yield* executeEnrollmentCommand<RegisterServerResult>(
      cli,
      RegisterServerCommand.create({
        name: target.name,
        host: target.host,
        port: target.port,
        providerKey: target.providerKey,
        proxyKind: "traefik",
        targetKind: "single-server",
        workloadRoles: [...input.workloadRoles],
      }),
    );
    const stages = ["registered"];
    yield* print({
      schemaVersion: "server-enrollment-checkpoint/v1",
      serverId: registered.id,
      targetKind: target.kind,
      credentialSource: target.credential.kind,
      status: "registered",
    });

    if (target.kind === "ssh" && target.credential.kind !== "none") {
      yield* executeEnrollmentCommand(
        cli,
        ConfigureServerCredentialCommand.create({
          serverId: registered.id,
          credential:
            target.credential.kind === "stored-ssh-private-key"
              ? {
                  kind: "stored-ssh-private-key",
                  credentialId: target.credential.credentialId,
                  username: target.credential.username,
                }
              : target.credential.kind === "ssh-private-key-file"
                ? {
                    kind: "ssh-private-key",
                    username: target.credential.username,
                    privateKey: privateKey ?? "",
                  }
                : {
                    kind: "local-ssh-agent",
                    username: target.credential.username,
                  },
        }),
      );
      stages.push("credential-configured");
    }

    const connectivity = yield* executeEnrollmentCommand<ServerConnectivityResult>(
      cli,
      TestServerConnectivityCommand.create({ serverId: registered.id }),
    );
    stages.push("connectivity-tested");
    const runtimePreparation = yield* executeEnrollmentCommand<PrepareServerRuntimeResult>(
      cli,
      PrepareServerRuntimeCommand.create({
        serverId: registered.id,
        mode: input.runtimeMode,
      }),
    );
    if (runtimePreparation.status !== "ready") {
      return yield* Effect.fail(
        domainError.infra("Server runtime preparation did not become ready", {
          phase: "server-enrollment-runtime",
          serverId: registered.id,
          retryable: true,
        }),
      );
    }
    stages.push("runtime-ready");
    const readback = yield* executeEnrollmentQuery<ServerDetail>(
      cli,
      ShowServerQuery.create({ serverId: registered.id }),
    );
    stages.push("readback-complete");

    yield* print({
      schemaVersion: "server-enrollment/v1",
      serverId: registered.id,
      targetKind: target.kind,
      stages,
      connectivity: {
        status: connectivity.status,
        checks: connectivity.checks,
      },
      runtimePreparation,
      readback: renderServerWorkloadRoles(readback),
    });
  });
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

const enrollCommand = EffectCommand.make(
  "enroll",
  {
    target: enrollmentTargetArg,
    local: enrollmentLocalOption,
    name: optionalNameOption,
    credentialId: credentialIdOption,
    privateKeyFile: privateKeyFileOption,
    runtimeMode: enrollmentRuntimeModeOption,
    workloadRoles: workloadRoleOption,
  },
  ({ credentialId, local, name, privateKeyFile, runtimeMode, target, workloadRoles }) => {
    const nameValue = optionalValue(name);
    const credentialIdValue = optionalValue(credentialId);
    const privateKeyFileValue = optionalValue(privateKeyFile);
    return runServerEnrollment({
      local,
      target,
      ...(nameValue ? { name: nameValue } : {}),
      ...(credentialIdValue ? { credentialId: credentialIdValue } : {}),
      ...(privateKeyFileValue ? { privateKeyFile: privateKeyFileValue } : {}),
      runtimeMode,
      workloadRoles,
    });
  },
).pipe(EffectCommand.withDescription(cliCommandDescriptions.serverEnroll));

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
    enrollCommand,
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
