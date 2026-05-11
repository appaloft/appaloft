import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const organizationTeamRoleSchema = z.enum([
  "admin",
  "billing",
  "developer",
  "owner",
  "viewer",
]);

export const organizationInvitationStatusSchema = z.enum([
  "accepted",
  "expired",
  "pending",
  "revoked",
]);

export const optionalCursorSchema = nonEmptyTrimmedString("cursor").optional();
export const optionalLimitSchema = z.coerce.number().int().positive().max(250).optional();
export const organizationIdSchema = nonEmptyTrimmedString("organizationId");
export const organizationMemberIdSchema = nonEmptyTrimmedString("memberId");
