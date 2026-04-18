import { join, relative, resolve } from "node:path";

import { listTopLevelFiles } from "./lib/release-utils";

const releaseRoot = resolve(import.meta.dir, "../../dist/release");
const files = (await listTopLevelFiles(releaseRoot)).filter(
  (file) => relative(releaseRoot, file) !== "checksums.txt",
);

const outputLines = await Promise.all(
  files.map(async (file) => {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(await Bun.file(file).arrayBuffer());
    return `${hasher.digest("hex")}  ${relative(releaseRoot, file)}`;
  }),
);

await Bun.write(join(releaseRoot, "checksums.txt"), `${outputLines.join("\n")}\n`);
console.log(`checksums generated for ${files.length} files`);
