import { dirname, resolve } from "node:path";

import { ensureDir, parseCliArgs, stringArg } from "./lib/release-utils";

interface SshSmokeEvidence {
  command: string;
  durationMs: number;
  environment: {
    hostConfigured: boolean;
    portConfigured: boolean;
    privateKeyConfigured: boolean;
    publicRouteHostConfigured: boolean;
    usernameConfigured: boolean;
  };
  generatedAt: string;
  gitSha?: string;
  matrixId: "RELEASE-HARDENING-006";
  releaseTarget: string;
  result: "passed";
  schemaVersion: "appaloft.ssh-smoke-evidence/v1";
  suiteMode: SshSmokeSuiteMode;
  suites: SshSmokeSuite[];
}

type SshSmokeSuite =
  | "smoke:public-launch:basic-docker"
  | "smoke:public-launch:github-repo"
  | "smoke:public-launch:scheduled-task-cron";
type SshSmokeSuiteMode = "all" | "basic-docker" | "github-repo" | "scheduled-task-cron";

function envConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function parseSuiteMode(value: string | undefined): SshSmokeSuiteMode {
  if (!value) {
    return "all";
  }
  if (
    value === "all" ||
    value === "basic-docker" ||
    value === "github-repo" ||
    value === "scheduled-task-cron"
  ) {
    return value;
  }
  throw new Error("--suite must be one of: all, basic-docker, github-repo, scheduled-task-cron.");
}

function suitesForMode(mode: SshSmokeSuiteMode): SshSmokeSuite[] {
  if (mode === "basic-docker") {
    return ["smoke:public-launch:basic-docker"];
  }
  if (mode === "github-repo") {
    return ["smoke:public-launch:github-repo"];
  }
  if (mode === "scheduled-task-cron") {
    return ["smoke:public-launch:scheduled-task-cron"];
  }
  return [
    "smoke:public-launch:basic-docker",
    "smoke:public-launch:github-repo",
    "smoke:public-launch:scheduled-task-cron",
  ];
}

function parseSmokeCommand(args: ReadonlyMap<string, string | boolean>): {
  command: string[];
  displayName: string;
} {
  const customCommand = stringArg(args, "smoke-command-json");
  if (!customCommand) {
    return {
      command: ["bun", "run", "smoke:ssh"],
      displayName: "bun run smoke:ssh",
    };
  }

  const parsed: unknown = JSON.parse(customCommand);
  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    throw new Error("--smoke-command-json must be a non-empty JSON string array.");
  }

  return {
    command: parsed,
    displayName: "custom smoke command",
  };
}

function defaultSmokeCommand(mode: SshSmokeSuiteMode): { command: string[]; displayName: string } {
  if (mode === "basic-docker") {
    return {
      command: ["bun", "run", "smoke:public-launch:basic-docker"],
      displayName: "bun run smoke:public-launch:basic-docker",
    };
  }
  if (mode === "github-repo") {
    return {
      command: ["bun", "run", "smoke:public-launch:github-repo"],
      displayName: "bun run smoke:public-launch:github-repo",
    };
  }
  if (mode === "scheduled-task-cron") {
    return {
      command: ["bun", "run", "smoke:public-launch:scheduled-task-cron"],
      displayName: "bun run smoke:public-launch:scheduled-task-cron",
    };
  }
  return {
    command: ["bun", "run", "smoke:ssh"],
    displayName: "bun run smoke:ssh",
  };
}

function currentGitSha(): string | undefined {
  if (process.env.GITHUB_SHA?.trim()) {
    return process.env.GITHUB_SHA.trim();
  }

  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: process.cwd(),
    stderr: "ignore",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    return undefined;
  }

  const sha = result.stdout.toString().trim();
  return sha.length > 0 ? sha : undefined;
}

const args = parseCliArgs(Bun.argv.slice(2));
const outputPath = resolve(stringArg(args, "out") ?? "dist/release/ssh-smoke-evidence.json");
const releaseTarget =
  stringArg(args, "release-target") ?? process.env.APPALOFT_RELEASE_TARGET ?? "0.11.0";
const suiteMode = parseSuiteMode(stringArg(args, "suite"));
const smokeCommand = stringArg(args, "smoke-command-json")
  ? parseSmokeCommand(args)
  : defaultSmokeCommand(suiteMode);

console.log(`Running ${smokeCommand.displayName} before writing SSH release-readiness evidence.`);
const startedAt = Date.now();
const result = Bun.spawn(smokeCommand.command, {
  cwd: process.cwd(),
  env: Bun.env,
  stderr: "inherit",
  stdout: "inherit",
});
const exitCode = await result.exited;
const durationMs = Date.now() - startedAt;

if (exitCode !== 0) {
  console.error(
    `SSH release-readiness evidence was not written because ${smokeCommand.displayName} exited with code ${exitCode}.`,
  );
  process.exit(exitCode);
}

const gitSha = currentGitSha();
const evidence: SshSmokeEvidence = {
  schemaVersion: "appaloft.ssh-smoke-evidence/v1",
  releaseTarget,
  generatedAt: new Date().toISOString(),
  ...(gitSha ? { gitSha } : {}),
  matrixId: "RELEASE-HARDENING-006",
  command: smokeCommand.displayName,
  suiteMode,
  suites: suitesForMode(suiteMode),
  result: "passed",
  durationMs,
  environment: {
    hostConfigured: envConfigured("APPALOFT_E2E_SSH_HOST"),
    privateKeyConfigured: envConfigured("APPALOFT_E2E_SSH_PRIVATE_KEY"),
    portConfigured: envConfigured("APPALOFT_E2E_SSH_PORT"),
    usernameConfigured: envConfigured("APPALOFT_E2E_SSH_USERNAME"),
    publicRouteHostConfigured: envConfigured("APPALOFT_E2E_PUBLIC_ROUTE_HOST"),
  },
};

await ensureDir(dirname(outputPath));
await Bun.write(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`SSH release-readiness evidence written to ${outputPath}.`);
