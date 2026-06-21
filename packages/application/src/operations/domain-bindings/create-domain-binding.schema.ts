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
    redirectTo: nonEmptyTrimmedString("Canonical redirect target").optional(),
    redirectStatus: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
      .optional(),
    certificatePolicy: z.enum(certificatePolicies).optional(),
    idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
  })
  .superRefine((value, context) => {
    if ((value.serverId && !value.destinationId) || (!value.serverId && value.destinationId)) {
      context.addIssue({
        code: "custom",
        path: value.serverId ? ["destinationId"] : ["serverId"],
        message: "Domain binding server target requires both serverId and destinationId",
      });
    }

    if (value.redirectStatus && !value.redirectTo) {
      context.addIssue({
        code: "custom",
        path: ["redirectStatus"],
        message: "Domain binding redirect status requires redirectTo",
      });
    }
  });

export type CreateDomainBindingCommandInput = z.input<typeof createDomainBindingCommandInputSchema>;
