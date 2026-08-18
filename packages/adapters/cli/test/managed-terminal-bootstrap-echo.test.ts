import { expect, test } from "bun:test";

import { createManagedTerminalBootstrapEchoFilter } from "../src/managed-terminal-bootstrap-echo.js";

test("[WS-REMOTE-ATTACH-136] drops the empty managed-terminal bootstrap echo", () => {
  const filter = createManagedTerminalBootstrapEchoFilter();
  expect(filter("set -eu\n")).toBe("");
  expect(filter("stty echo\n")).toBe("");
  expect(filter('exec "$@"\n')).toBe("");
  expect(filter("OpenCode\n")).toBe("OpenCode\n");
});

test("[WS-REMOTE-ATTACH-136] drops a repeated empty bootstrap then keeps OpenCode output", () => {
  const filter = createManagedTerminalBootstrapEchoFilter();
  const preamble = 'set -eu\r\nstty echo\r\nexec "$@"\r\n'.repeat(3);
  expect(filter(`${preamble}# OpenCode\n`)).toBe("# OpenCode\n");
});

test("[WS-REMOTE-ATTACH-136] keeps a real script that only starts with set -eu", () => {
  const filter = createManagedTerminalBootstrapEchoFilter();
  expect(filter("set -eu\necho hello\n")).toBe("set -eu\necho hello\n");
});
