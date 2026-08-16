# ADR-120: Plan Preview Resolves Server Default Destination

Status: Accepted

Date: 2026-08-16

## Context

ADR-014 and `deployments.create` already allow omitting `destinationId` when a
compatibility seam can resolve or create the server default Destination. Occupancy
first-party MCP calls `deployments.plan` first. That query skipped the seam and
failed closed with `destinationId is required for this deployment context`.

Live occupancy evidence 2026-08-16:

- enrolled Server `srv_uil9cpctplou` already has Destination `dst_di9i62yldejw`
  named `default`;
- occupancy resource `res_vj1602cxjisn` has no resource-pinned destination;
- `appaloftdev deployments plan ... --server srv_uil9cpctplou` failed before
  network/runtime planning;
- the same ids on `deployments.create` passed destination and failed later on
  missing `internalPort`.

Spec 013 forbids `deployments.plan` from creating Destinations or mutating
Server state. Railway-like first deploy still needs the Agent to preview
without hand-filling `dst_*`.

Owner Grill 2026-08-16 (D16–D21) kept occupancy as the door and chose a
read-only default-destination resolve for plan.

## Decision

1. When `deployments.plan` omits `destinationId`, `DeploymentContextResolver`
   resolves Destination read-only:
   - resource `defaultDestinationId` if pinned and visible;
   - otherwise Server Destination named `default`.
2. The query never creates, upserts, or enrolls a Destination.
3. Missing default Destination remains fail-closed with
   `destinationId is required for this deployment context` and safe
   `serverId` / `destinationName` details.
4. Explicit `destinationId` is unchanged and still must belong to the selected
   Server.
5. No new catalog operation, no `destinations.list`, and no `servers.show`
   destinations field in this slice.

## Consequences

- Spec 013 / `deployments.plan` omitted `destinationId` is no longer a hard
  missing-id failure when Server `default` exists.
- Occupancy Agent can preview past destination and surface the next real
  blocker (`internalPort` / runtime profile).
- `deployments.create` remains the only write-side default-destination
  create-or-reuse seam.
- Expected public SemVer: minor query compatibility. Callers that already
  pass `destinationId` are unchanged.

## Rejected Alternatives

- Creating Destination inside `deployments.plan`.
- Adding `destinations.list` or expanding `servers.show` before the read-only
  seam works.
- Silently picking an arbitrary Destination when more than one exists and none
  is named `default`.
- Treating missing `internalPort` as part of this slice.
