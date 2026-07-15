/**
 * Skeleton loading is powered by boneyard-js.
 *
 * Prefer `DataSkeleton` for data cells (metric numbers, titles, list rows).
 * Keep page chrome outside the wrapper so loading only replaces fetched values.
 * Capture bones via `npx boneyard-js build` / Vite plugin after wiring names.
 */
export type { AnimationStyle } from "boneyard-js/svelte";
export {
  configureBoneyard,
  default as Skeleton,
  default as Root,
  registerBones,
} from "boneyard-js/svelte";
export { default as DataSkeleton } from "./data-skeleton.svelte";
