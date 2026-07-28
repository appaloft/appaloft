import { serverWorkloadRoles } from "@appaloft/core";
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

export const configureServerWorkloadRolesCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  workloadRoles: workloadRolesSchema,
});

export const configureServerWorkloadRolesResultSchema = z.object({
  workloadRoles: z.array(z.enum(serverWorkloadRoles)),
  changed: z.boolean(),
});

export type ConfigureServerWorkloadRolesCommandInput = z.input<
  typeof configureServerWorkloadRolesCommandInputSchema
>;
export type ConfigureServerWorkloadRolesCommandPayload = z.output<
  typeof configureServerWorkloadRolesCommandInputSchema
>;
export type ConfigureServerWorkloadRolesResult = z.output<
  typeof configureServerWorkloadRolesResultSchema
>;
