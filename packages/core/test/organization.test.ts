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
  role?: "admin" | "developer" | "viewer" | "billing";
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
});
