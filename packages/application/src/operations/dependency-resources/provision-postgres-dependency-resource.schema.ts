import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { dependencyResourceBackupRelationshipInputSchema } from "./dependency-resource.schema";

export const provisionPostgresDependencyResourceCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  name: nonEmptyTrimmedString("Dependency resource name"),
  providerKey: nonEmptyTrimmedString("Provider key").optional(),
  description: nonEmptyTrimmedString("Description").optional(),
  backupRelationship: dependencyResourceBackupRelationshipInputSchema,
});

export type ProvisionPostgresDependencyResourceCommandInput = z.output<
  typeof provisionPostgresDependencyResourceCommandInputSchema
>;
