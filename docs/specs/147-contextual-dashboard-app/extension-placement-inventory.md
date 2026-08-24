# Dashboard Extension Placement Inventory

This inventory records the public extension surfaces reviewed for the Dashboard default cutover.
It is governed by [ADR-126](../../decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md)
and the [Contextual Dashboard Test Matrix](../../testing/contextual-dashboard-test-matrix.md).

## Public Native Contributions

| Contribution                        | Dashboard placement            | Status | Evidence                                                                                                                                     |
| ----------------------------------- | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `appaloft-audit-log.navigation`     | Workspace / Activity / section | Mapped | Public server metadata declares `scope=workspace`, `destination=activity`; Dashboard evaluates and renders it only while Activity is active. |
| `appaloft-audit-log.project-route`  | Project / Overview / section   | Mapped | Public server metadata declares `scope=project`, `destination=overview` and preserves the Project owner parameters.                          |
| `appaloft-audit-log.resource-route` | Resource / Overview / section  | Mapped | Public server metadata declares `scope=resource`, `destination=overview` and preserves the Resource owner parameter.                         |

All three contributions continue to return `appaloft.console.extension-page/v1`; Dashboard does not
fork the document contract.

## Third-Party And Composed Contributions

| Contribution class                                                                                   | Dashboard placement                                                       | Status                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Valid `metadata.scopedNavigation` with `target=console-route`                                        | Declared Workspace, Project, or Resource destination                      | Mapped. Active-scope selection, optional visibility, and page-document fetch are lazy and cached.                                                              |
| Unscoped v1 `navigation`, `settings`, `account-menu`, or `route` with a console/external page target | Workspace / Settings / Extensions directory                               | Mapped fallback. It stays explicitly reachable without becoming permanent navigation.                                                                          |
| `auth`, `quick-deploy-source`, `domain-error-modal`, or `operation-intent-modal`                     | Owning authentication, deploy, domain-error, or operation-intent workflow | Intentionally absent from the Extensions directory. These are contextual interaction hooks, not navigable pages.                                               |
| Unknown scoped metadata or invalid owner/destination pair                                            | None                                                                      | Intentionally absent. The public contract rejects invalid known shapes and Dashboard ignores unknown placement data.                                           |
| Hosted/private composition                                                                           | Downstream Cloud boundary review                                          | Documented downstream gap. The public Dashboard owns only the neutral placement contract; private capability placement is reviewed after the public PR merges. |

## Invariants

- Extension count cannot change the five-item Workspace or four-item Project primary navigation.
- Visibility is requested only for the active owner destination and cached by extension key plus
  resolved endpoint.
- Leaving a destination invalidates in-flight rendering ownership; an inactive result cannot become
  current UI.
- Missing or unavailable extension content produces a truthful local error and does not block the
  native destination.
