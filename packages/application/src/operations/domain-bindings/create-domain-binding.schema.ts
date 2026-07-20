import {
  certificatePolicies,
  edgeProxyKinds,
  routePathHandlingModes,
  tlsModes,
} from "@appaloft/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDomainBindingCommandInputSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id"),
    environmentId: nonEmptyTrimmedString("Environment id"),
    resourceId: nonEmptyTrimmedString("Resource id"),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    domainName: nonEmptyTrimmedString("Domain name"),
    pathPrefix: nonEmptyTrimmedString("Path prefix").default("/"),
    pathHandling: z.enum(routePathHandlingModes).default("preserve"),
    proxyKind: z.enum(edgeProxyKinds),
    tlsMode: z.enum(tlsModes).default("auto"),
    targetServiceName: nonEmptyTrimmedString("Target service name").optional(),
    redirectTo: nonEmptyTrimmedString("Canonical redirect target").optional(),
    redirectStatus: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
      .optional(),
    certificatePolicy: z.enum(certificatePolicies).optional(),
    idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  })
  .superRefine((value, context) => {
    if (!value.serverId && value.destinationId) {
      context.addIssue({
        code: "custom",
        path: ["serverId"],
        message: "Domain binding destination target requires serverId",
      });
    }

    if (value.redirectStatus && !value.redirectTo) {
      context.addIssue({
        code: "custom",
        path: ["redirectStatus"],
        message: "Domain binding redirect status requires redirectTo",
      });
    }

    if (value.redirectTo && value.targetServiceName) {
      context.addIssue({
        code: "custom",
        path: ["targetServiceName"],
        message: "Redirect domain bindings cannot declare a target service",
      });
    }
  });

export type CreateDomainBindingCommandInput = z.input<typeof createDomainBindingCommandInputSchema>;
