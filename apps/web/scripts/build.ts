import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "../../..");

await $`rm -rf .svelte-kit/output build`;
await $`vite build`;
await Bun.write(
  join(import.meta.dir, "..", "build", "install.sh"),
  Bun.file(join(root, "install.sh")),
);
