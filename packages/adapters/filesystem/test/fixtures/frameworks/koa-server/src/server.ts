import Koa from "koa";

const app = new Koa();
const port = Number(process.env.PORT ?? 3000);

app.use((context) => {
  context.body = "Koa fixture ready";
});

app.listen(port, "0.0.0.0");
