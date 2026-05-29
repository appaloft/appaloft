# Identity Governance Test Matrix

## Scope

This matrix covers foundational identity-governance domain behavior that is implemented in
`packages/core` before public organization membership or billing operations are exposed through CLI,
HTTP/oRPC, Web, or future MCP tools.

## Domain Matrix

| Test ID | Preferred automation | Case | Given | Action | Expected result | Public behavior impact |
| --- | --- | --- | --- | --- | --- | --- |
| IDENTITY-DOMAIN-001 | unit | Organization owns membership and seat policy | Organization members, member user identities, and a plan with optional seat limit | Add a member, reject duplicate membership, reject a full plan, and reject a plan downgrade below the current member count | `OrganizationMember`, `OrganizationPlan`, and `Organization` intention methods own identity and seat checks; aggregate errors/events/state remain unchanged | None |
| IDENTITY-DOMAIN-002 | unit | Organization owns non-owner role and removal policy | Organization members include at least one owner and one non-owner | Update a non-owner member role, reject generic owner assignment/owner target role changes, remove a non-owner member, and reject generic owner removal | `Organization` owns owner protection and non-owner member lifecycle checks without primitive role branching outside the aggregate | Required before public organization/team operations activate |
| IDENTITY-DOMAIN-003 | unit | Organization owns ownership transfer | Organization members include an owner and another active member | Transfer ownership from the owner to the other member and reject self-transfer | `Organization.transferOwnership` makes the target owner, demotes the previous owner to admin, and records an owner-transferred domain event | Required before public owner transfer surfaces activate |
