import Fastify from "fastify";

const server = Fastify();
const port = Number(process.env.PORT ?? 3000);

server.get("/", async () => ({ ok: true }));

await server.listen({ host: "0.0.0.0", port });
