import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import { dependencyResourceBackupRelationshipInputSchema } from "./dependency-resource.schema";

export const importPostgresDependencyResourceCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  name: nonEmptyTrimmedString("Dependency resource name"),
  connectionUrl: nonEmptyTrimmedString("Connection URL"),
  secretRef: nonEmptyTrimmedString("Secret reference").optional(),
  connectionSecret: nonEmptyTrimmedString("Connection secret").optional(),
  description: nonEmptyTrimmedString("Description").optional(),
  backupRelationship: dependencyResourceBackupRelationshipInputSchema,
});

export type ImportPostgresDependencyResourceCommandInput = z.output<
  typeof importPostgresDependencyResourceCommandInputSchema
>;
