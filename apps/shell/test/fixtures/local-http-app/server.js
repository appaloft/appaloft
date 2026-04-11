import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", port }));
    return;
  }

  response.writeHead(200, { "content-type": "text/plain" });
  response.end("hello from local shell");
});

server.listen(port, "127.0.0.1");
