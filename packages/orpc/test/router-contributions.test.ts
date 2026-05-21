import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { os } from "@orpc/server";
import { z } from "zod";
import { createAppaloftOpenApiHandler, createAppaloftOrpcRouter } from "../src/index";

describe("Appaloft oRPC router contributions", () => {
  test("mounts an additional neutral router namespace", async () => {
    const extensionRouter = {
      extensions: {
        ping: os
          .route({
            method: "GET",
            path: "/extensions/ping",
            successStatus: 200,
          })
          .output(z.object({ ok: z.boolean() }))
          .handler(() => ({ ok: true })),
      },
    };

    const handler = createAppaloftOpenApiHandler({
      orpcRouterContributions: [extensionRouter],
    });
    const { matched, response } = await handler.handle(
      new Request("http://localhost/api/extensions/ping"),
      {
        prefix: "/api",
        context: {},
      },
    );

    expect(matched).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("rejects contributions that overwrite the public router", () => {
    expect(() =>
      createAppaloftOrpcRouter({
        orpcRouterContributions: [{ projects: {} }],
      }),
    ).toThrow('Appaloft oRPC router contribution conflicts at "projects".');
  });
});
