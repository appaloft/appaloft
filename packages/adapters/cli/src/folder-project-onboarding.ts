import { existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

import {
  CreateProjectCommand,
  ListProjectsQuery,
  ShowProjectQuery,
  ShowRepositoryBindingQuery,
} from "@appaloft/application";
import { domainError } from "@appaloft/core";
import { Effect } from "effect";

import {
  type FolderProjectLink,
  type FolderProjectLinkEnvironment,
  type FolderProjectLinkStore,
  fileFolderProjectLinkStore,
  folderDirectoryName,
  folderOccupancyIdentity,
  isFolderOccupancyIdentity,
  normalizeFolderCwd,
  readFolderProjectLink,
  writeFolderProjectLink,
} from "./folder-project-link.js";
import { type CliInteraction } from "./interaction.js";
import {
  normalizeWorkspaceRepositoryRemote,
  type WorkspaceGitCommandRunner,
} from "./local-git-workspace-context.js";
import { CliRuntime, resultToEffect } from "./runtime.js";

export interface FolderOnboardingProject {
  readonly id: string;
  readonly name: string;
  readonly slug?: string;
  readonly lifecycleStatus?: string;
}

export interface FolderOnboardingBinding {
  readonly projectId: string;
  readonly repositoryIdentity: string;
  readonly status: string;
}

export type FolderOnboardingDecision =
  | { readonly kind: "reuse-link"; readonly projectId: string; readonly identity: string }
  | { readonly kind: "reuse-binding"; readonly projectId: string; readonly identity: string }
  | { readonly kind: "reuse-named"; readonly projectId: string; readonly identity: string }
  | { readonly kind: "use-only-project"; readonly projectId: string; readonly identity: string }
  | { readonly kind: "create"; readonly name: string; readonly identity: string }
  | { readonly kind: "inquire"; readonly name: string; readonly identity: string }
  | {
      readonly kind: "prompt";
      readonly name: string;
      readonly identity: string;
      readonly projects: readonly FolderOnboardingProject[];
    };

export interface FolderOnboardingResult {
  readonly projectId: string;
  readonly projectName?: string;
  readonly identity: string;
  readonly created: boolean;
  readonly reused: boolean;
}

function activeProjects(projects: readonly FolderOnboardingProject[]): FolderOnboardingProject[] {
  return projects.filter((project) => (project.lifecycleStatus ?? "active") === "active");
}

function projectNameFromIdentity(identity: string, directoryName: string): string {
  const segment = identity
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.git$/u, "");
  return segment?.trim() || directoryName;
}

function findNamedProject(
  projects: readonly FolderOnboardingProject[],
  name: string,
): FolderOnboardingProject | undefined {
  const needle = name.trim().toLowerCase();
  return activeProjects(projects).find(
    (project) =>
      project.name.trim().toLowerCase() === needle || project.slug?.trim().toLowerCase() === needle,
  );
}

export type FolderOnboardingPromptPolicy = "allow-select" | "pre-tui-inquire";

export const FOLDER_ONBOARDING_CANCELLED_CODE = "folder_onboarding_cancelled";
export const CODE_SESSION_INQUIRE_CONTINUE = "Continue";

export function codeSessionInquireCreateMessage(directoryName: string): string {
  return `Create default project ${directoryName} and link this directory?`;
}

export function folderOnboardingCancelledError() {
  return domainError.validation("Cancelled", {
    phase: "folder-project-onboarding",
    code: FOLDER_ONBOARDING_CANCELLED_CODE,
  });
}

export function isFolderOnboardingCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as {
    readonly details?: { readonly code?: unknown };
    readonly _tag?: unknown;
    readonly message?: unknown;
  };
  if (record.details?.code === FOLDER_ONBOARDING_CANCELLED_CODE) return true;
  if (record._tag === "Quit" || record._tag === "Interrupt") return true;
  return false;
}

export function withImmediateInquireCancel<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const onSigint = () => {
        process.exit(130);
      };
      process.once("SIGINT", onSigint);
      return onSigint;
    }),
    () => effect,
    (onSigint) =>
      Effect.sync(() => {
        process.off("SIGINT", onSigint);
      }),
  );
}

