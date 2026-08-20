import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Command as AppCommand,
  type Query as AppQuery,
  CreateProjectCommand,
  ShowProjectQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { Effect, Layer } from "effect";
import {
  fileFolderProjectLinkStore,
  folderOccupancyIdentity,
  memoryFolderProjectLinkStore,
  readFolderProjectLink,
  writeFolderProjectLink,
} from "../src/folder-project-link.js";
import {
  decideFolderProjectOnboarding,
  ensureFolderProjectOnboarding,
  folderOnboardingCanPrompt,
  folderOnboardingStatusLine,
  peekThisFolderGitIdentity,
  persistFolderProjectAssociation,
} from "../src/folder-project-onboarding.js";
import { CliRuntime } from "../src/runtime.js";

describe("folder project onboarding", () => {
  test("[FOLDER-ONBOARD-001] unlinked no-git cwd creates a project named after the directory", () => {
    const decision = decideFolderProjectOnboarding({
      directoryName: "hello-static",
      projects: [],
      canPrompt: false,
    });
    expect(decision).toEqual({
      kind: "create",
      name: "hello-static",
      identity: folderOccupancyIdentity("hello-static"),
    });
  });

  test("[WS-REMOTE-PROGRESS-201] peekThisFolderGitIdentity ignores an ancestor examples remote", async () => {
    const ancestor = await mkdtemp(join(tmpdir(), "appaloft-peek-ancestor-"));
    const child = join(ancestor, "scratch");
    await mkdir(child);
    const git = async (args: readonly string[], cwd = ancestor) => {
      const result = await Bun.spawn(["git", ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      }).exited;
      if (result !== 0) throw new Error(`git ${args.join(" ")} failed`);
    };
    try {
      await git(["init"]);
      await git(["remote", "add", "origin", "https://github.com/appaloft/examples.git"]);
      expect(await peekThisFolderGitIdentity(child)).toBeUndefined();
    } finally {
      await rm(ancestor, { recursive: true, force: true });
    }
  });

  test("[FOLDER-ONBOARD-002] git remote cwd binds to that identity", () => {
    const decision = decideFolderProjectOnboarding({
      directoryName: "checkout",
      gitIdentity: "github.com/acme/api",
      projects: [],
      canPrompt: false,
    });
    expect(decision).toEqual({
      kind: "create",
      name: "api",
      identity: "github.com/acme/api",
    });
  });

  test("[FOLDER-ONBOARD-002] git remote reuses the matching repository binding", () => {
    const decision = decideFolderProjectOnboarding({
      directoryName: "checkout",
      gitIdentity: "github.com/acme/api",
      projects: [{ id: "prj_other", name: "other" }],
      binding: {
        projectId: "prj_api",
        repositoryIdentity: "github.com/acme/api",
        status: "active",
      },
      canPrompt: false,
    });
    expect(decision).toEqual({
      kind: "reuse-binding",
      projectId: "prj_api",
      identity: "github.com/acme/api",
    });
  });

  test("[FOLDER-ONBOARD-003] second command reuses the persisted folder link", async () => {
    const store = memoryFolderProjectLinkStore();
    const cwd = "/tmp/hello-static";
    await writeFolderProjectLink(
      {
        cwd,
        projectId: "prj_hello",
        identity: folderOccupancyIdentity("hello-static"),
        projectName: "hello-static",
      },
      store,
    );
    const link = await readFolderProjectLink(cwd, store);
    const decision = decideFolderProjectOnboarding({
      linkedProjectId: link?.projectId,
      directoryName: "hello-static",
      projects: [{ id: "prj_hello", name: "hello-static", lifecycleStatus: "active" }],
      canPrompt: false,
    });
    expect(decision).toEqual({
      kind: "reuse-link",
      projectId: "prj_hello",
      identity: folderOccupancyIdentity("hello-static"),
    });
  });

  test("[FOLDER-ONBOARD-004] switching project changes the stored folder link", async () => {
    const store = memoryFolderProjectLinkStore();
    const cwd = "/tmp/hello-static";
    await writeFolderProjectLink(
      { cwd, projectId: "prj_one", identity: folderOccupancyIdentity("hello-static") },
      store,
    );
    await writeFolderProjectLink(
      { cwd, projectId: "prj_two", identity: folderOccupancyIdentity("hello-static") },
      store,
    );
    expect((await readFolderProjectLink(cwd, store))?.projectId).toBe("prj_two");
  });

  test("[FOLDER-ONBOARD-005] exactly one project is used when the folder is unlinked", () => {
    const decision = decideFolderProjectOnboarding({
      directoryName: "scratch",
      projects: [{ id: "prj_only", name: "Only", lifecycleStatus: "active" }],
      canPrompt: true,
    });
    expect(decision).toEqual({
      kind: "use-only-project",
      projectId: "prj_only",
      identity: folderOccupancyIdentity("scratch"),
    });
  });

  test("[FOLDER-ONBOARD-006] CI and noninteractive environments do not prompt", () => {
    expect(folderOnboardingCanPrompt({ CI: "true" })).toBe(false);
    expect(folderOnboardingCanPrompt({ APPALOFT_NONINTERACTIVE: "true" })).toBe(false);
    expect(folderOnboardingCanPrompt({ CI: "true" }, true)).toBe(true);
  });

  test("[FOLDER-ONBOARD-003] persist association writes the folder link without creating a project", async () => {
    const home = await mkdtemp(join(tmpdir(), "appaloft-folder-persist-"));
    const cwd = join(home, "notes");
    try {
      const store = fileFolderProjectLinkStore({ APPALOFT_HOME: home });
      await persistFolderProjectAssociation({
        cwd,
        projectId: "prj_from_config",
        store,
        peekGitIdentity: async () => undefined,
      });
      expect((await readFolderProjectLink(cwd, store))?.projectId).toBe("prj_from_config");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("[FOLDER-ONBOARD-006] several projects prompt on TTY and create on --yes", () => {
    const projects = [
      { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
      { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
    ];
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects,
        canPrompt: true,
      }).kind,
    ).toBe("prompt");
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects,
        canPrompt: true,
        yes: true,
      }),
    ).toEqual({
      kind: "create",
      name: "scratch",
      identity: folderOccupancyIdentity("scratch"),
    });
  });

  test("[FOLDER-ONBOARD-007] git is correspondence, not a create gate", () => {
    const noGit = decideFolderProjectOnboarding({
      directoryName: "notes",
      projects: [],
      canPrompt: false,
    });
    expect(noGit.kind).toBe("create");
    expect(noGit.identity.startsWith("folder.local/")).toBe(true);
  });

  test("[FOLDER-ONBOARD-008] status lines name create and reuse", () => {
    expect(
      folderOnboardingStatusLine({
        projectId: "prj_1",
        projectName: "notes",
        identity: folderOccupancyIdentity("notes"),
        created: true,
        reused: false,
      }),
    ).toContain("Created project");
    expect(
      folderOnboardingStatusLine({
        projectId: "prj_1",
        projectName: "notes",
        identity: folderOccupancyIdentity("notes"),
        created: false,
        reused: true,
      }),
    ).toContain("Using linked project");
  });

  test("[FOLDER-ONBOARD-003] file store persists the link for the same cwd", async () => {
    const home = await mkdtemp(join(tmpdir(), "appaloft-folder-link-"));
    try {
      const store = fileFolderProjectLinkStore({ APPALOFT_HOME: home });
      const cwd = join(home, "hello-static");
      await writeFolderProjectLink(
        {
          cwd,
          projectId: "prj_hello",
          identity: folderOccupancyIdentity("hello-static"),
        },
        store,
      );
      expect((await readFolderProjectLink(cwd, store))?.projectId).toBe("prj_hello");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  test("[FOLDER-ONBOARD-001][FOLDER-ONBOARD-003][FOLDER-ONBOARD-008] Effect onboarding creates then reuses the folder link", async () => {
    const store = memoryFolderProjectLinkStore();
    const commands: AppCommand<unknown>[] = [];
    const status: string[] = [];
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "prj_notes" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message instanceof ShowProjectQuery) {
          return ok({
            id: "prj_notes",
            name: "notes",
            slug: "notes",
            lifecycleStatus: "active",
          } as T);
        }
        return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
      },
    } as never);

    const first = await Effect.runPromise(
      Effect.provide(
        ensureFolderProjectOnboarding({
          cwd: "/tmp/notes",
          store,
          peekGitIdentity: async () => undefined,
          writeStatus: (text) => {
            status.push(text);
          },
        }),
        runtime,
      ),
    );
    expect(first).toMatchObject({
      projectId: "prj_notes",
      created: true,
      identity: folderOccupancyIdentity("notes"),
    });
    expect(commands[0]).toBeInstanceOf(CreateProjectCommand);
    expect(commands[0]).toMatchObject({ name: "notes" });
    expect(status.some((line) => line.includes("Created project"))).toBe(true);

    const second = await Effect.runPromise(
      Effect.provide(
        ensureFolderProjectOnboarding({
          cwd: "/tmp/notes",
          store,
          peekGitIdentity: async () => undefined,
          writeStatus: (text) => {
            status.push(text);
          },
        }),
        runtime,
      ),
    );
    expect(second.created).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.projectId).toBe("prj_notes");
    expect(commands).toHaveLength(1);
    expect((await readFolderProjectLink("/tmp/notes", store))?.projectId).toBe("prj_notes");
  });

  test("[FOLDER-ONBOARD-002] Effect onboarding binds a git remote identity", async () => {
    const store = memoryFolderProjectLinkStore();
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: false, on: () => undefined },
        stdout: { isTTY: false, write: () => true },
        stderr: { isTTY: false, write: () => true },
      },
      executeCommand: async <T>() => ok({ id: "prj_api" } as T),
      executeQuery: async <T>() => ok({ items: [], total: 0, limit: 100, offset: 0 } as T),
    } as never);

    const result = await Effect.runPromise(
      Effect.provide(
        ensureFolderProjectOnboarding({
          cwd: "/tmp/checkout",
          store,
          peekGitIdentity: async () => "github.com/acme/api",
          writeStatus: () => undefined,
        }),
        runtime,
      ),
    );
    expect(result).toMatchObject({
      projectId: "prj_api",
      identity: "github.com/acme/api",
      created: true,
    });
  });
});
