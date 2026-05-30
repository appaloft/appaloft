import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  JoinedAt,
  OccurredAt,
  Organization,
  OrganizationId,
  OrganizationMemberId,
  OrganizationName,
  OrganizationPlan,
  OrganizationPlanTierValue,
  OrganizationRoleValue,
  UserId,
} from "../src";

function ownerMember() {
  return {
    id: OrganizationMemberId.rehydrate("om_owner"),
    userId: UserId.rehydrate("usr_owner"),
    role: OrganizationRoleValue.rehydrate("owner"),
    joinedAt: JoinedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

function member(input: {
  id: string;
  userId: string;
  role?: "owner" | "admin" | "developer" | "viewer" | "billing";
}) {
  return {
    id: OrganizationMemberId.rehydrate(input.id),
    userId: UserId.rehydrate(input.userId),
    role: OrganizationRoleValue.rehydrate(input.role ?? "developer"),
    joinedAt: JoinedAt.rehydrate("2026-01-01T00:01:00.000Z"),
  };
}

function organization(input?: { seatLimit?: number }) {
  return Organization.create({
    id: OrganizationId.rehydrate("org_demo"),
    name: OrganizationName.rehydrate("Demo Organization"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    plan: {
      tier: OrganizationPlanTierValue.rehydrate("team"),
      hostedControlPlane: true,
      ...(input?.seatLimit === undefined ? {} : { seatLimit: input.seatLimit }),
    },
    ownerMember: ownerMember(),
  })._unsafeUnwrap();
}

describe("Organization", () => {
  test("[DMBH-IDENTITY-001] matches membership by user identity without caller-owned state peeling", () => {
    const org = organization({ seatLimit: 3 });
    const firstMember = member({ id: "om_admin", userId: "usr_admin", role: "admin" });

    expect(org.hasMemberForUser(UserId.rehydrate("usr_admin"))).toBe(false);
    const added = org.addMember(firstMember);
    expect(added.isOk()).toBe(true);
    expect(org.hasMemberForUser(UserId.rehydrate("usr_admin"))).toBe(true);

    const duplicate = org.addMember(member({ id: "om_admin_2", userId: "usr_admin" }));
    expect(duplicate.isErr()).toBe(true);
    if (duplicate.isErr()) {
      expect(duplicate.error.code).toBe("conflict");
      expect(duplicate.error.details?.userId).toBe("usr_admin");
    }

    expect(org.toState().members).toHaveLength(2);
    expect(
      org.pullDomainEvents().filter((event) => event.type === "organization.member_added"),
    ).toHaveLength(1);
  });

  test("[DMBH-IDENTITY-001] applies plan seat capacity through organization-owned behavior", () => {
    const org = organization({ seatLimit: 2 });

    expect(org.canAcceptAnotherMember()).toBe(true);
    const added = org.addMember(member({ id: "om_developer", userId: "usr_developer" }));
    expect(added.isOk()).toBe(true);
    expect(org.canAcceptAnotherMember()).toBe(false);

    const full = org.addMember(member({ id: "om_viewer", userId: "usr_viewer", role: "viewer" }));
    expect(full.isErr()).toBe(true);
    if (full.isErr()) {
      expect(full.error.code).toBe("invariant_violation");
      expect(full.error.details?.seatLimit).toBe(2);
    }
  });

  test("[DMBH-IDENTITY-001] rejects plan changes that cannot cover existing members", () => {
    const org = organization({ seatLimit: 3 });
    org.addMember(member({ id: "om_developer", userId: "usr_developer" }))._unsafeUnwrap();

    const downgrade = org.changePlan(
      {
        tier: OrganizationPlanTierValue.rehydrate("community"),
        hostedControlPlane: false,
        seatLimit: 1,
      },
      OccurredAt.rehydrate("2026-01-01T00:02:00.000Z"),
    );

    expect(downgrade.isErr()).toBe(true);
    if (downgrade.isErr()) {
      expect(downgrade.error.code).toBe("invariant_violation");
      expect(downgrade.error.details).toMatchObject({
        members: 2,
        seatLimit: 1,
      });
    }

    const plan = OrganizationPlan.rehydrate({
      tier: OrganizationPlanTierValue.rehydrate("team"),
      hostedControlPlane: true,
      seatLimit: 2,
    });
    expect(plan.canCoverMemberCount(2)).toBe(true);
    expect(plan.canCoverMemberCount(3)).toBe(false);
  });

  test("[IDENTITY-DOMAIN-002] changes member roles while preserving an organization owner", () => {
    const org = organization({ seatLimit: 4 });
    org.addMember(member({ id: "om_admin", userId: "usr_admin", role: "admin" }))._unsafeUnwrap();

    expect(org.ownerCount()).toBe(1);

    const blocked = org.changeMemberRole({
      memberId: OrganizationMemberId.rehydrate("om_owner"),
      role: OrganizationRoleValue.rehydrate("admin"),
      changedAt: OccurredAt.rehydrate("2026-01-01T00:03:00.000Z"),
    });
    expect(blocked.isErr()).toBe(true);
    if (blocked.isErr()) {
      expect(blocked.error.code).toBe("invariant_violation");
      expect(blocked.error.details?.memberId).toBe("om_owner");
    }

    const ownerRole = org.changeMemberRole({
      memberId: OrganizationMemberId.rehydrate("om_admin"),
      role: OrganizationRoleValue.rehydrate("owner"),
      changedAt: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
    });
    expect(ownerRole.isErr()).toBe(true);
    if (ownerRole.isErr()) {
      expect(ownerRole.error.code).toBe("validation_error");
      expect(ownerRole.error.details?.memberId).toBe("om_admin");
    }

    const changed = org.changeMemberRole({
      memberId: OrganizationMemberId.rehydrate("om_admin"),
      role: OrganizationRoleValue.rehydrate("billing"),
      changedAt: OccurredAt.rehydrate("2026-01-01T00:05:00.000Z"),
    });
    expect(changed.isOk()).toBe(true);
    expect(org.ownerCount()).toBe(1);

    const roleEvents = org
      .pullDomainEvents()
      .filter((event) => event.type === "organization.member_role_changed");
    expect(roleEvents).toHaveLength(1);
  });

  test("[IDENTITY-DOMAIN-003] transfers ownership through a dedicated domain operation", () => {
    const org = organization({ seatLimit: 4 });
    org.addMember(member({ id: "om_admin", userId: "usr_admin", role: "admin" }))._unsafeUnwrap();

    const transferred = org.transferOwnership({
      fromMemberId: OrganizationMemberId.rehydrate("om_owner"),
      toMemberId: OrganizationMemberId.rehydrate("om_admin"),
      transferredAt: OccurredAt.rehydrate("2026-01-01T00:06:00.000Z"),
    });

    expect(transferred.isOk()).toBe(true);
    expect(org.ownerCount()).toBe(1);
    const members = org.toState().members.map((existing) => existing.toState());
    expect(members.find((existing) => existing.id.value === "om_owner")?.role.value).toBe("admin");
    expect(members.find((existing) => existing.id.value === "om_admin")?.role.value).toBe("owner");

    const selfTransfer = org.transferOwnership({
      fromMemberId: OrganizationMemberId.rehydrate("om_admin"),
      toMemberId: OrganizationMemberId.rehydrate("om_admin"),
      transferredAt: OccurredAt.rehydrate("2026-01-01T00:07:00.000Z"),
    });
    expect(selfTransfer.isErr()).toBe(true);
    if (selfTransfer.isErr()) {
      expect(selfTransfer.error.code).toBe("validation_error");
    }

    const transferEvents = org
      .pullDomainEvents()
      .filter((event) => event.type === "organization.owner_transferred");
    expect(transferEvents).toHaveLength(1);
  });

  test("[IDENTITY-DOMAIN-002] removes members while keeping at least one owner", () => {
    const org = organization({ seatLimit: 4 });
    org
      .addMember(member({ id: "om_owner_2", userId: "usr_owner_2", role: "owner" }))
      ._unsafeUnwrap();
    org
      .addMember(member({ id: "om_developer", userId: "usr_developer", role: "developer" }))
      ._unsafeUnwrap();

    expect(org.memberCount()).toBe(3);

    org
      .removeMember({
        memberId: OrganizationMemberId.rehydrate("om_developer"),
        removedAt: OccurredAt.rehydrate("2026-01-01T00:03:00.000Z"),
      })
      ._unsafeUnwrap();
    expect(org.memberCount()).toBe(2);
    expect(org.hasMember(OrganizationMemberId.rehydrate("om_developer"))).toBe(false);

    const extraOwner = org.removeMember({
      memberId: OrganizationMemberId.rehydrate("om_owner_2"),
      removedAt: OccurredAt.rehydrate("2026-01-01T00:04:00.000Z"),
    });
    expect(extraOwner.isErr()).toBe(true);
    if (extraOwner.isErr()) {
      expect(extraOwner.error.code).toBe("invariant_violation");
      expect(extraOwner.error.details?.memberId).toBe("om_owner_2");
    }
    expect(org.ownerCount()).toBe(2);

    const blocked = org.removeMember({
      memberId: OrganizationMemberId.rehydrate("om_owner"),
      removedAt: OccurredAt.rehydrate("2026-01-01T00:05:00.000Z"),
    });
    expect(blocked.isErr()).toBe(true);
    if (blocked.isErr()) {
      expect(blocked.error.code).toBe("invariant_violation");
      expect(blocked.error.details?.memberId).toBe("om_owner");
    }

    const removedEvents = org
      .pullDomainEvents()
      .filter((event) => event.type === "organization.member_removed");
    expect(removedEvents).toHaveLength(1);
  });
});