export function decideFolderProjectOnboarding(input: {
  readonly linkedProjectId?: string;
  readonly gitIdentity?: string;
  readonly directoryName: string;
  readonly projects: readonly FolderOnboardingProject[];
  readonly binding?: FolderOnboardingBinding | null;
  readonly canPrompt: boolean;
  readonly yes?: boolean;
  readonly promptPolicy?: FolderOnboardingPromptPolicy;
}): FolderOnboardingDecision {
  const identity = input.gitIdentity ?? folderOccupancyIdentity(input.directoryName);
  const createName = projectNameFromIdentity(identity, input.directoryName);
  const projects = activeProjects(input.projects);

  if (input.linkedProjectId) {
    const linked = projects.find((project) => project.id === input.linkedProjectId);
    if (linked) {
      return { kind: "reuse-link", projectId: linked.id, identity };
    }
  }

  if (input.gitIdentity && input.binding?.status === "active") {
    return {
      kind: "reuse-binding",
      projectId: input.binding.projectId,
      identity: input.gitIdentity,
    };
  }

  if (input.gitIdentity) {
    const named = findNamedProject(projects, createName);
    if (named) return { kind: "reuse-named", projectId: named.id, identity };
    return { kind: "create", name: createName, identity };
  }

  if (projects.length === 1 && projects[0]) {
    return { kind: "use-only-project", projectId: projects[0].id, identity };
  }
  if (input.promptPolicy === "pre-tui-inquire") {
    if (input.yes || !input.canPrompt) {
      return { kind: "create", name: createName, identity };
    }
    return { kind: "inquire", name: createName, identity };
  }
  if (projects.length === 0) {
    return { kind: "create", name: createName, identity };
  }
  if (input.canPrompt && !input.yes) {
    return { kind: "prompt", name: createName, identity, projects };
  }
  return { kind: "create", name: createName, identity };
}

export async function peekThisFolderGitIdentity(
  cwd: string,
  runGit?: WorkspaceGitCommandRunner,
): Promise<string | undefined> {
  const root = normalizeFolderCwd(cwd);
  if (!existsSync(join(root, ".git"))) return undefined;
  return peekWorkspaceGitIdentity(root, runGit);
}

export async function peekWorkspaceGitIdentity(
  cwd: string,
  runGit?: WorkspaceGitCommandRunner,
): Promise<string | undefined> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const git =
    runGit ??
    (async ({ args, cwd: gitCwd }: { args: readonly string[]; cwd: string }) => {
      const result = await execFileAsync("git", [...args], {
        cwd: gitCwd,
        timeout: 15_000,
        encoding: "utf8",
      });
      return { stdout: result.stdout, stderr: result.stderr };
    });
  try {
    const toplevel = await git({ args: ["rev-parse", "--show-toplevel"], cwd });
    const root = toplevel.stdout.trim();
    if (!root) return undefined;
    const remote = (
      await git({ args: ["config", "--get", "remote.origin.url"], cwd: root }).catch(() => ({
        stdout: "",
        stderr: "",
      }))
    ).stdout.trim();
    if (!remote) return undefined;
    return normalizeWorkspaceRepositoryRemote(remote).identity;
  } catch {
    return undefined;
  }
}

function writeStatus(message: string, write: (text: string) => void): void {
  write(`${message}\n`);
}

export function folderOnboardingStatusLine(result: FolderOnboardingResult): string {
  const name = result.projectName ? `${result.projectName} ` : "";
  if (result.created) return `Created project ${name}(${result.projectId})`;
  if (result.reused) return `Using linked project ${name}(${result.projectId})`;
  return `Linked this folder to ${name}(${result.projectId})`;
}

