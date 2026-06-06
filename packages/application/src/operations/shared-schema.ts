import { domainError, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

export const emptyOperationInputSchema = z.object({});

export const listLimitSchema = z.coerce.number().int().positive().max(500).optional();
export const defaultListLimit = 100;
export const booleanQueryParamSchema = z.union([
  z.boolean(),
  z.literal("true").transform(() => true),
  z.literal("false").transform(() => false),
]);

export function booleanQueryParam(defaultValue: boolean) {
  return booleanQueryParamSchema.default(defaultValue);
}

export function boundedListLimit(limit?: number): number {
  return Math.min(limit ?? defaultListLimit, 500);
}

export const environmentKindSchema = z.enum([
  "local",
  "development",
  "test",
  "staging",
  "production",
  "preview",
  "custom",
]);

export const environmentVariableKindSchema = z.enum([
  "plain-config",
  "secret",
  "provider-specific",
  "deployment-strategy",
]);

export const environmentVariableExposureSchema = z.enum(["build-time", "runtime"]);

export const environmentVariableScopeSchema = z.enum([
  "defaults",
  "system",
  "organization",
  "project",
  "environment",
  "resource",
  "deployment",
]);

export type EnvironmentKind = z.output<typeof environmentKindSchema>;
export type EnvironmentVariableKind = z.output<typeof environmentVariableKindSchema>;
export type EnvironmentVariableExposure = z.output<typeof environmentVariableExposureSchema>;
export type EnvironmentVariableScope = z.output<typeof environmentVariableScopeSchema>;

export function nonEmptyTrimmedString(label: string) {
  return z.string().trim().min(1, `${label} is required`);
}

export const actionDeploymentTrustedContextSchema = z
  .object({
    projectId: nonEmptyTrimmedString("Project id").optional(),
    environmentId: nonEmptyTrimmedString("Environment id").optional(),
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    serverId: nonEmptyTrimmedString("Server id").optional(),
    destinationId: nonEmptyTrimmedString("Destination id").optional(),
    repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
    repositoryId: nonEmptyTrimmedString("Repository id").optional(),
    ref: nonEmptyTrimmedString("Source ref").optional(),
    revision: nonEmptyTrimmedString("Source revision").optional(),
  })
  .strict();

export type ActionDeploymentTrustedContext = z.output<typeof actionDeploymentTrustedContextSchema>;

export function trimToUndefined(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseOperationInput<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  input: unknown,
): Result<z.output<TSchema>> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return err(
      domainError.validation(parsed.error.issues[0]?.message ?? "Input validation failed"),
    );
  }

  return ok(parsed.data);
}
