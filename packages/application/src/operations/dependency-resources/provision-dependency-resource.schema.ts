import { z } from "zod";

import { managedDependencyResourceKinds } from "../../ports";
import { nonEmptyTrimmedString } from "../shared-schema";
import { dependencyResourceBackupRelationshipInputSchema } from "./dependency-resource.schema";

export const provisionDependencyResourceCommandInputSchema = z.object({
  kind: z.enum(managedDependencyResourceKinds),
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  serverId: nonEmptyTrimmedString("Server id").optional(),
  name: nonEmptyTrimmedString("Dependency resource name"),
  providerKey: nonEmptyTrimmedString("Provider key").optional(),
  description: nonEmptyTrimmedString("Description").optional(),
  backupRelationship: dependencyResourceBackupRelationshipInputSchema,
});

export type ProvisionDependencyResourceCommandInput = z.output<
  typeof provisionDependencyResourceCommandInputSchema
>;
