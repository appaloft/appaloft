# Route Surface Extension Point

Appaloft exposes a neutral Route Surface Hook so downstream distributions can observe route, domain, access-route, and static artifact surface preparation without changing Community behavior.

The hook is provider-neutral:

- input includes operation/source, optional tenant/account/organization refs, actor refs, project/environment/resource/deployment/domain/access route/static artifact refs, surface kind, capability key, and attributes;
- output is a decision `enabled`, `skipped`, `rejected`, or `unknown`, with reason and optional details;
- readback is a query for verification records and must not mutate route/static behavior;
- default implementation is no-op compatible and returns `skipped` with reason `route-surface-default-noop`.

Community/local Appaloft should keep existing route/domain/static behavior when no external provider is registered. External providers are registered through the application dependency container token `appaloft.route_surface_port`.

This extension point does not define hosted static publishing, CDN/object storage, official default domain strategy, billing, pricing, license verification, or SLA behavior.

