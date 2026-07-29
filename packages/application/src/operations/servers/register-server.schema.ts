import { edgeProxyKinds, serverWorkloadRoles, targetKinds } from "@appaloft/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const workloadRolesSchema = z.array(z.enum(serverWorkloadRoles)).superRefine((roles, context) => {
  if (new Set(roles).size !== roles.length) {
    context.addIssue({
      code: "custom",
      message: "Server workload roles must not contain duplicates",
    });
  }
});

export const registerServerCommandInputSchema = z.object({
  name: nonEmptyTrimmedString("Server name"),
  host: nonEmptyTrimmedString("Server host"),
  providerKey: nonEmptyTrimmedString("Provider key"),
  workloadRoles: workloadRolesSchema.optional().default([]),
  targetKind: z.enum(targetKinds).optional().default("single-server"),
  port: z.number().int().positive("Server port must be a positive integer").optional(),
  proxyKind: z.enum(edgeProxyKinds).default("traefik"),
});

export const registerServerResultSchema = z.object({
  id: nonEmptyTrimmedString("Server id"),
  workloadRoles: z.array(z.enum(serverWorkloadRoles)),
});

export type RegisterServerCommandInput = z.input<typeof registerServerCommandInputSchema>;
export type RegisterServerCommandPayload = z.output<typeof registerServerCommandInputSchema>;
export type RegisterServerResult = z.output<typeof registerServerResultSchema>;
