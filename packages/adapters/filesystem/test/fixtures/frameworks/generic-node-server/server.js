import http from "node:http";

const port = Number(process.env.PORT ?? 3000);

http
  .createServer((_request, response) => {
    response.end("Generic Node fixture ready");
  })
  .listen(port, "0.0.0.0");
