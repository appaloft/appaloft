const EMPTY_BOOTSTRAP_LINES = ["set -eu", "stty echo", 'exec "$@"'] as const;

export function createManagedTerminalBootstrapEchoFilter(): (chunk: string | Uint8Array) => string {
  let pending = "";
  let stripping = true;
  let cycleIndex = 0;
  const held: string[] = [];

  const flushHeld = (): string => {
    const text = held.join("");
    held.length = 0;
    cycleIndex = 0;
    return text;
  };

  return (chunk) => {
    const incoming = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    if (!stripping) return incoming;
    pending += incoming;
    let emitted = "";

    while (stripping && pending.length > 0) {
      const lineEnd = pending.indexOf("\n");
      if (lineEnd < 0) {
        const expected = EMPTY_BOOTSTRAP_LINES[cycleIndex] ?? "";
        if (expected.startsWith(pending) || `${expected}\r`.startsWith(pending)) {
          return emitted;
        }
        stripping = false;
        emitted += flushHeld() + pending;
        pending = "";
        return emitted;
      }

      const rawLine = pending.slice(0, lineEnd + 1);
      const line = pending.slice(0, lineEnd).replace(/\r$/, "");
      pending = pending.slice(lineEnd + 1);

      if (line === EMPTY_BOOTSTRAP_LINES[cycleIndex]) {
        held.push(rawLine);
        cycleIndex += 1;
        if (cycleIndex === EMPTY_BOOTSTRAP_LINES.length) {
          held.length = 0;
          cycleIndex = 0;
        }
        continue;
      }

      stripping = false;
      emitted += flushHeld() + rawLine + pending;
      pending = "";
    }

    return emitted;
  };
}
