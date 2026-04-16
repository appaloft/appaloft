import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        port,
        service: "workspace-http-app",
        status: "ok",
      }),
    );
    return;
  }

  response.writeHead(200, { "content-type": "text/plain" });
  response.end("hello from generated Dockerfile workspace");
});

server.listen(port, "0.0.0.0");
