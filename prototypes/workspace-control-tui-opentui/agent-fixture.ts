process.stdin.setRawMode(true);
process.stdout.write(
  [
    "\x1b[?1049h",
    "\x1b[2J\x1b[H",
    "\x1b[1;36mAppaloft Agent fixture\x1b[0m\r\n",
    "中文宽字符 · emoji 🚀 · combining e\u0301\r\n",
    "This byte stream stands in for pi / OpenCode / Claude Code.\r\n",
    "Type anything; Ctrl+C exits the child fixture.\r\n\r\n",
    "\x1b[?2004h",
    "> ",
  ].join(""),
);

for await (const chunk of Bun.stdin.stream()) {
  const bytes = new Uint8Array(chunk);
  if (bytes.includes(3)) break;
  process.stdout.write(bytes);
}

process.stdout.write("\x1b[?2004l\x1b[?1049l");
