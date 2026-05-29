import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { type OrganizationProfileSummary } from "../../ports";
import { nonEmptyTrimmedString, parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  optionalOrganizationLogoUrlSchema,
  organizationIdSchema,
} from "./organization-team.schema";

export const changeOrganizationProfileCommandInputSchema = z
  .object({
    organizationId: organizationIdSchema,
    name: nonEmptyTrimmedString("name").max(120).optional(),
    slug: z
      .string()
      .trim()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must use lowercase letters, digits, and hyphens")
      .max(80)
      .optional(),
    logoUrl: optionalOrganizationLogoUrlSchema,
    idempotencyKey: nonEmptyTrimmedString("idempotencyKey").optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.slug !== undefined || input.logoUrl !== undefined,
    {
      message: "At least one organization profile field is required",
    },
  );

export type ChangeOrganizationProfileCommandInput = z.input<
  typeof changeOrganizationProfileCommandInputSchema
>;

export class ChangeOrganizationProfileCommand extends Command<OrganizationProfileSummary> {
  constructor(
    public readonly organizationId: string,
    public readonly name?: string,
    public readonly slug?: string,
    public readonly logoUrl?: string | null,
    public readonly idempotencyKey?: string,
  ) {
    super();
  }

  static create(
    input: ChangeOrganizationProfileCommandInput,
  ): Result<ChangeOrganizationProfileCommand> {
    return parseOperationInput(changeOrganizationProfileCommandInputSchema, input).map(
      (parsed) =>
        new ChangeOrganizationProfileCommand(
          parsed.organizationId,
          trimToUndefined(parsed.name),
          trimToUndefined(parsed.slug),
          parsed.logoUrl ?? undefined,
          trimToUndefined(parsed.idempotencyKey),
        ),
    );
  }
}
