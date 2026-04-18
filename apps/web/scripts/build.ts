import { $ } from "bun";

await $`rm -rf .svelte-kit/output build`;
await $`vite build`;
