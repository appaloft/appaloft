import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface, type Interface } from "node:readline/promises";
import { Command as EffectCommand, Options } from "@effect/cli";
import { DoctorQuery, ListProvidersQuery, type ProviderDescriptor } from "@yundu/application";
import { type Result } from "@yundu/core";
import { Effect } from "effect";
import { CliRuntime, optionalValue, print, runQuery } from "../runtime.js";

const initOutputOption = Options.text("output").pipe(Options.withDefault("yundu.json"));
const initProjectOption = Options.text("project").pipe(Options.optional);
const initTargetsOption = Options.text("targets").pipe(Options.optional);
const initForceOption = Options.boolean("force").pipe(Options.withDefault(false));

const initTargetAliases = ["local", "ssh", "aliyun", "tencent"] as const;
type InitTargetAlias = (typeof initTargetAliases)[number];

interface InitConfigTarget {
  key: string;
  name: string;
  providerKey: string;
  host?: string;
  port?: number;
}

interface InitConfig {
  project: {
    name: string;
  };
  environment: {
    name: string;
    kind: "local";
  };
  targets: InitConfigTarget[];
  deployment: {
    targetKey: string;
    method: "auto";
  };
}

interface InitRuntime {
  executeQuery(message: ListProvidersQuery): Promise<Result<{ items: ProviderDescriptor[] }>>;
}

function normalizeInitProviderKey(alias: InitTargetAlias): string {
  switch (alias) {
    case "local":
      return "local-shell";
    case "ssh":
      return "generic-ssh";
    case "aliyun":
      return "aliyun";
    case "tencent":
      return "tencent-cloud";
  }
}

function parseInitTargets(value: string | undefined): InitTargetAlias[] {
  const rawTargets = value
    ? value
        .split(",")
        .map((target) => target.trim())
        .filter((target) => target.length > 0)
    : ["local"];
  const selected = rawTargets.filter((target): target is InitTargetAlias =>
    initTargetAliases.includes(target as InitTargetAlias),
  );

  return selected.length > 0 ? selected : ["local"];
}

function defaultHostFor(alias: InitTargetAlias): string {
  return alias === "local" ? "127.0.0.1" : "";
}

function defaultNameFor(alias: InitTargetAlias): string {
  switch (alias) {
    case "local":
      return "Local Machine";
    case "ssh":
      return "SSH Server";
    case "aliyun":
      return "Alibaba Cloud Server";
    case "tencent":
      return "Tencent Cloud Server";
  }
}

async function providerKeys(cli: InitRuntime): Promise<Set<string>> {
  return await ListProvidersQuery.create().match(
    async (query) => {
      const result = await cli.executeQuery(query);
      return result.match(
        (value) => new Set(value.items.map((item) => item.key)),
        () => new Set<string>(),
      );
    },
    async () => new Set<string>(),
  );
}

async function promptText(
  reader: Interface,
  question: string,
  defaultValue: string,
): Promise<string> {
  const answer = (await reader.question(`${question} (${defaultValue}): `)).trim();
  return answer || defaultValue;
}

async function createInitConfig(input: {
  cli: InitRuntime;
  project?: string;
  targets?: string;
}): Promise<InitConfig> {
  const detectedProviderKeys = await providerKeys(input.cli);
  const reader =
    process.stdin.isTTY && process.stdout.isTTY
      ? createInterface({
          input: process.stdin,
          output: process.stdout,
        })
      : null;

  try {
    const projectName = reader
      ? await promptText(reader, "Project name", input.project ?? "Yundu Project")
      : (input.project ?? "Yundu Project");
    const targetPrompt = initTargetAliases.join(",");
    const targetAliases = parseInitTargets(
      reader
        ? await promptText(reader, "Targets, comma-separated", input.targets ?? targetPrompt)
        : input.targets,
    );
    const targets: InitConfigTarget[] = [];

    for (const alias of targetAliases) {
      const providerKey = normalizeInitProviderKey(alias);
      const host = reader
        ? await promptText(reader, `${defaultNameFor(alias)} host`, defaultHostFor(alias))
        : defaultHostFor(alias);
      const portText = reader
        ? await promptText(reader, `${defaultNameFor(alias)} port`, "22")
        : "22";
      const port = Number(portText);

      if (!detectedProviderKeys.has(providerKey)) {
        continue;
      }

      targets.push({
        key: alias,
        name: defaultNameFor(alias),
        providerKey,
        ...(host ? { host } : {}),
        ...(Number.isInteger(port) && port > 0 ? { port } : {}),
      });
    }

    const fallbackTarget: InitConfigTarget = {
      key: "local",
      name: defaultNameFor("local"),
      providerKey: normalizeInitProviderKey("local"),
      host: "127.0.0.1",
      port: 22,
    };
    const selectedTargets = targets.length > 0 ? targets : [fallbackTarget];

    return {
      project: {
        name: projectName,
      },
      environment: {
        name: "local",
        kind: "local",
      },
      targets: selectedTargets,
      deployment: {
        targetKey: selectedTargets[0]?.key ?? "local",
        method: "auto",
      },
    };
  } finally {
    reader?.close();
  }
}

export const versionCommand = EffectCommand.make("version", {}, () =>
  Effect.gen(function* () {
    const cli = yield* CliRuntime;

    yield* print({
      name: "Yundu",
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
).pipe(EffectCommand.withDescription("Start the Yundu backend service"));

export const initCommand = EffectCommand.make(
  "init",
  {
    output: initOutputOption,
    project: initProjectOption,
    targets: initTargetsOption,
    force: initForceOption,
  },
  ({ force, output, project, targets }) =>
    Effect.gen(function* () {
      const cli = yield* CliRuntime;
      const outputPath = resolve(output);

      if (existsSync(outputPath) && !force) {
        yield* print({
          created: false,
          path: outputPath,
          message: "Config file already exists. Use --force to overwrite it.",
        });
        return;
      }

      const projectValue = optionalValue(project);
      const targetsValue = optionalValue(targets);
      const config = yield* Effect.promise(() =>
        createInitConfig({
          cli,
          ...(projectValue ? { project: projectValue } : {}),
          ...(targetsValue ? { targets: targetsValue } : {}),
        }),
      );

      yield* Effect.promise(() => Bun.write(outputPath, `${JSON.stringify(config, null, 2)}\n`));
      yield* print({
        created: true,
        path: outputPath,
        next: `yundu deploy . --config ${outputPath}`,
      });
    }),
).pipe(EffectCommand.withDescription("Create a local Yundu deployment config"));

export const doctorCommand = EffectCommand.make("doctor", {}, () =>
  runQuery(DoctorQuery.create()),
).pipe(EffectCommand.withDescription("Run readiness diagnostics"));
