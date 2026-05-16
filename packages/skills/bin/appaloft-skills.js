#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundledSkillsRoot = join(packageRoot, "skills");

const skillAliases = new Map([
  ["deploy", "appaloft-deploy"],
  ["appaloft-deploy", "appaloft-deploy"],
]);

const helpText = `Installs Appaloft agent skills. This command copies skill files only; it does not run deployments.

Usage:
  appaloft-skills install deploy [--target codex|directory] [--path <dir>] [--force] [--dry-run]
  appaloft-skills list

Examples:
  npx @appaloft/skills install deploy
  npx @appaloft/skills install deploy --target codex --force
  npx @appaloft/skills install deploy --target directory --path ./.agents/skills
`;

function parseArgs(argv) {
  const [command, skill = "", ...rest] = argv;
  const options = {
    command: !command || command === "--help" || command === "-h" ? "help" : command,
    skill,
    target: "codex",
    force: false,
    dryRun: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    switch (token) {
      case "--target":
        options.target = readOptionValue(rest, ++index, token);
        break;
      case "--path":
        options.path = readOptionValue(rest, ++index, token);
        break;
      case "--force":
        options.force = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.command = "help";
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return options;
}

function readOptionValue(values, index, flag) {
  const value = values[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function availableSkills() {
  if (!existsSync(bundledSkillsRoot)) {
    return [];
  }
  return readdirSync(bundledSkillsRoot)
    .filter((entry) => statSync(join(bundledSkillsRoot, entry)).isDirectory())
    .sort();
}

function resolveSkillName(requestedSkill) {
  const skillName = skillAliases.get(requestedSkill);
  if (!skillName) {
    throw new Error(
      `Unknown skill "${requestedSkill}". Available skills: ${availableSkills().join(", ")}`,
    );
  }
  return skillName;
}

function resolveTargetRoot(options, env = process.env) {
  if (options.path) {
    return resolve(options.path);
  }

  if (options.target === "codex") {
    return join(env.CODEX_HOME || join(homedir(), ".codex"), "skills");
  }

  if (options.target === "directory") {
    throw new Error("--target directory requires --path <dir>");
  }

  throw new Error(`Unsupported target "${options.target}". Use codex or directory.`);
}

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }
    if (entry.isFile()) {
      copyFileSync(sourcePath, destinationPath);
    }
  }
}

function installSkill(options) {
  const skillName = resolveSkillName(options.skill);
  const source = join(bundledSkillsRoot, skillName);
  const targetRoot = resolveTargetRoot(options);
  const destination = join(targetRoot, basename(source));

  if (!existsSync(source)) {
    throw new Error(`Bundled skill is missing: ${source}`);
  }

  if (options.dryRun) {
    return { skillName, source, destination, installed: false };
  }

  if (existsSync(destination)) {
    if (!options.force) {
      throw new Error(`Skill already exists at ${destination}. Re-run with --force to replace it.`);
    }
    rmSync(destination, { recursive: true, force: true });
  }

  mkdirSync(targetRoot, { recursive: true });
  copyDirectory(source, destination);
  return { skillName, source, destination, installed: true };
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.command === "help") {
    console.log(helpText.trim());
    return 0;
  }

  if (options.command === "list") {
    console.log(availableSkills().join("\n"));
    return 0;
  }

  if (options.command === "install") {
    const result = installSkill(options);
    const action = result.installed ? "Installed" : "Would install";
    console.log(`${action} skill ${result.skillName} to ${result.destination}`);
    return 0;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

function isMainModule() {
  return import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
}

if (isMainModule()) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { availableSkills, installSkill, parseArgs, resolveTargetRoot, run };
