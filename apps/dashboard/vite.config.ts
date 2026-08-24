import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

function dashboardPort(mode: string): number {
  const parsed = Number(loadEnv(mode, process.cwd(), "").APPALOFT_DASHBOARD_DEV_PORT || "4183");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 4183;
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    fs: {
      allow: [resolve(process.cwd(), "../../../..")],
    },
    port: dashboardPort(mode),
    proxy: {
      "/api": {
        target:
          loadEnv(mode, process.cwd(), "").APPALOFT_DASHBOARD_DEV_PROXY_TARGET ||
          "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
}));
