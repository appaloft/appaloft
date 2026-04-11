import { join, resolve } from "node:path";
import { $ } from "bun";

async function walk(path: string): Promise<string[]> {
  const output = await $`find ${path} -type f`.text();
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => !file.endsWith("/checksums.txt"))
    .sort();
}

const releaseRoot = resolve(import.meta.dir, "../../dist/release");
const files = await walk(releaseRoot);

const outputLines = await Promise.all(
  files.map(async (file) => {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(await Bun.file(file).arrayBuffer());
    return `${hasher.digest("hex")}  ${file.replace(`${releaseRoot}/`, "")}`;
  }),
);

await Bun.write(join(releaseRoot, "checksums.txt"), `${outputLines.join("\n")}\n`);
console.log(`checksums generated for ${files.length} files`);
