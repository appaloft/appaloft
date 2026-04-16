import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

function createApiProxyTarget(mode: string): string {
  const env = loadEnv(mode, process.cwd(), "");
  return env.YUNDU_WEB_DEV_PROXY_TARGET || "http://127.0.0.1:3001";
}

export default defineConfig(({ mode }) => {
  const proxyTarget = createApiProxyTarget(mode);

  return {
    plugins: [tailwindcss(), sveltekit()],
    server: {
      watch: {
        ignored: ["**/build/**", "**/.svelte-kit/output/**"],
      },
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      expect: { requireAssertions: true },
      projects: [
        {
          extends: "./vite.config.ts",
          test: {
            name: "server",
            environment: "node",
            include: ["src/**/*.{test,spec}.{js,ts}"],
            exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
          },
        },
      ],
    },
  };
});
