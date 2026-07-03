import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExecutionContext } from "@appaloft/application";

import { createBetterAuthRuntime } from "../src";

const context = {
  entrypoint: "system",
  locale: "en-US",
  requestId: "req_test",
  t: (key: string) => key,
  tracer: {
    startActiveSpan(_name: string, _options: object, callback: () => unknown) {
      return Promise.resolve(callback());
    },
  },
} as ExecutionContext;

async function signUpWithSessionCookie(
  runtime: ReturnType<typeof createBetterAuthRuntime>,
  input: { email: string; name: string },
): Promise<{ sessionCookie: string }> {
  const signedUp = await runtime.handle(
    new Request("http://localhost:3721/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        callbackURL: "/",
        email: input.email,
        name: input.name,
        password: "local-user-password",
        rememberMe: true,
      }),
    }),
  );
  const setCookie = signedUp.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/better-auth\.session_token=[^;,]+/)?.[0];
  expect(signedUp.status).toBe(200);
  expect(sessionCookie, setCookie).toBeTruthy();
  if (!sessionCookie) {
    throw new Error("Expected Better Auth session cookie after sign-up");
  }

  return { sessionCookie };
}

function memberContext(sessionCookie: string, requestId: string): ExecutionContext {
  return {
    ...context,
    auth: { cookieHeader: sessionCookie },
    requestId,
  } as ExecutionContext;
}

async function setUpOwnerWithInvitedMember(
  runtime: ReturnType<typeof createBetterAuthRuntime>,
  input: {
    ownerEmail: string;
    memberEmail: string;
    inviteRole: "billing" | "developer" | "viewer";
  },
): Promise<{
  ownerCookie: string;
  memberCookie: string;
  organizationId: string;
  memberId: string;
}> {
  const owner = await signUpWithSessionCookie(runtime, {
    email: input.ownerEmail,
    name: "Role Owner",
  });
  const ownerContextResult = await runtime.getCurrentContext(
    memberContext(owner.sessionCookie, "req_role_owner_context"),
  );
  expect(ownerContextResult.isOk()).toBe(true);
  const organizationId = ownerContextResult._unsafeUnwrap().currentOrganization.organizationId;

  const invited = await runtime.inviteMember(
    memberContext(owner.sessionCookie, "req_role_invite"),
    {
      organizationId,
      email: input.memberEmail,
      role: input.inviteRole,
    },
  );
  expect(invited.isOk()).toBe(true);
  const invitation = invited._unsafeUnwrap();
  expect(invitation.role).toBe(input.inviteRole);

  const member = await signUpWithSessionCookie(runtime, {
    email: input.memberEmail,
    name: "Role Member",
  });
  const accepted = await runtime.handle(
    new Request("http://localhost:3721/api/auth/organization/accept-invitation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: member.sessionCookie,
        origin: "http://localhost:3721",
      },
      body: JSON.stringify({ invitationId: invitation.invitationId }),
    }),
  );
  expect(accepted.status).toBe(200);

  const membersResult = await runtime.listMembers(
    memberContext(owner.sessionCookie, "req_role_members"),
    { organizationId, limit: 100 },
  );
  expect(membersResult.isOk()).toBe(true);
  const memberRow = membersResult
    ._unsafeUnwrap()
    .items.find((item) => item.email === input.memberEmail);
  expect(memberRow).toBeTruthy();
  if (!memberRow) {
    throw new Error("Expected invited member row");
  }

  return {
    ownerCookie: owner.sessionCookie,
    memberCookie: member.sessionCookie,
    organizationId,
    memberId: memberRow.memberId,
  };
}

