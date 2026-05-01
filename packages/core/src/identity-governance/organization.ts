import { AggregateRoot, Entity } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type OrganizationId, type OrganizationMemberId, type UserId } from "../shared/identifiers";
import { err, ok, type Result, safeTry } from "../shared/result";
import { OrganizationPlanTierValue, OrganizationRoleValue } from "../shared/state-machine";
import { type CreatedAt, type JoinedAt, type OccurredAt } from "../shared/temporal";
import { type OrganizationName, OrganizationSlug } from "../shared/text-values";
import { ValueObject } from "../shared/value-object";

export interface OrganizationPlanState {
  tier: OrganizationPlanTierValue;
  seatLimit?: number;
  hostedControlPlane: boolean;
  auditRetentionDays?: number;
}

export interface OrganizationMemberState {
  id: OrganizationMemberId;
  userId: UserId;
  role: OrganizationRoleValue;
  joinedAt: JoinedAt;
}

export interface OrganizationState {
  id: OrganizationId;
  name: OrganizationName;
  slug: OrganizationSlug;
  plan: OrganizationPlan;
  members: OrganizationMember[];
  createdAt: CreatedAt;
}

export interface OrganizationMemberVisitor<TContext, TResult> {
  visitOrganizationMember(member: OrganizationMember, context: TContext): TResult;
}

export interface OrganizationVisitor<TContext, TResult> {
  visitOrganization(organization: Organization, context: TContext): TResult;
}

export class OrganizationPlan extends ValueObject<OrganizationPlanState> {
  private constructor(state: OrganizationPlanState) {
    super(state);
  }

  static create(input: OrganizationPlanState): Result<OrganizationPlan> {
    if (input.seatLimit !== undefined && input.seatLimit <= 0) {
      return err(domainError.validation("Organization seat limit must be positive"));
    }

    if (input.auditRetentionDays !== undefined && input.auditRetentionDays <= 0) {
      return err(domainError.validation("Audit retention must be positive when configured"));
    }

    return ok(new OrganizationPlan(input));
  }

  static rehydrate(state: OrganizationPlanState): OrganizationPlan {
    return new OrganizationPlan(state);
  }

  hasSeatLimit(): boolean {
    return this.state.seatLimit !== undefined;
  }

  canCoverMemberCount(memberCount: number): boolean {
    return this.state.seatLimit === undefined || memberCount <= this.state.seatLimit;
  }

  canAcceptMemberCount(memberCount: number): boolean {
    return this.state.seatLimit === undefined || memberCount < this.state.seatLimit;
  }

  seatLimitForError(): number | undefined {
    return this.state.seatLimit;
  }

  toState(): OrganizationPlanState {
    return { ...this.state };
  }
}

export class OrganizationMember extends Entity<OrganizationMemberState> {
  private constructor(state: OrganizationMemberState) {
    super(state);
  }

  static create(input: OrganizationMemberState): Result<OrganizationMember> {
    return ok(new OrganizationMember(input));
  }

  static rehydrate(state: OrganizationMemberState): OrganizationMember {
    return new OrganizationMember(state);
  }

  accept<TContext, TResult>(
    visitor: OrganizationMemberVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitOrganizationMember(this, context);
  }

  changeRole(role: OrganizationRoleValue): void {
    this.state.role = role;
  }

  belongsToUser(userId: UserId): boolean {
    return this.state.userId.equals(userId);
  }

  toState(): OrganizationMemberState {
    return { ...this.state };
  }
}

export class Organization extends AggregateRoot<OrganizationState> {
  private constructor(state: OrganizationState) {
    super(state);
  }

  static create(input: {
    id: OrganizationId;
    name: OrganizationName;
    createdAt: CreatedAt;
    slug?: OrganizationSlug;
    plan?: OrganizationPlanState;
    ownerMember: OrganizationMemberState;
  }): Result<Organization> {
    return safeTry(function* () {
      const owner = yield* OrganizationMember.create({
        ...input.ownerMember,
        role: OrganizationRoleValue.rehydrate("owner"),
      });

      const plan = yield* OrganizationPlan.create(
        input.plan ?? {
          tier: OrganizationPlanTierValue.rehydrate("community"),
          hostedControlPlane: false,
        },
      );

      const organization = new Organization({
        id: input.id,
        name: input.name,
        slug:
          input.slug ??
          OrganizationSlug.rehydrate(
            input.name.value
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, ""),
          ),
        plan,
        members: [owner],
        createdAt: input.createdAt,
      });
      organization.recordDomainEvent("organization.created", input.createdAt, {
        slug: organization.toState().slug.value,
        planTier: plan.toState().tier.value,
      });
      return ok(organization);
    });
  }

  static rehydrate(state: OrganizationState): Organization {
    return new Organization({
      ...state,
      members: [...state.members],
    });
  }

  accept<TContext, TResult>(
    visitor: OrganizationVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitOrganization(this, context);
  }

  addMember(input: OrganizationMemberState): Result<void> {
    const organization = this;

    return safeTry(function* () {
      const member = yield* OrganizationMember.create(input);

      if (organization.hasMemberForUser(input.userId)) {
        return err(
          domainError.conflict("Organization member already exists", {
            userId: input.userId.value,
          }),
        );
      }

      if (!organization.canAcceptAnotherMember()) {
        const seatLimit = organization.state.plan.seatLimitForError();
        return err(
          domainError.invariant("Organization seat limit exceeded", {
            ...(seatLimit === undefined ? {} : { seatLimit }),
          }),
        );
      }

      organization.state.members = [...organization.state.members, member];
      organization.recordDomainEvent("organization.member_added", input.joinedAt, {
        userId: input.userId.value,
        role: input.role.value,
      });
      return ok(undefined);
    });
  }

  changePlan(planState: OrganizationPlanState, changedAt: OccurredAt): Result<void> {
    const organization = this;

    return safeTry(function* () {
      const nextPlan = yield* OrganizationPlan.create(planState);

      if (!organization.canChangeToPlan(nextPlan)) {
        const seatLimit = nextPlan.seatLimitForError();
        return err(
          domainError.invariant("Cannot downgrade below current organization member count", {
            members: organization.memberCount(),
            ...(seatLimit === undefined ? {} : { seatLimit }),
          }),
        );
      }

      organization.state.plan = nextPlan;
      organization.recordDomainEvent("organization.plan_changed", changedAt, {
        tier: nextPlan.toState().tier.value,
      });
      return ok(undefined);
    });
  }

  memberCount(): number {
    return this.state.members.length;
  }

  hasMemberForUser(userId: UserId): boolean {
    return this.state.members.some((existing) => existing.belongsToUser(userId));
  }

  canAcceptAnotherMember(): boolean {
    return this.state.plan.canAcceptMemberCount(this.memberCount());
  }

  canChangeToPlan(plan: OrganizationPlan): boolean {
    return plan.canCoverMemberCount(this.memberCount());
  }

  toState(): OrganizationState {
    return {
      ...this.state,
      members: [...this.state.members],
    };
  }
}
