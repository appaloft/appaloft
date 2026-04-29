import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/", (_request, response) => {
  response.send("Express fixture ready");
});

app.listen(port, "0.0.0.0");
