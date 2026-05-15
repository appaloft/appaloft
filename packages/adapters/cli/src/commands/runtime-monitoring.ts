import {
  ConfigureRuntimeMonitoringThresholdsCommand,
  type ConfigureRuntimeMonitoringThresholdsCommandInput,
  ListRuntimeMonitoringSamplesQuery,
  RuntimeMonitoringRollupQuery,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringSignal,
  ShowRuntimeMonitoringThresholdsQuery,
} from "@appaloft/application";
import {
  runtimeMonitoringBucketSchema,
  runtimeMonitoringSignalSchema,
} from "@appaloft/application/schemas";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const scopeArg = Args.text({ name: "scope" });
const fromOption = Options.text("from");
const toOption = Options.text("to");
const optionalFromOption = Options.text("from").pipe(Options.optional);
const optionalToOption = Options.text("to").pipe(Options.optional);
const signalOption = Options.choice("signal", runtimeMonitoringSignalSchema.options).pipe(
  Options.repeated,
);
const limitOption = Options.text("limit").pipe(Options.optional);
const bucketOption = Options.choice("bucket", runtimeMonitoringBucketSchema.options);
const policyIdOption = Options.text("policy-id").pipe(Options.optional);
const ruleOption = Options.text("rule").pipe(Options.repeated);
const disabledOption = Options.boolean("disabled").pipe(Options.withDefault(false));

function parseScope(scope: string): Result<RuntimeMonitoringScope> {
  const [kind, id, extra] = scope.split(":");
  if (extra !== undefined || !kind || !id) {
    return err(
      domainError.validation("Runtime monitoring scope must use <kind>:<id>", {
        phase: "runtime-monitoring",
        scope,
      }),
    );
  }

  switch (kind) {
    case "server":
      return ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind, serverId: id },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:01:00.000Z",
        },
      }).map((query) => query.input.scope);
    case "project":
      return ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind, projectId: id },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:01:00.000Z",
        },
      }).map((query) => query.input.scope);
    case "environment":
      return ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind, environmentId: id },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:01:00.000Z",
        },
      }).map((query) => query.input.scope);
    case "resource":
      return ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind, resourceId: id },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:01:00.000Z",
        },
      }).map((query) => query.input.scope);
    case "deployment":
      return ListRuntimeMonitoringSamplesQuery.create({
        scope: { kind, deploymentId: id },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:01:00.000Z",
        },
      }).map((query) => query.input.scope);
    default:
      return err(
        domainError.validation("Runtime monitoring scope kind is unsupported", {
          phase: "runtime-monitoring",
          scopeKind: kind,
        }),
      );
  }
}

function optionalSignals(signals: RuntimeMonitoringSignal[]) {
  return signals.length > 0 ? { signals } : {};
}

function parseThresholdRule(
  value: string,
): Result<ConfigureRuntimeMonitoringThresholdsCommandInput["rules"][number]> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return ConfigureRuntimeMonitoringThresholdsCommand.create({
      scope: { kind: "resource", resourceId: "res_cli_parse" },
      rules: [parsed as ConfigureRuntimeMonitoringThresholdsCommandInput["rules"][number]],
    }).andThen((command) => {
      const rule = command.input.rules[0];
      return rule
        ? ok(rule)
        : err(
            domainError.validation("Runtime monitoring threshold rule parsed unexpectedly empty"),
          );
    });
  } catch (cause) {
    return err(
      domainError.validation("Runtime monitoring threshold rule must be valid JSON", {
        phase: "runtime-monitoring-thresholds",
        cause: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  }
}

function parseThresholdRules(
  values: string[],
): Result<ConfigureRuntimeMonitoringThresholdsCommandInput["rules"]> {
  const rules: ConfigureRuntimeMonitoringThresholdsCommandInput["rules"] = [];
  for (const value of values) {
    const rule = parseThresholdRule(value);
    if (rule.isErr()) {
      return rule.map((parsedRule) => [parsedRule]);
    }
    rules.push(rule.value);
  }
  return ConfigureRuntimeMonitoringThresholdsCommand.create({
    scope: { kind: "resource", resourceId: "res_cli_parse" },
    rules,
  }).map((command) => command.input.rules);
}

const samplesCommand = EffectCommand.make(
  "samples",
  {
    scope: scopeArg,
    from: fromOption,
    to: toOption,
    signal: signalOption,
    limit: limitOption,
  },
  ({ from, limit, scope, signal, to }) =>
    runQuery(
      parseScope(scope).andThen((parsedScope) =>
        ListRuntimeMonitoringSamplesQuery.create({
          scope: parsedScope,
          window: { from, to },
          ...optionalSignals(signal),
          ...(optionalNumber(limit) !== undefined ? { limit: optionalNumber(limit) } : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoringSamples));

const rollupCommand = EffectCommand.make(
  "rollup",
  {
    scope: scopeArg,
    from: fromOption,
    to: toOption,
    bucket: bucketOption,
    signal: signalOption,
  },
  ({ bucket, from, scope, signal, to }) =>
    runQuery(
      parseScope(scope).andThen((parsedScope) =>
        RuntimeMonitoringRollupQuery.create({
          scope: parsedScope,
          window: { from, to },
          bucket,
          ...optionalSignals(signal),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoringRollup));

const thresholdConfigureCommand = EffectCommand.make(
  "configure",
  {
    scope: scopeArg,
    policyId: policyIdOption,
    rule: ruleOption,
    disabled: disabledOption,
  },
  ({ disabled, policyId, rule, scope }) =>
    runCommand(
      parseScope(scope).andThen((parsedScope) =>
        parseThresholdRules(rule).andThen((rules) =>
          ConfigureRuntimeMonitoringThresholdsCommand.create({
            ...(optionalValue(policyId) ? { policyId: optionalValue(policyId) } : {}),
            scope: parsedScope,
            rules,
            enabled: !disabled,
          }),
        ),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoringThresholdConfigure));

const thresholdShowCommand = EffectCommand.make(
  "show",
  {
    scope: scopeArg,
    policyId: policyIdOption,
    from: optionalFromOption,
    to: optionalToOption,
  },
  ({ from, policyId, scope, to }) =>
    runQuery(
      parseScope(scope).andThen((parsedScope) =>
        ShowRuntimeMonitoringThresholdsQuery.create({
          scope: parsedScope,
          ...(optionalValue(policyId) ? { policyId: optionalValue(policyId) } : {}),
          ...(optionalValue(from) && optionalValue(to)
            ? { window: { from: optionalValue(from) as string, to: optionalValue(to) as string } }
            : {}),
        }),
      ),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoringThresholdShow));

const thresholdsCommand = EffectCommand.make("thresholds").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoringThresholds),
  EffectCommand.withSubcommands([thresholdConfigureCommand, thresholdShowCommand]),
);

export const runtimeMonitoringCommand = EffectCommand.make("runtime-monitoring").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.runtimeMonitoring),
  EffectCommand.withSubcommands([samplesCommand, rollupCommand, thresholdsCommand]),
);
