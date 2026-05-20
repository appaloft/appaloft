# Deployment Overlay Extension Point

Appaloft exposes a neutral deployment overlay extension point for runtimes that need to evaluate external deployment admission or observation policy around deployment workflows.

The public contract is intentionally generic:

- input includes operation key, source, optional actor, tenant/account/organization refs, deployment resource refs, capability key, and attributes;
- output includes decision `enabled`, `skipped`, `rejected`, or `unknown`, plus reason, source, optional details, and optional readback record;
- the default implementation returns `skipped` with reason `deployment-overlay-default-noop`;
- readback is a generic verification surface and does not create deployment decisions.

The default implementation does not change Community deployment behavior. It does not bill, price, license, meter, schedule managed infrastructure, or enforce provider-specific policy.
