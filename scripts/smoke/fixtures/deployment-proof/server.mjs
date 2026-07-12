import { createServer } from "node:http";

// biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime fixture receives its port from Docker.
const port = Number(process.env.PORT ?? 3000);
// biome-ignore lint/suspicious/noUndeclaredEnvVars: runtime fixture exposes the deployed config version.
const version = process.env.APP_VERSION ?? "v1";

createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ status: "ok", version, path: request.url }));
}).listen(port, "0.0.0.0");
