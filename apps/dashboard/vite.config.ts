import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

import { createDashboardDevProxy, resolveDashboardDevServer } from "./src/lib/dev-server";

export default defineConfig(({ mode }) => {
  const devServer = resolveDashboardDevServer({
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
  });

  return {
    plugins: [tailwindcss(), sveltekit()],
    server: {
      ...(devServer.host ? { host: devServer.host } : {}),
      fs: {
        allow: [resolve(process.cwd(), "../../../..")],
      },
      port: devServer.port,
      proxy: createDashboardDevProxy(devServer),
    },
  };
});