export function folderOnboardingCanPrompt(
  env: FolderProjectLinkEnvironment = process.env,
  override?: boolean,
): boolean {
  if (override !== undefined) return override;
  if (env.CI === "true" || env.APPALOFT_NONINTERACTIVE === "true") return false;
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function ensureFolderProjectOnboarding(input: {
  readonly cwd?: string;
  readonly yes?: boolean;
  readonly promptPolicy?: FolderOnboardingPromptPolicy;
  readonly explicitProjectId?: string;
  readonly canPrompt?: boolean;
  readonly interaction?: CliInteraction;
  readonly store?: FolderProjectLinkStore;
  readonly env?: FolderProjectLinkEnvironment;
  readonly peekGitIdentity?: (cwd: string) => Promise<string | undefined>;
  readonly writeStatus?: (text: string) => void;
}) {
  return Effect.gen(function* () {
    const cwd = normalizeFolderCwd(input.cwd ?? process.cwd());
    const env = input.env ?? process.env;
    const store = input.store ?? fileFolderProjectLinkStore(env);
    const write =
      input.writeStatus ??
      ((text: string) => {
        process.stderr.write(text);
      });
    const cli = yield* CliRuntime;
    const canPrompt = folderOnboardingCanPrompt(env, input.canPrompt);
    const explicitProjectId = input.explicitProjectId;

    if (explicitProjectId) {
      const shownQuery = ShowProjectQuery.create({ projectId: explicitProjectId });
      if (shownQuery.isErr()) return yield* Effect.fail(shownQuery.error);
      const shown = yield* Effect.promise(() => cli.executeQuery(shownQuery.value));
      if (shown.isErr()) return yield* Effect.fail(shown.error);
      const identity =
        (yield* Effect.promise(() => (input.peekGitIdentity ?? peekWorkspaceGitIdentity)(cwd))) ??
        folderOccupancyIdentity(folderDirectoryName(cwd));
      const link = yield* Effect.promise(() =>
        writeFolderProjectLink(
          {
            cwd,
            projectId: explicitProjectId,
            identity,
            projectName: shown.value.name,
          },
          store,
        ),
      );
      const result: FolderOnboardingResult = {
        projectId: link.projectId,
        identity: link.identity,
        created: false,
        reused: false,
        ...(link.projectName ? { projectName: link.projectName } : {}),
      };
      writeStatus(folderOnboardingStatusLine(result), write);
      return result;
    }

    writeStatus("Resolving project for this folder…", write);
    const existing = yield* Effect.promise(() => readFolderProjectLink(cwd, store));
    const gitIdentity = yield* Effect.promise(() =>
      (input.peekGitIdentity ?? peekWorkspaceGitIdentity)(cwd),
    );
    const identity = gitIdentity ?? folderOccupancyIdentity(folderDirectoryName(cwd));
    if (existing?.projectId) {
      const shownQuery = ShowProjectQuery.create({ projectId: existing.projectId });
      if (shownQuery.isOk()) {
        const shown = yield* Effect.promise(() => cli.executeQuery(shownQuery.value));
        if (shown.isOk() && (shown.value.lifecycleStatus ?? "active") === "active") {
          const link = yield* Effect.promise(() =>
            writeFolderProjectLink(
              {
                cwd,
                projectId: existing.projectId,
                identity,
                projectName: shown.value.name,
              },
              store,
            ),
          );
          const result: FolderOnboardingResult = {
            projectId: link.projectId,
            identity: link.identity,
            created: false,
            reused: true,
            ...(link.projectName ? { projectName: link.projectName } : {}),
          };
          writeStatus(folderOnboardingStatusLine(result), write);
          return result;
        }
      }
    }
    const listedQuery = ListProjectsQuery.create({ lifecycleStatus: "active", limit: 100 });
    if (listedQuery.isErr()) return yield* Effect.fail(listedQuery.error);
    const listed = yield* Effect.promise(() => cli.executeQuery(listedQuery.value));
    if (listed.isErr()) return yield* Effect.fail(listed.error);
    const projects = (listed.value.items ?? []) as FolderOnboardingProject[];

    let binding: FolderOnboardingBinding | null = null;
    if (gitIdentity) {
      const bindingQuery = ShowRepositoryBindingQuery.create({ repositoryIdentity: gitIdentity });
      if (bindingQuery.isOk()) {
        const bound = yield* Effect.promise(() => cli.executeQuery(bindingQuery.value));
        if (bound.isOk()) {
          binding = {
            projectId: bound.value.projectId,
            repositoryIdentity: bound.value.repositoryIdentity,
            status: bound.value.status,
          };
        }
      }
    }

    const decision = decideFolderProjectOnboarding({
      ...(existing?.projectId ? { linkedProjectId: existing.projectId } : {}),
      ...(gitIdentity ? { gitIdentity } : {}),
      directoryName: folderDirectoryName(cwd),
      projects,
      binding,
      canPrompt,
      ...(input.yes ? { yes: true } : {}),
      ...(input.promptPolicy ? { promptPolicy: input.promptPolicy } : {}),
    });

    let projectId: string;
    let projectName: string | undefined;
    let created = false;
    let reused = decision.kind === "reuse-link";

    if (decision.kind === "inquire") {
      const inquire = input.interaction;
      if (!inquire) {
        return yield* Effect.fail(
          domainError.validation("Continue to create a default project for this folder", {
            phase: "folder-project-onboarding",
            guidance: "Pass --yes to create a project named after this directory.",
          }),
        );
      }
      const confirmed = yield* withImmediateInquireCancel(
        Effect.gen(function* () {
          const continued = yield* inquire.confirm({
            message: CODE_SESSION_INQUIRE_CONTINUE,
            defaultValue: true,
          });
          if (!continued) return false;
          return yield* inquire.confirm({
            message: codeSessionInquireCreateMessage(decision.name),
            defaultValue: true,
          });
        }),
      );
      if (!confirmed) {
        return yield* Effect.fail(folderOnboardingCancelledError());
      }
      writeStatus(`Creating project ${decision.name}…`, write);
      const createdProject = yield* createOnboardingProject(decision.name);
      projectId = createdProject.id;
      projectName = decision.name;
      created = true;
    } else if (decision.kind === "prompt") {
      if (input.promptPolicy === "pre-tui-inquire") {
        return yield* Effect.fail(
          domainError.invariant(
            "Code session onboarding must not select a project after TUI start",
            {
              phase: "folder-project-onboarding",
            },
          ),
        );
      }
      if (!input.interaction) {
        return yield* Effect.fail(
          domainError.validation("Choose a project or create one for this folder", {
            phase: "folder-project-onboarding",
            guidance:
              "Pass --yes to create a project named after this directory, or appaloft project use <projectId>.",
          }),
        );
      }
      const choice = yield* input.interaction.select({
        message: "This folder is not linked. Create a project or use an existing one?",
        choices: [
          { title: `Create ${decision.name}`, value: `create:${decision.name}` },
          ...decision.projects.map((project) => ({
            title: `${project.name} (${project.id})`,
            value: `use:${project.id}`,
          })),
        ],
      });
      if (choice.startsWith("create:")) {
        const createdProject = yield* createOnboardingProject(decision.name);
        projectId = createdProject.id;
        projectName = decision.name;
        created = true;
      } else {
        projectId = choice.slice("use:".length);
        projectName = decision.projects.find((project) => project.id === projectId)?.name;
      }
    } else if (decision.kind === "create") {
      writeStatus(`Creating project ${decision.name}…`, write);
      const createdProject = yield* createOnboardingProject(decision.name);
      projectId = createdProject.id;
      projectName = decision.name;
      created = true;
    } else {
      projectId = decision.projectId;
      projectName = projects.find((project) => project.id === projectId)?.name;
      reused = decision.kind === "reuse-link" || decision.kind === "use-only-project";
    }

    const link = yield* Effect.promise(() =>
      writeFolderProjectLink(
        {
          cwd,
          projectId,
          identity: decision.identity,
          ...(projectName ? { projectName } : {}),
        },
        store,
      ),
    );
    const result: FolderOnboardingResult = {
      projectId: link.projectId,
      identity: link.identity,
      created,
      reused,
      ...(link.projectName ? { projectName: link.projectName } : {}),
    };
    writeStatus(folderOnboardingStatusLine(result), write);
    return result;
  });
}

function createdProjectId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("id" in value)) return undefined;
  return typeof value.id === "string" && value.id.length > 0 ? value.id : undefined;
}

