import { readFileSync } from "node:fs";
import {
  BindRepositoryCommand,
  CreateAgentProfileCommand,
  CreateAutomationRuleCommand,
  DisableAgentProfileCommand,
  DisableAutomationRuleCommand,
  ListAgentProfilesQuery,
  ListAutomationRulesQuery,
  ListRepositoryBindingsQuery,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";
import { optionalValue, runCommand, runQuery } from "../runtime.js";

const inputFile = Args.text({ name: "input-file" });
const projectId = Options.text("project-id").pipe(Options.optional);
const ruleId = Args.text({ name: "rule-id" });
const profileId = Args.text({ name: "profile-id" });

function jsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const repositoryBind = EffectCommand.make("bind", { inputFile }, ({ inputFile: path }) =>
  runCommand(BindRepositoryCommand.create(jsonFile(path))),
);
const repositoryList = EffectCommand.make("list", { projectId }, ({ projectId: project }) =>
  runQuery(
    ListRepositoryBindingsQuery.create({
      ...(optionalValue(project) ? { projectId: optionalValue(project) } : {}),
    }),
  ),
);
const repository = EffectCommand.make("repository").pipe(
  EffectCommand.withDescription("Manage numeric GitHub Repository bindings"),
  EffectCommand.withSubcommands([repositoryBind, repositoryList]),
);

const ruleCreate = EffectCommand.make("create", { inputFile }, ({ inputFile: path }) =>
  runCommand(CreateAutomationRuleCommand.create(jsonFile(path))),
);
const ruleList = EffectCommand.make("list", { projectId }, ({ projectId: project }) =>
  runQuery(
    ListAutomationRulesQuery.create({
      ...(optionalValue(project) ? { projectId: optionalValue(project) } : {}),
    }),
  ),
);
const ruleDisable = EffectCommand.make("disable", { ruleId }, ({ ruleId }) =>
  runCommand(DisableAutomationRuleCommand.create({ ruleId })),
);
const rule = EffectCommand.make("rule").pipe(
  EffectCommand.withDescription("Manage Project Automation Rules"),
  EffectCommand.withSubcommands([ruleCreate, ruleList, ruleDisable]),
);

const profileCreate = EffectCommand.make("create", { inputFile }, ({ inputFile: path }) =>
  runCommand(CreateAgentProfileCommand.create(jsonFile(path))),
);
const profileList = EffectCommand.make("list", {}, () =>
  runQuery(ListAgentProfilesQuery.create({})),
);
const profileDisable = EffectCommand.make("disable", { profileId }, ({ profileId }) =>
  runCommand(DisableAgentProfileCommand.create({ profileId })),
);
const profile = EffectCommand.make("profile").pipe(
  EffectCommand.withDescription("Manage Agent Profiles without exposing credentials"),
  EffectCommand.withSubcommands([profileCreate, profileList, profileDisable]),
);

export const githubAgentCommand = EffectCommand.make("github-agent").pipe(
  EffectCommand.withDescription("Configure GitHub-triggered Agent Tasks"),
  EffectCommand.withSubcommands([repository, rule, profile]),
);
