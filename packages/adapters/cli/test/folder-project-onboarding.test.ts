import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type Command as AppCommand,
  type Query as AppQuery,
  CreateProjectCommand,
  ListProjectsQuery,
  ShowProjectQuery,
} from "@appaloft/application";
import { err, ok } from "@appaloft/core";
import { Effect, Layer } from "effect";
import {
  fileFolderProjectLinkStore,
  folderOccupancyIdentity,
  memoryFolderProjectLinkStore,
  readFolderProjectLink,
  writeFolderProjectLink,
} from "../src/folder-project-link.js";
import {
  CODE_SESSION_INQUIRE_CONTINUE,
  codeSessionInquireCreateMessage,
  decideFolderProjectOnboarding,
  ensureFolderProjectOnboarding,
  folderOnboardingCancelledError,
  folderOnboardingCanPrompt,
  folderOnboardingStatusLine,
  isFolderOnboardingCancelled,
  peekThisFolderGitIdentity,
  persistFolderProjectAssociation,
  quitCodeSessionOnCancel,
  withImmediateSigintExit,
} from "../src/folder-project-onboarding.js";
import { CliRuntime, formatHumanCliError } from "../src/runtime.js";
import {
  setWorkspaceTuiScrollbackWriter,
  WORKSPACE_TUI_LEAVE_ALT_SCREEN,
} from "../src/workspace-tui-launch.js";

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

  test("[FOLDER-ONBOARD-009] code auto-creates an unlinked no-git folder and never selects", () => {
    const projects = [
      { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
      { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
    ];
    expect(
      decideFolderProjectOnboarding({
        directoryName: "p0-code-pi-nogit",
        projects,
        canPrompt: true,
        promptPolicy: "auto-create",
      }),
    ).toEqual({
      kind: "create",
      name: "p0-code-pi-nogit",
      identity: folderOccupancyIdentity("p0-code-pi-nogit"),
    });
    expect(
      decideFolderProjectOnboarding({
        directoryName: "p0-code-pi-nogit",
        projects,
        canPrompt: true,
        yes: true,
      }),
    ).toEqual({
      kind: "create",
      name: "p0-code-pi-nogit",
      identity: folderOccupancyIdentity("p0-code-pi-nogit"),
    });
  });

  test("[FOLDER-ONBOARD-009] code session inquires before TUI and does not pick from a project list", () => {
    const projects = [
      { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
      { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
    ];
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects: [],
        canPrompt: true,
        promptPolicy: "pre-tui-inquire",
      }),
    ).toEqual({
      kind: "inquire",
      name: "scratch",
      identity: folderOccupancyIdentity("scratch"),
    });
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects,
        canPrompt: true,
        promptPolicy: "pre-tui-inquire",
      }),
    ).toEqual({
      kind: "inquire",
      name: "scratch",
      identity: folderOccupancyIdentity("scratch"),
    });
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects,
        canPrompt: true,
        yes: true,
        promptPolicy: "pre-tui-inquire",
      }),
    ).toEqual({
      kind: "create",
      name: "scratch",
      identity: folderOccupancyIdentity("scratch"),
    });
    expect(
      decideFolderProjectOnboarding({
        directoryName: "scratch",
        projects: [{ id: "prj_only", name: "Only", lifecycleStatus: "active" }],
        canPrompt: true,
        promptPolicy: "pre-tui-inquire",
      }),
    ).toEqual({
      kind: "use-only-project",
      projectId: "prj_only",
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

  test("[FOLDER-ONBOARD-009] Effect code auto-create never Prompt.selects an unlinked no-git folder", async () => {
    const store = memoryFolderProjectLinkStore();
    const commands: AppCommand<unknown>[] = [];
    const status: string[] = [];
    let selected = 0;
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "prj_p0" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message instanceof ListProjectsQuery) {
          return ok({
            items: [
              { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
              { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
            ],
            total: 2,
            limit: 100,
            offset: 0,
          } as T);
        }
        return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
      },
    } as never);

    const result = await Effect.runPromise(
      Effect.provide(
        ensureFolderProjectOnboarding({
          cwd: "/tmp/p0-code-pi-nogit",
          store,
          canPrompt: true,
          yes: true,
          promptPolicy: "auto-create",
          peekGitIdentity: async () => undefined,
          interaction: {
            text: () => {
              throw new Error("code session must not collect free text");
            },
            select: () => {
              selected += 1;
              throw new Error("code TTY must not Prompt.select");
            },
            confirm: () => {
              throw new Error("code TTY must auto-create instead of inquiring");
            },
          },
          writeStatus: (text) => {
            status.push(text);
          },
        }),
        runtime,
      ),
    );
    expect(selected).toBe(0);
    expect(commands[0]).toBeInstanceOf(CreateProjectCommand);
    expect(result).toMatchObject({
      projectId: "prj_p0",
      created: true,
      identity: folderOccupancyIdentity("p0-code-pi-nogit"),
    });
    expect(status.join("")).not.toMatch(/This folder is not linked/u);
    expect(status.join("")).not.toMatch(/occupancy/iu);
  });

  test("[FOLDER-ONBOARD-009] Effect code-session inquire creates the directory project after Continue", async () => {
    const store = memoryFolderProjectLinkStore();
    const commands: AppCommand<unknown>[] = [];
    const confirms: string[] = [];
    let selected = 0;
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      executeCommand: async <T>(message: AppCommand<T>) => {
        commands.push(message as AppCommand<unknown>);
        return ok({ id: "prj_scratch" } as T);
      },
      executeQuery: async <T>(message: AppQuery<T>) => {
        if (message instanceof ListProjectsQuery) {
          return ok({
            items: [
              { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
              { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
            ],
            total: 2,
            limit: 100,
            offset: 0,
          } as T);
        }
        return ok({ items: [], total: 0, limit: 100, offset: 0 } as T);
      },
    } as never);

    const result = await Effect.runPromise(
      Effect.provide(
        ensureFolderProjectOnboarding({
          cwd: "/tmp/scratch",
          store,
          canPrompt: true,
          promptPolicy: "pre-tui-inquire",
          peekGitIdentity: async () => undefined,
          interaction: {
            text: () => {
              throw new Error("code session must not collect free text");
            },
            select: () => {
              selected += 1;
              throw new Error("code session must not select a project");
            },
            confirm: (input) => {
              confirms.push(input.message);
              return Effect.succeed(true);
            },
          },
          writeStatus: () => undefined,
        }),
        runtime,
      ),
    );
    expect(selected).toBe(0);
    expect(confirms).toEqual([
      CODE_SESSION_INQUIRE_CONTINUE,
      codeSessionInquireCreateMessage("scratch"),
    ]);
    expect(commands[0]).toBeInstanceOf(CreateProjectCommand);
    expect(result).toMatchObject({
      projectId: "prj_scratch",
      created: true,
      identity: folderOccupancyIdentity("scratch"),
    });
  });

  test("[WS-REMOTE-COMPAT-221] Creating project path prints operationCheckDenied with a next step", async () => {
    const store = memoryFolderProjectLinkStore();
    const denied = {
      code: "operation_check_denied",
      category: "user" as const,
      message: "Operation check denied",
      retryable: false,
      details: {
        operationKey: "projects.create",
        operationName: "CreateProjectCommand",
        reason: "missing-organization",
        checkKey: "cloud.admission",
        checkKind: "authorization",
      },
    };
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      executeCommand: async <T>() => err(denied) as never,
      executeQuery: async <T>() => ok({ items: [], total: 0, limit: 100, offset: 0 } as T),
    } as never);

    const result = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          ensureFolderProjectOnboarding({
            cwd: "/tmp/nux-722327ee-unlinked",
            store,
            canPrompt: true,
            promptPolicy: "pre-tui-inquire",
            peekGitIdentity: async () => undefined,
            interaction: {
              text: () => {
                throw new Error("code session must not collect free text");
              },
              select: () => {
                throw new Error("code session must not select a project");
              },
              confirm: () => Effect.succeed(true),
            },
            writeStatus: () => undefined,
          }),
          runtime,
        ),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag !== "Left") {
      throw new Error("expected Creating project to fail");
    }
    const printed = formatHumanCliError(result.left);
    expect(printed.trim()).not.toBe("Operation check denied");
    expect(printed).toContain("Cloud denied projects.create");
    expect(printed).toContain("missing-organization");
    expect(printed).toContain("cloud.admission");
    expect(printed).toMatch(/login|organization|retry|Cloud/i);
    expect(printed.toLowerCase()).not.toContain("occupancy");
    expect(printed).not.toContain("sbx_");
    expect(await readFolderProjectLink("/tmp/nux-722327ee-unlinked", store)).toBeUndefined();
  });

  test("[FOLDER-ONBOARD-009] code inquire ^c / decline quits immediately without Workspace CLI hang", async () => {
    const store = memoryFolderProjectLinkStore();
    let created = 0;
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      executeCommand: async <T>() => {
        created += 1;
        return ok({ id: "prj_scratch" } as T);
      },
      executeQuery: async <T>() =>
        ok({
          items: [
            { id: "prj_a", name: "Alpha", lifecycleStatus: "active" },
            { id: "prj_b", name: "Beta", lifecycleStatus: "active" },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        } as T),
    } as never);

    const outcome = await Effect.runPromise(
      Effect.either(
        Effect.provide(
          ensureFolderProjectOnboarding({
            cwd: "/tmp/scratch",
            store,
            canPrompt: true,
            promptPolicy: "pre-tui-inquire",
            peekGitIdentity: async () => undefined,
            interaction: {
              text: () => {
                throw new Error("code session must not collect free text");
              },
              select: () => {
                throw new Error("code session must not select a project");
              },
              confirm: () => Effect.succeed(false),
            },
            writeStatus: () => undefined,
          }),
          runtime,
        ),
      ),
    );
    expect(created).toBe(0);
    expect(outcome._tag).toBe("Left");
    if (outcome._tag === "Left") {
      expect(isFolderOnboardingCancelled(outcome.left)).toBeTrue();
      expect(String(outcome.left.message)).toBe("Cancelled");
      expect(String(outcome.left.message)).not.toContain("Workspace CLI operation failed");
    }
    expect(folderOnboardingCancelledError().details?.code).toBe("folder_onboarding_cancelled");
    const source = await Bun.file(
      new URL("../src/folder-project-onboarding.ts", import.meta.url),
    ).text();
    expect(source).toContain("process.exit(130)");
    expect(source).toContain("SIGINT");
    expect(source).toContain("export async function withImmediateSigintExit");
    expect(source).toContain("quitCodeSessionOnCancel");
    expect(source).toContain("restoreWorkspaceTuiScrollback");
    expect(isFolderOnboardingCancelled({ _tag: "Interrupt" })).toBeTrue();
    expect(isFolderOnboardingCancelled({ _tag: "Quit" })).toBeTrue();
    expect(folderOnboardingCancelledError().message).toBe("Cancelled");
    expect(folderOnboardingCancelledError().message).not.toContain(
      "Workspace CLI operation failed",
    );
  });

  test("[FOLDER-ONBOARD-009] forced select ^c restores TTY and exits without a 45s workspace timeout", async () => {
    const store = memoryFolderProjectLinkStore();
    const restored: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      restored.push(text);
    });
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;
    let selected = 0;
    const runtime = Layer.succeed(CliRuntime, {
      version: "test",
      startServer: async () => {},
      terminalIO: {
        stdin: { isTTY: true, on: () => undefined },
        stdout: { isTTY: true, write: () => true },
        stderr: { isTTY: true, write: () => true },
      },
      executeCommand: async <T>() => ok({ id: "prj_forced" } as T),
      executeQuery: async <T>() =>
        ok({
          items: [
            { id: "prj_vlhs6pf8v4yp", name: "nux-code-silence-cwd", lifecycleStatus: "active" },
            { id: "prj_7fky4yjn1l1c", name: "leftover", lifecycleStatus: "active" },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        } as T),
    } as never);
    let selectStarted: (() => void) | undefined;
    const startedSelect = new Promise<void>((resolve) => {
      selectStarted = resolve;
    });
    const started = Date.now();
    try {
      void withImmediateSigintExit(() =>
        Effect.runPromise(
          Effect.provide(
            ensureFolderProjectOnboarding({
              cwd: "/tmp/nux-code-unlinked-cwd",
              store,
              canPrompt: true,
              promptPolicy: "allow-select",
              peekGitIdentity: async () => undefined,
              interaction: {
                text: () => {
                  throw new Error("forced-select fixture must not collect free text");
                },
                select: () => {
                  selected += 1;
                  selectStarted?.();
                  return Effect.never;
                },
                confirm: () => {
                  throw new Error("forced-select fixture must not inquire");
                },
              },
              writeStatus: () => undefined,
            }),
            runtime,
          ),
        ),
      );
      await startedSelect;
      process.emit("SIGINT");
      expect(selected).toBe(1);
      expect(exitCode).toBe(130);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(restored.join("")).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
      expect(restored.join("")).toContain("\x1b[?1049l");
      expect(restored.join("")).toContain("\n");
    } finally {
      process.exit = originalExit;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[FOLDER-ONBOARD-009] forced select stdin ^C restores TTY without Workspace CLI hang", async () => {
    const restored: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      restored.push(text);
    });
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;
    const started = Date.now();
    try {
      void withImmediateSigintExit(() => new Promise(() => undefined));
      process.stdin.emit("data", Buffer.from("\u0003"));
      expect(exitCode).toBe(130);
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(restored.join("")).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
    } finally {
      process.exit = originalExit;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
  });

  test("[FOLDER-ONBOARD-009] quitCodeSessionOnCancel leaves alt-screen before exit 130", () => {
    const restored: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      restored.push(text);
    });
    const originalExit = process.exit;
    let exitCode: number | undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
    }) as typeof process.exit;
    try {
      quitCodeSessionOnCancel();
      expect(exitCode).toBe(130);
      expect(restored.join("")).toContain(WORKSPACE_TUI_LEAVE_ALT_SCREEN);
      expect(restored.join("")).toContain("\x1b[?25h");
    } finally {
      process.exit = originalExit;
      setWorkspaceTuiScrollbackWriter(undefined);
    }
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
