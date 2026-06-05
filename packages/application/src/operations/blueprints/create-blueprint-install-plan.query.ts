import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type CreateBlueprintInstallPlanQueryInput,
  type CreateBlueprintInstallPlanResponse,
  createBlueprintInstallPlanQueryInputSchema,
} from "./blueprint-catalog.schema";

export {
  type CreateBlueprintInstallPlanQueryInput,
  createBlueprintInstallPlanQueryInputSchema,
} from "./blueprint-catalog.schema";

export class CreateBlueprintInstallPlanQuery extends Query<CreateBlueprintInstallPlanResponse> {
  constructor(
    public readonly slug: string,
    public readonly input: Omit<CreateBlueprintInstallPlanQueryInput, "slug">,
  ) {
    super();
  }

  static create(
    input: CreateBlueprintInstallPlanQueryInput,
  ): Result<CreateBlueprintInstallPlanQuery> {
    return parseOperationInput(createBlueprintInstallPlanQueryInputSchema, input).map(
      (parsed) =>
        new CreateBlueprintInstallPlanQuery(parsed.slug, {
          ...(parsed.variant ? { variant: parsed.variant } : {}),
          ...(parsed.profile ? { profile: parsed.profile } : {}),
          ...(parsed.parameters ? { parameters: parsed.parameters } : {}),
          ...(parsed.dependencyProvisioning
            ? { dependencyProvisioning: parsed.dependencyProvisioning }
            : {}),
          ...(parsed.target ? { target: parsed.target } : {}),
        }),
    );
  }
}
