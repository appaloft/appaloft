import {
  domainError,
  err,
  ok,
  type ResourceAccessProfileState,
  ResourceGeneratedAccessModeValue,
  type ResourceId,
  type Result,
  RoutePathPrefix,
} from "@appaloft/core";
import { type z } from "zod";

import { type resourceAccessProfileInputSchema } from "./create-resource.schema";

type ResourceAccessProfileMapperInput = z.input<typeof resourceAccessProfileInputSchema>;

function resourceAccessResolutionError(input: {
  message: string;
  resourceId?: string;
  field?: string;
  value?: string;
}) {
  return domainError.validation(input.message, {
    phase: "resource-access-resolution",
    ...(input.resourceId ? { resourceId: input.resourceId } : {}),
    ...(input.field ? { field: input.field } : {}),
    ...(input.value ? { value: input.value } : {}),
  });
}

export function resourceAccessProfileFromInput(
  input: ResourceAccessProfileMapperInput,
  options: { resourceId?: ResourceId } = {},
): Result<ResourceAccessProfileState> {
  const generatedAccessMode = ResourceGeneratedAccessModeValue.create(
    input.generatedAccessMode ?? "inherit",
  );
  if (generatedAccessMode.isErr()) return err(generatedAccessMode.error);

  const pathPrefixInput = input.pathPrefix ?? "/";
  const pathPrefix = RoutePathPrefix.create(pathPrefixInput);
  if (pathPrefix.isErr()) {
    return err(
      resourceAccessResolutionError({
        message: pathPrefix.error.message,
        ...(options.resourceId ? { resourceId: options.resourceId.value } : {}),
        field: "accessProfile.pathPrefix",
        value: pathPrefixInput,
      }),
    );
  }

  return ok({
    generatedAccessMode: generatedAccessMode.value,
    pathPrefix: pathPrefix.value,
  });
}
