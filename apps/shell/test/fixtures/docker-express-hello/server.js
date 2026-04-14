import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (request, response) => {
  response.json({
    host: request.headers.host,
    message: "hello from express",
    port,
    status: "ok",
  });
});

app.get(/.*/, (_request, response) => {
  response.send("hello from express");
});

app.listen(port, "0.0.0.0");