function createOnboardingProject(name: string) {
  return Effect.gen(function* () {
    const cli = yield* CliRuntime;
    const command = yield* resultToEffect(CreateProjectCommand.create({ name }));
    const created = yield* Effect.promise(() => cli.executeCommand(command));
    const project = yield* resultToEffect(created);
    const id = createdProjectId(project);
    if (!id) {
      return yield* Effect.fail(
        domainError.invariant("Create project did not return an id", {
          phase: "folder-project-onboarding",
        }),
      );
    }
    return { id };
  });
}

export function resolveFolderLinkedProjectId(
  cwd = process.cwd(),
  store?: FolderProjectLinkStore,
  env?: FolderProjectLinkEnvironment,
) {
  return Effect.gen(function* () {
    const resolvedStore = store ?? fileFolderProjectLinkStore(env ?? process.env);
    const link = yield* Effect.promise(() => readFolderProjectLink(cwd, resolvedStore));
    return link?.projectId;
  });
}

export async function persistFolderProjectAssociation(input: {
  readonly cwd: string;
  readonly projectId: string;
  readonly projectName?: string;
  readonly store?: FolderProjectLinkStore;
  readonly env?: FolderProjectLinkEnvironment;
  readonly peekGitIdentity?: (cwd: string) => Promise<string | undefined>;
}): Promise<FolderProjectLink> {
  const store = input.store ?? fileFolderProjectLinkStore(input.env ?? process.env);
  const identity =
    (await (input.peekGitIdentity ?? peekWorkspaceGitIdentity)(input.cwd)) ??
    folderOccupancyIdentity(folderDirectoryName(input.cwd));
  return writeFolderProjectLink(
    {
      cwd: input.cwd,
      projectId: input.projectId,
      identity,
      ...(input.projectName ? { projectName: input.projectName } : {}),
    },
    store,
  );
}

export function folderOnboardingCwdFromLocator(sourceLocator?: string): string {
  if (!sourceLocator || sourceLocator === ".") return process.cwd();
  if (sourceLocator.includes("://") || sourceLocator.startsWith("git@")) return process.cwd();
  return resolvePath(sourceLocator);
}

export function folderOnboardingLabel(result: FolderOnboardingResult): string {
  return result.projectName ? `${result.projectName} (${result.projectId})` : result.projectId;
}

export { isFolderOccupancyIdentity };
