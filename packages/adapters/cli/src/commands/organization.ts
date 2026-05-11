import {
  GetCurrentOrganizationContextQuery,
  InviteOrganizationMemberCommand,
  ListOrganizationInvitationsQuery,
  ListOrganizationMembersQuery,
  RemoveOrganizationMemberCommand,
  SwitchCurrentOrganizationCommand,
  UpdateOrganizationMemberRoleCommand,
} from "@appaloft/application";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalNumber, optionalValue, runCommand, runQuery } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const organizationRoles = ["admin", "billing", "developer", "owner", "viewer"] as const;
const invitationStatuses = ["accepted", "expired", "pending", "revoked"] as const;

const organizationIdOption = Options.text("organization-id");
const memberIdArg = Args.text({ name: "memberId" });
const organizationIdArg = Args.text({ name: "organizationId" });
const emailOption = Options.text("email");
const roleOption = Options.choice("role", organizationRoles);
const statusOption = Options.choice("status", invitationStatuses).pipe(Options.optional);
const cursorOption = Options.text("cursor").pipe(Options.optional);
const limitOption = Options.text("limit").pipe(Options.optional);
const idempotencyKeyOption = Options.text("idempotency-key").pipe(Options.optional);

const contextCommand = EffectCommand.make("context", {}, () =>
  runQuery(GetCurrentOrganizationContextQuery.create({})),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationContext));

const switchCommand = EffectCommand.make(
  "switch",
  {
    organizationId: organizationIdArg,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, organizationId }) =>
    runCommand(
      SwitchCurrentOrganizationCommand.create({
        organizationId,
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationSwitch));

const membersListCommand = EffectCommand.make(
  "list",
  {
    organizationId: organizationIdOption,
    cursor: cursorOption,
    limit: limitOption,
  },
  ({ cursor, limit, organizationId }) =>
    runQuery(
      ListOrganizationMembersQuery.create({
        organizationId,
        cursor: optionalValue(cursor),
        limit: optionalNumber(limit),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationMembersList));

const membersCommand = EffectCommand.make("members").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.organizationMembers),
  EffectCommand.withSubcommands([membersListCommand]),
);

const invitationsListCommand = EffectCommand.make(
  "list",
  {
    organizationId: organizationIdOption,
    status: statusOption,
    cursor: cursorOption,
    limit: limitOption,
  },
  ({ cursor, limit, organizationId, status }) =>
    runQuery(
      ListOrganizationInvitationsQuery.create({
        organizationId,
        status: optionalValue(status),
        cursor: optionalValue(cursor),
        limit: optionalNumber(limit),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationInvitationsList));

const invitationsCommand = EffectCommand.make("invitations").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.organizationInvitations),
  EffectCommand.withSubcommands([invitationsListCommand]),
);

const memberInviteCommand = EffectCommand.make(
  "invite",
  {
    organizationId: organizationIdOption,
    email: emailOption,
    role: roleOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ email, idempotencyKey, organizationId, role }) =>
    runCommand(
      InviteOrganizationMemberCommand.create({
        organizationId,
        email,
        role,
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationMemberInvite));

const memberRoleCommand = EffectCommand.make(
  "role",
  {
    memberId: memberIdArg,
    organizationId: organizationIdOption,
    role: roleOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, memberId, organizationId, role }) =>
    runCommand(
      UpdateOrganizationMemberRoleCommand.create({
        organizationId,
        memberId,
        role,
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationMemberRole));

const memberRemoveCommand = EffectCommand.make(
  "remove",
  {
    memberId: memberIdArg,
    organizationId: organizationIdOption,
    idempotencyKey: idempotencyKeyOption,
  },
  ({ idempotencyKey, memberId, organizationId }) =>
    runCommand(
      RemoveOrganizationMemberCommand.create({
        organizationId,
        memberId,
        idempotencyKey: optionalValue(idempotencyKey),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.organizationMemberRemove));

const memberCommand = EffectCommand.make("member").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.organizationMember),
  EffectCommand.withSubcommands([memberInviteCommand, memberRoleCommand, memberRemoveCommand]),
);

export const organizationCommand = EffectCommand.make("organization").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.organization),
  EffectCommand.withSubcommands([
    contextCommand,
    switchCommand,
    membersCommand,
    invitationsCommand,
    memberCommand,
  ]),
);
