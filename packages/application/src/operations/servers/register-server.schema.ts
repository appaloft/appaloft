import { edgeProxyKinds, targetKinds } from "@appaloft/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const registerServerCommandInputSchema = z.object({
  name: nonEmptyTrimmedString("Server name"),
  host: nonEmptyTrimmedString("Server host"),
  providerKey: nonEmptyTrimmedString("Provider key"),
  targetKind: z.enum(targetKinds).optional().default("single-server"),
  port: z.number().int().positive("Server port must be a positive integer").optional(),
  proxyKind: z.enum(edgeProxyKinds).default("traefik"),
});

export type RegisterServerCommandInput = z.input<typeof registerServerCommandInputSchema>;
