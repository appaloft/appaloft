# Identity Governance Test Matrix

## Scope

This matrix covers foundational identity-governance domain behavior that is implemented in
`packages/core` before public organization membership or billing operations are exposed through CLI,
HTTP/oRPC, Web, or future MCP tools.

## Domain Matrix

| Test ID | Preferred automation | Case | Given | Action | Expected result | Public behavior impact |
| --- | --- | --- | --- | --- | --- | --- |
| IDENTITY-DOMAIN-001 | unit | Organization owns membership and seat policy | Organization members, member user identities, and a plan with optional seat limit | Add a member, reject duplicate membership, reject a full plan, and reject a plan downgrade below the current member count | `OrganizationMember`, `OrganizationPlan`, and `Organization` intention methods own identity and seat checks; aggregate errors/events/state remain unchanged | None |
| IDENTITY-DOMAIN-002 | unit | Organization owns role and removal policy | Organization members include at least one owner and one non-owner | Update a member role, reject role updates that remove the last owner, remove a member, and reject removal that removes the last owner | `Organization` owns at-least-one-owner policy and member lifecycle checks without primitive role branching outside the aggregate | Required before public organization/team operations activate |
