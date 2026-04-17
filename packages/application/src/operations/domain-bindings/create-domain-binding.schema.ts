import { certificatePolicies, edgeProxyKinds, tlsModes } from "@appaloft/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createDomainBindingCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  serverId: nonEmptyTrimmedString("Server id"),
  destinationId: nonEmptyTrimmedString("Destination id"),
  domainName: nonEmptyTrimmedString("Domain name"),
  pathPrefix: nonEmptyTrimmedString("Path prefix").default("/"),
  proxyKind: z.enum(edgeProxyKinds),
  tlsMode: z.enum(tlsModes).default("auto"),
  certificatePolicy: z.enum(certificatePolicies).optional(),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export type CreateDomainBindingCommandInput = z.input<typeof createDomainBindingCommandInputSchema>;
