import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await writeFile("dist/server.js", await readFile("server.js", "utf8"));
