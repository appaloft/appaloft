import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DoctorQuery } from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";
import { type AppaloftDeploymentConfig } from "@appaloft/deployment-config";
import { Command as EffectCommand, Options } from "@effect/cli";
import { Effect } from "effect";
import { CliRuntime, optionalValue, print, resultToEffect, runQuery } from "../runtime.js";
import { type DeploymentMethod, deploymentMethods } from "./deployment-source.js";

const initOutputOption = Options.text("output").pipe(Options.withDefault("appaloft.json"));
const initMethodOption = Options.choice("method", deploymentMethods).pipe(
  Options.withDefault("auto"),
);
const initInstallOption = Options.text("install").pipe(Options.optional);
const initBuildOption = Options.text("build").pipe(Options.optional);
const initStartOption = Options.text("start").pipe(Options.optional);
const initPublishDirOption = Options.text("publish-dir").pipe(Options.optional);
const initPortOption = Options.text("port").pipe(Options.optional);
const initHealthPathOption = Options.text("health-path").pipe(Options.optional);
const initForceOption = Options.boolean("force").pipe(Options.withDefault(false));

const defaultApplicationInternalPort = 3000;
const defaultStaticInternalPort = 80;
const defaultStaticPublishDirectory = "dist";

function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalPositiveInteger(
  label: string,
  value: string | undefined,
): Result<number | undefined> {
  if (!value) {
    return ok(undefined);
  }

  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return ok(parsed);
  }

  return err(
    domainError.validation(`${label} must be a positive integer`, {
      phase: "config-init",
    }),
  );
}

export function createInitConfig(
  input: {
    method?: DeploymentMethod;
    install?: string;
    build?: string;
    start?: string;
    publishDir?: string;
    port?: number;
    healthPath?: string;
  } = {},
): AppaloftDeploymentConfig {
  const method = input.method ?? "auto";
  const installCommand = trimToUndefined(input.install);
  const buildCommand = trimToUndefined(input.build);
  const startCommand = method === "static" ? undefined : trimToUndefined(input.start);
  const publishDirectory =
    trimToUndefined(input.publishDir) ??
    (method === "static" ? defaultStaticPublishDirectory : undefined);
  const healthCheckPath = trimToUndefined(input.healthPath);

  return {
    runtime: {
      strategy: method,
      ...(installCommand ? { installCommand } : {}),
      ...(buildCommand ? { buildCommand } : {}),
      ...(startCommand ? { startCommand } : {}),
      ...(publishDirectory ? { publishDirectory } : {}),
      ...(healthCheckPath ? { healthCheckPath } : {}),
    },
    network: {
      internalPort:
        input.port ??
        (method === "static" ? defaultStaticInternalPort : defaultApplicationInternalPort),
      upstreamProtocol: "http",
      exposureMode: "reverse-proxy",
    },
  };
}

export const versionCommand = EffectCommand.make("version", {}, () =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;

    yield* print({
      name: "Appaloft",
      version: cli.version,
    });
  }),
).pipe(EffectCommand.withDescription("Show CLI and API version metadata"));

export const serveCommand = EffectCommand.make("serve", {}, () =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;

    yield* Effect.promise(() => cli.startServer());
    yield* Effect.never;
  }),
).pipe(EffectCommand.withDescription("Start the Appaloft backend service"));

export const initCommand = EffectCommand.make(
  "init",
  {
    output: initOutputOption,
    method: initMethodOption,
    install: initInstallOption,
    build: initBuildOption,
    start: initStartOption,
    publishDir: initPublishDirOption,
    port: initPortOption,
    healthPath: initHealthPathOption,
    force: initForceOption,
  },
  ({ build, force, healthPath, install, method, output, port, publishDir, start }) =>
    Effect.gen(function* () {
      const outputPath = resolve(output);

      if (existsSync(outputPath) && !force) {
        yield* print({
          created: false,
          path: outputPath,
          message: "Config file already exists. Use --force to overwrite it.",
        });
        return;
      }

      const installValue = optionalValue(install);
      const buildValue = optionalValue(build);
      const startValue = optionalValue(start);
      const publishDirValue = optionalValue(publishDir);
      const healthPathValue = optionalValue(healthPath);
      const portValue = yield* resultToEffect(
        parseOptionalPositiveInteger("Port", optionalValue(port)),
      );
      const config = createInitConfig({
        method,
        ...(installValue ? { install: installValue } : {}),
        ...(buildValue ? { build: buildValue } : {}),
        ...(startValue ? { start: startValue } : {}),
        ...(publishDirValue ? { publishDir: publishDirValue } : {}),
        ...(portValue ? { port: portValue } : {}),
        ...(healthPathValue ? { healthPath: healthPathValue } : {}),
      });

      yield* Effect.promise(() => Bun.write(outputPath, `${JSON.stringify(config, null, 2)}\n`));
      yield* print({
        created: true,
        path: outputPath,
        next: `appaloft deploy . --config ${outputPath}`,
      });
    }),
).pipe(EffectCommand.withDescription("Create a local Appaloft deployment config"));

export const doctorCommand = EffectCommand.make("doctor", {}, () =>
  runQuery(DoctorQuery.create()),
).pipe(EffectCommand.withDescription("Run readiness diagnostics"));
