import { Hono } from "hono";

const app = new Hono();
const port = Number(process.env.PORT ?? 3000);

app.get("/", (context) => context.text("Hono fixture ready"));

export default {
  fetch: app.fetch,
  port,
};
