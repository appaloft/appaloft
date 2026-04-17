import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    port,
    service: "express-hello",
  });
});

app.get("/", (_request, response) => {
  response.send("hello from appaloft express demo");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`express-hello listening on ${port}`);
});
