const upstreamCore = process.env.APPALOFT_OPENTUI_CORE;
if (!upstreamCore) throw new Error("APPALOFT_OPENTUI_CORE is required");

const { EmbeddedTerminalRenderable } = await import(`${upstreamCore}/src/index.ts`);
const { createTestRenderer } = await import(`${upstreamCore}/src/testing.ts`);

const durationMs = Number(process.env.APPALOFT_TUI_SOAK_MS ?? 30 * 60 * 1_000);
if (!Number.isFinite(durationMs) || durationMs <= 0) {
  throw new Error("APPALOFT_TUI_SOAK_MS must be a positive number");
}

const setup = await createTestRenderer({ width: 100, height: 30 });
const embedded = new EmbeddedTerminalRenderable(setup.renderer, {
  width: 100,
  height: 30,
  onData() {},
  onTerminalResize() {},
});
setup.renderer.root.add(embedded);

const startedAt = performance.now();
const startedCpu = process.cpuUsage();
const startedRss = process.memoryUsage.rss();
let maxRss = startedRss;
let iterations = 0;
let outputBytes = 0;
const renderLatencies: number[] = [];

try {
  while (performance.now() - startedAt < durationMs) {
    const marker = `SOAK-${iterations.toString().padStart(8, "0")}`;
    const lines = Array.from(
      { length: iterations % 20 === 0 ? 256 : 24 },
      (_, index) => `\x1b[38;5;45m${marker} line=${index} 中文 🚀 e\u0301\x1b[0m\r\n`,
    ).join("");
    const bytes = new TextEncoder().encode(lines);
    embedded.write(bytes);
    outputBytes += bytes.byteLength;

    const renderStartedAt = performance.now();
    await setup.renderOnce();
    renderLatencies.push(performance.now() - renderStartedAt);
    maxRss = Math.max(maxRss, process.memoryUsage.rss());
    iterations += 1;
    await Bun.sleep(20);
  }

  const finalMarker = `SOAK-FINAL-${iterations}`;
  embedded.write(new TextEncoder().encode(`\x1b[2J\x1b[H${finalMarker} 中文 🚀 e\u0301`));
  await setup.renderOnce();
  const frame = setup.captureCharFrame();
  if (!frame.includes(finalMarker) || !frame.includes("中文") || !frame.includes("🚀")) {
    throw new Error(`final frame integrity failed:\n${frame}`);
  }

  const elapsedMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(startedCpu);
  const sortedLatencies = renderLatencies.toSorted((left, right) => left - right);
  const percentile = (ratio: number) =>
    sortedLatencies[
      Math.min(sortedLatencies.length - 1, Math.floor(sortedLatencies.length * ratio))
    ] ?? 0;

  console.log(
    JSON.stringify({
      pass: true,
      durationMs: Math.round(elapsedMs),
      iterations,
      outputBytes,
      cpuPercent: Number((((cpu.user + cpu.system) / (elapsedMs * 1_000)) * 100).toFixed(2)),
      rssStartBytes: startedRss,
      rssMaxBytes: maxRss,
      rssGrowthBytes: maxRss - startedRss,
      renderLatencyMs: {
        p50: Number(percentile(0.5).toFixed(2)),
        p95: Number(percentile(0.95).toFixed(2)),
        p99: Number(percentile(0.99).toFixed(2)),
        max: Number(Math.max(...renderLatencies).toFixed(2)),
      },
      screenIntegrity: true,
    }),
  );
} finally {
  setup.renderer.destroy();
}
