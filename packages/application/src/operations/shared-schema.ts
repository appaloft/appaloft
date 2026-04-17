import { domainError, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

export const emptyOperationInputSchema = z.object({});

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
  "deployment",
]);

export type EnvironmentKind = z.output<typeof environmentKindSchema>;
export type EnvironmentVariableKind = z.output<typeof environmentVariableKindSchema>;
export type EnvironmentVariableExposure = z.output<typeof environmentVariableExposureSchema>;
export type EnvironmentVariableScope = z.output<typeof environmentVariableScopeSchema>;

export function nonEmptyTrimmedString(label: string) {
  return z.string().trim().min(1, `${label} is required`);
}

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
