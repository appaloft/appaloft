import { expect, test } from "bun:test";
import { openBunNativeWorkspaceTerminal } from "../src/workspace-control-native-terminal";

const runRealAgentMatrix = process.env.APPALOFT_WORKSPACE_TUI_AGENT_MATRIX === "true";
const realAgentTest = runRealAgentMatrix ? test : test.skip;

const agents = [
  { name: "pi", argv: ["pi", "--help"] },
  { name: "opencode", argv: ["opencode", "--help"] },
  { name: "codex", argv: ["codex", "--help"] },
  { name: "claude", argv: ["claude", "--help"] },
] as const;

async function nextFrame(
  frames: AsyncIterator<
    | { readonly kind: "ready"; readonly sessionId: string }
    | { readonly kind: "output"; readonly stream: "stdout" | "stderr"; readonly data: string }
    | { readonly kind: "closed"; readonly reason: string; readonly exitCode?: number }
  >,
) {
  return Promise.race([
    frames.next(),
    Bun.sleep(10_000).then(() => {
      throw new Error("Timed out waiting for real Agent terminal output");
    }),
  ]);
}

for (const agent of agents) {
  realAgentTest(
    `[WS-TUI-CAPABILITY-010][WS-TUI-TERMINAL-012] ${agent.name} traverses the native Agent PTY without a provider call`,
    async () => {
      expect(
        Bun.which(agent.argv[0]),
        `${agent.name} must be installed for the opt-in matrix`,
      ).toBeTruthy();
      const opened = await openBunNativeWorkspaceTerminal({
        workspaceId: `sbx_matrix_${agent.name}`,
        runtimeId: `sar_matrix_${agent.name}`,
        argv: agent.argv,
      });
      const frames = opened.session[Symbol.asyncIterator]();

      try {
        expect(await nextFrame(frames)).toEqual({
          done: false,
          value: {
            kind: "ready",
            sessionId: `native:sbx_matrix_${agent.name}:sar_matrix_${agent.name}`,
          },
        });
        await opened.session.resize({ cols: 112, rows: 32 });

        let output = "";
        let exitCode: number | undefined;
        while (exitCode === undefined) {
          const frame = await nextFrame(frames);
          if (frame.done) break;
          if (frame.value.kind === "output") output += frame.value.data;
          if (frame.value.kind === "closed") exitCode = frame.value.exitCode;
        }

        expect(exitCode, `${agent.name} output: ${output}`).toBe(0);
        expect(output.trim().length).toBeGreaterThan(0);
      } finally {
        await opened.session.detach();
      }
    },
    15_000,
  );
}
