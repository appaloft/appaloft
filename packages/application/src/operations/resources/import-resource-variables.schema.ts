import { z } from "zod";

import { environmentVariableExposureSchema, nonEmptyTrimmedString } from "../shared-schema";

export const importResourceVariablesCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("resourceId"),
  content: z.string().min(1, "content is required"),
  exposure: environmentVariableExposureSchema,
  secretKeys: z.array(nonEmptyTrimmedString("secretKey")).default([]),
  plainKeys: z.array(nonEmptyTrimmedString("plainKey")).default([]),
});

export type ImportResourceVariablesCommandInput = z.input<
  typeof importResourceVariablesCommandInputSchema
>;

export interface ImportedResourceVariableEntry {
  key: string;
  value: string;
  exposure: "build-time" | "runtime";
  kind: "plain-config" | "secret";
  isSecret: boolean;
  action: "created" | "replaced";
  sourceLine: number;
}

export interface ResourceVariableDuplicateOverride {
  key: string;
  exposure: "build-time" | "runtime";
  firstLine: number;
  lastLine: number;
  rule: "last-wins";
}

export interface ResourceVariableExistingOverride {
  key: string;
  exposure: "build-time" | "runtime";
  previousScope: "resource";
  rule: "resource-entry-replaced";
}

export interface ImportResourceVariablesResponse {
  resourceId: string;
  importedEntries: ImportedResourceVariableEntry[];
  duplicateOverrides: ResourceVariableDuplicateOverride[];
  existingOverrides: ResourceVariableExistingOverride[];
}
