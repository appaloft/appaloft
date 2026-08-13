import { readFile } from "node:fs/promises";
import { translateRailwayMigrationSource } from "@appaloft/adapter-railway-migration";
import {
  ApplyPlatformMigrationCommand,
  CleanupPlatformMigrationCommand,
  PlanPlatformMigrationQuery,
  StatusPlatformMigrationQuery,
  VerifyPlatformMigrationQuery,
} from "@appaloft/application";
import { domainError } from "@appaloft/core";
import { Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";

import { optionalValue, resultToEffect, runCommand, runQuery } from "../runtime.js";

const inputOption = Options.text("input").pipe(
  Options.withDescription("Path to a strict Appaloft Migration Bundle v1 JSON file."),
);
const planOption = Options.text("plan").pipe(
  Options.optional,
  Options.withDescription("Path to the exact plan JSON returned by migrate plan."),
);
const confirmOption = Options.text("confirm").pipe(
  Options.withDescription("Exact sha256 plan digest accepted by the operator."),
);
const taskOption = Options.text("task").pipe(
  Options.withDescription("Path to a migration task JSON object containing the plan and receipts."),
);
const resumeTaskOption = Options.text("task").pipe(
  Options.optional,
  Options.withDescription(
    "Path to a prior migration task JSON object; completed receipts are validated and resumed exactly.",
  ),
);
const sourceProviderOption = Options.choice("from", ["appaloft", "railway"] as const).pipe(
  Options.withDefault("appaloft"),
  Options.withDescription("Interpret --input as an Appaloft bundle or Railway read-only export."),
);

function readJsonFile(path: string, phase: string) {
  return Effect.tryPromise({
    try: async () => JSON.parse(await readFile(path, "utf8")) as unknown,
    catch: () =>
      domainError.validation("Migration input file could not be read as JSON", {
        phase,
        path,
      }),
  });
}

const planCommand = EffectCommand.make(
  "plan",
  { input: inputOption, from: sourceProviderOption },
  ({ from, input }) =>
    Effect.gen(function* () {
      const source = yield* readJsonFile(input, "migration-cli-bundle-read");
      const bundle =
        from === "railway"
          ? yield* resultToEffect(translateRailwayMigrationSource(source))
          : source;
      yield* runQuery(PlanPlatformMigrationQuery.create({ bundle }));
    }),
).pipe(
  EffectCommand.withDescription(
    "Create a deterministic no-effect migration plan from a secret-safe bundle",
  ),
);

const applyCommand = EffectCommand.make(
  "apply",
  { plan: planOption, task: resumeTaskOption, confirm: confirmOption },
  ({ confirm, plan, task }) =>
    Effect.gen(function* () {
      const planPath = optionalValue(plan);
      const taskPath = optionalValue(task);
      if ((planPath ? 1 : 0) + (taskPath ? 1 : 0) !== 1) {
        return yield* Effect.fail(
          domainError.validation("Migration apply requires exactly one of --plan or --task", {
            phase: "migration-cli-apply-input",
          }),
        );
      }
      const acceptedInput = yield* readJsonFile(
        planPath ?? (taskPath as string),
        taskPath ? "migration-cli-task-read" : "migration-cli-plan-read",
      );
      if (
        taskPath &&
        (typeof acceptedInput !== "object" ||
          acceptedInput === null ||
          Array.isArray(acceptedInput))
      ) {
        return yield* Effect.fail(
          domainError.validation("Migration task must be a JSON object", {
            phase: "migration-cli-task-read",
          }),
        );
      }
      const taskInput = taskPath ? (acceptedInput as Record<string, unknown>) : undefined;
      const commandInput = taskInput
        ? {
            plan: taskInput.plan,
            confirmedPlanDigest: confirm,
            priorReceipts: taskInput.receipts,
          }
        : {
            plan: acceptedInput,
            confirmedPlanDigest: confirm,
            priorReceipts: [],
          };
      yield* runCommand(ApplyPlatformMigrationCommand.create(commandInput as never));
    }),
).pipe(
  EffectCommand.withDescription(
    "Apply or exactly resume the accepted migration plan through existing operations",
  ),
);

const statusCommand = EffectCommand.make("status", { task: taskOption }, ({ task }) =>
  Effect.gen(function* () {
    const migrationTask = yield* readJsonFile(task, "migration-cli-task-read");
    yield* runQuery(StatusPlatformMigrationQuery.create(migrationTask as never));
  }),
).pipe(EffectCommand.withDescription("Read bounded migration state through existing queries"));

const verifyCommand = EffectCommand.make("verify", { task: taskOption }, ({ task }) =>
  Effect.gen(function* () {
    const migrationTask = yield* readJsonFile(task, "migration-cli-task-read");
    yield* runQuery(VerifyPlatformMigrationQuery.create(migrationTask as never));
  }),
).pipe(
  EffectCommand.withDescription(
    "Verify health, proof, configuration, domain, and data evidence without inferring success",
  ),
);

const cleanupCommand = EffectCommand.make(
  "cleanup",
  { task: taskOption, confirm: confirmOption },
  ({ confirm, task }) =>
    Effect.gen(function* () {
      const migrationTask = yield* readJsonFile(task, "migration-cli-task-read");
      if (
        typeof migrationTask !== "object" ||
        migrationTask === null ||
        Array.isArray(migrationTask)
      ) {
        return yield* Effect.fail(
          domainError.validation("Migration task must be a JSON object", {
            phase: "migration-cli-task-read",
          }),
        );
      }
      yield* runCommand(
        CleanupPlatformMigrationCommand.create({
          ...(migrationTask as Record<string, unknown>),
          confirmedPlanDigest: confirm,
        } as never),
      );
    }),
).pipe(
  EffectCommand.withDescription(
    "Owner-confirmed exact cleanup of receipt-owned state in reverse dependency order",
  ),
);

export const migrationCommand = EffectCommand.make("migrate").pipe(
  EffectCommand.withDescription("Plan, apply, verify, and clean up platform migrations"),
  EffectCommand.withSubcommands([
    planCommand,
    applyCommand,
    statusCommand,
    verifyCommand,
    cleanupCommand,
  ]),
);
