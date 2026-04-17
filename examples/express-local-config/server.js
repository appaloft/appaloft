import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4310);

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "express-local-config",
    port,
  });
});

app.get("/", (_request, response) => {
  response.send("hello from appaloft config-driven local express demo");
});

app.listen(port, "0.0.0.0", () => {
  console.log(`express-local-config listening on ${port}`);
});
