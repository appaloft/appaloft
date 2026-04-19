import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const relinkSourceLinkCommandInputSchema = z.object({
  sourceFingerprint: nonEmptyTrimmedString("Source fingerprint"),
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  resourceId: nonEmptyTrimmedString("Resource id"),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  destinationId: nonEmptyTrimmedString("Destination id").optional(),
  expectedCurrentProjectId: nonEmptyTrimmedString("Expected current project id").optional(),
  expectedCurrentEnvironmentId: nonEmptyTrimmedString("Expected current environment id").optional(),
  expectedCurrentResourceId: nonEmptyTrimmedString("Expected current resource id").optional(),
  reason: nonEmptyTrimmedString("Reason").optional(),
});

export type RelinkSourceLinkCommandInput = z.input<typeof relinkSourceLinkCommandInputSchema>;
export type RelinkSourceLinkCommandPayload = z.output<typeof relinkSourceLinkCommandInputSchema>;
