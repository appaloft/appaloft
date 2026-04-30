# Identity Governance Test Matrix

## Scope

This matrix covers foundational identity-governance domain behavior that is implemented in
`packages/core` before public organization membership or billing operations are exposed through CLI,
HTTP/oRPC, Web, or future MCP tools.

## Domain Matrix

| Test ID | Preferred automation | Case | Given | Action | Expected result | Public behavior impact |
| --- | --- | --- | --- | --- | --- | --- |
| IDENTITY-DOMAIN-001 | unit | Organization owns membership and seat policy | Organization members, member user identities, and a plan with optional seat limit | Add a member, reject duplicate membership, reject a full plan, and reject a plan downgrade below the current member count | `OrganizationMember`, `OrganizationPlan`, and `Organization` intention methods own identity and seat checks; aggregate errors/events/state remain unchanged | None |
