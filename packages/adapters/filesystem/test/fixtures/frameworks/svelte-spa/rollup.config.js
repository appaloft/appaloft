import svelte from "@rollup/plugin-svelte";

export default {
  input: "src/main.js",
  output: {
    file: "public/bundle.js",
    format: "iife",
    name: "AppaloftFixture",
  },
  plugins: [svelte()],
};
