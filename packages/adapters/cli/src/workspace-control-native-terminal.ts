import { type TerminalSession, type TerminalSessionFrame } from "@appaloft/application";
import { domainError } from "@appaloft/core";

export interface OpenNativeWorkspaceTerminalInput {
  readonly workspaceId: string;
  readonly runtimeId: string;
  readonly argv: readonly string[];
}

export interface OpenedNativeWorkspaceTerminal {
  readonly sessionId: string;
  readonly session: TerminalSession;
}

class TerminalFrameQueue implements AsyncIterable<TerminalSessionFrame> {
  private readonly frames: TerminalSessionFrame[] = [];
  private readonly waiters: Array<(result: IteratorResult<TerminalSessionFrame>) => void> = [];
  private ended = false;

  push(frame: TerminalSessionFrame): void {
    if (this.ended) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: frame });
    else this.frames.push(frame);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) waiter({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<TerminalSessionFrame> {
    return {
      next: () => {
        const frame = this.frames.shift();
        if (frame) return Promise.resolve({ done: false, value: frame });
        if (this.ended) return Promise.resolve({ done: true, value: undefined });
        return new Promise((resolveNext) => this.waiters.push(resolveNext));
      },
    };
  }
}

function validateArgv(argv: readonly string[]): void {
  if (
    argv.length === 0 ||
    argv.length > 64 ||
    argv.some(
      (argument) =>
        !argument || argument.length > 2_048 || argument.includes("\0") || /[\r\n]/u.test(argument),
    )
  ) {
    throw domainError.conflict("Adapter returned an invalid native attach handoff", {
      code: "agent_workspace_native_attach_handoff_invalid",
      phase: "workspace-control-native-terminal",
    });
  }
}

export async function openBunNativeWorkspaceTerminal(
  input: OpenNativeWorkspaceTerminalInput,
): Promise<OpenedNativeWorkspaceTerminal> {
  validateArgv(input.argv);
  if (typeof Bun.Terminal !== "function") {
    throw domainError.infra("Bun Terminal is unavailable", {
      phase: "workspace-control-native-terminal",
      reason: "bun-terminal-unavailable",
    });
  }

  const frames = new TerminalFrameQueue();
  const sessionId = `native:${input.workspaceId}:${input.runtimeId}`;
  const decoder = new TextDecoder();
  let detached = false;
  const terminal = new Bun.Terminal({
    cols: 80,
    rows: 24,
    name: "xterm-256color",
    data: (_terminal, data) => {
      const decoded = decoder.decode(data, { stream: true });
      if (decoded) frames.push({ kind: "output", stream: "stdout", data: decoded });
    },
  });
  terminal.setRawMode(true);
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([...input.argv], {
      terminal,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });
  } catch (error) {
    terminal.close();
    throw error;
  }
  frames.push({ kind: "ready", sessionId });
  void child.exited.then((exitCode) => {
    if (!detached) {
      const remainder = decoder.decode();
      if (remainder) frames.push({ kind: "output", stream: "stdout", data: remainder });
      frames.push({ kind: "closed", reason: "source-ended", exitCode });
    }
    frames.end();
    if (!terminal.closed) terminal.close();
  });

  const detach = async () => {
    if (detached) return;
    detached = true;
    child.kill("SIGTERM");
    if (!terminal.closed) terminal.close();
    frames.end();
  };

  return {
    sessionId,
    session: {
      [Symbol.asyncIterator]: () => frames[Symbol.asyncIterator](),
      write: async (data) => {
        if (!detached && !terminal.closed) terminal.write(data);
      },
      resize: async ({ cols, rows }) => {
        if (!detached && !terminal.closed && cols > 0 && rows > 0) terminal.resize(cols, rows);
      },
      detach,
      close: detach,
    },
  };
}
