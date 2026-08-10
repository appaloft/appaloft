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
let nextProgressAtMs = Math.min(durationMs, 5 * 60 * 1_000);
const renderLatencies: number[] = [];
let failure: unknown;

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
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs >= nextProgressAtMs) {
      console.error(
        JSON.stringify({
          progress: true,
          elapsedMs: Math.round(elapsedMs),
          durationMs,
          iterations,
          outputBytes,
          rssBytes: process.memoryUsage.rss(),
        }),
      );
      nextProgressAtMs += 5 * 60 * 1_000;
    }
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
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  setup.renderer.destroy();
}

// OpenTUI's native renderer may retain background handles after destroy on an unreleased PR build.
// The Spike has already emitted the complete report and teardown has run, so end deterministically.
process.exit(failure ? 1 : 0);