describe("organization team role assignment", () => {
  test("[CLOUD-AUTHZ-ROLE-ASSIGN-028] invite and role change persist granular team roles", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const setup = await setUpOwnerWithInvitedMember(runtime, {
      ownerEmail: "role-assign-owner@example.com",
      memberEmail: "role-assign-member@example.com",
      inviteRole: "viewer",
    });

    const membersAfterInvite = await runtime.listMembers(
      memberContext(setup.ownerCookie, "req_role_assign_readback_invite"),
      { organizationId: setup.organizationId, limit: 100 },
    );
    expect(membersAfterInvite.isOk()).toBe(true);
    expect(
      membersAfterInvite._unsafeUnwrap().items.find((item) => item.memberId === setup.memberId)
        ?.role,
    ).toBe("viewer");

    for (const role of ["billing", "developer"] as const) {
      const updated = await runtime.updateMemberRole(
        memberContext(setup.ownerCookie, `req_role_assign_update_${role}`),
        {
          organizationId: setup.organizationId,
          memberId: setup.memberId,
          role,
        },
      );
      expect(updated.isOk()).toBe(true);
      expect(updated._unsafeUnwrap().role).toBe(role);

      const readback = await runtime.listMembers(
        memberContext(setup.ownerCookie, `req_role_assign_readback_${role}`),
        { organizationId: setup.organizationId, limit: 100 },
      );
      expect(readback.isOk()).toBe(true);
      expect(
        readback._unsafeUnwrap().items.find((item) => item.memberId === setup.memberId)?.role,
      ).toBe(role);
    }
  });

  test("[CLOUD-AUTHZ-ROLE-DEFAULT-029] legacy member and unknown role strings normalize with least privilege", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-auth-role-default-"));
    const { createDatabase, createMigrator } = await import("../../../persistence/pg/src/index");
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(workspaceDir, ".appaloft", "data", "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      if (migrations.error) {
        throw migrations.error;
      }

      const runtime = createBetterAuthRuntime({
        enabled: true,
        baseURL: "http://localhost:3721",
        secret: "test-secret-at-least-long-enough",
        database: {
          db: database.db,
          type: "postgres",
        },
      });

      const setup = await setUpOwnerWithInvitedMember(runtime, {
        ownerEmail: "role-default-owner@example.com",
        memberEmail: "role-default-member@example.com",
        inviteRole: "developer",
      });

      const readMemberRole = async () => {
        const membersResult = await runtime.listMembers(
          memberContext(setup.ownerCookie, "req_role_default_readback"),
          { organizationId: setup.organizationId, limit: 100 },
        );
        expect(membersResult.isOk()).toBe(true);
        return membersResult._unsafeUnwrap().items.find((item) => item.memberId === setup.memberId)
          ?.role;
      };

      // Legacy rows written before granular assignment keep developer capability.
      await database.db
        .updateTable("member")
        .set({ role: "member" })
        .where("id", "=", setup.memberId)
        .execute();
      expect(await readMemberRole()).toBe("developer");

      // Unrecognized role strings fall back to least privilege.
      await database.db
        .updateTable("member")
        .set({ role: "legacy-custom-role" })
        .where("id", "=", setup.memberId)
        .execute();
      expect(await readMemberRole()).toBe("viewer");
    } finally {
      await database.close?.();
    }
  });

  test("[CLOUD-AUTHZ-ROLE-PERMS-030] permissions read model lets admins manage members but not transfer ownership", async () => {
    const runtime = createBetterAuthRuntime({
      enabled: true,
      baseURL: "http://localhost:3721",
      secret: "test-secret-at-least-long-enough",
    });

    const setup = await setUpOwnerWithInvitedMember(runtime, {
      ownerEmail: "role-perms-owner@example.com",
      memberEmail: "role-perms-member@example.com",
      inviteRole: "viewer",
    });

    const memberPermissions = async (requestId: string) => {
      const switched = await runtime.switchCurrentOrganization(
        memberContext(setup.memberCookie, `${requestId}_switch`),
        { organizationId: setup.organizationId },
      );
      expect(switched.isOk()).toBe(true);
      const contextResult = await runtime.getCurrentContext(
        memberContext(setup.memberCookie, requestId),
      );
      expect(contextResult.isOk()).toBe(true);
      return contextResult._unsafeUnwrap().permissions;
    };

    const viewerPermissions = await memberPermissions("req_role_perms_viewer");
    expect(viewerPermissions).toMatchObject({
      canInviteMembers: false,
      canRemoveMembers: false,
      canTransferOwnership: false,
      canUpdateMemberRoles: false,
    });

    const promoted = await runtime.updateMemberRole(
      memberContext(setup.ownerCookie, "req_role_perms_promote"),
      {
        organizationId: setup.organizationId,
        memberId: setup.memberId,
        role: "admin",
      },
    );
    expect(promoted.isOk()).toBe(true);

    const adminPermissions = await memberPermissions("req_role_perms_admin");
    expect(adminPermissions).toMatchObject({
      canInviteMembers: true,
      canRemoveMembers: true,
      canTransferOwnership: false,
      canUpdateMemberRoles: true,
    });
  });
});
