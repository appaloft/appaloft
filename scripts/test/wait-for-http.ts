const [url, timeoutMsRaw] = process.argv.slice(2);

if (!url) {
  throw new Error("Usage: bun run scripts/test/wait-for-http.ts <url> [timeoutMs]");
}

const timeoutMs = Number(timeoutMsRaw ?? "30000");
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      console.log(`ready: ${url}`);
      process.exit(0);
    }
  } catch {
    // retry until timeout
  }

  await Bun.sleep(250);
}

throw new Error(`Timed out waiting for ${url}`);

export {};
