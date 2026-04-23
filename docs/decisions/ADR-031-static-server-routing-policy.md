# ADR-031: Static Server Routing Policy

Status: Accepted

Date: 2026-04-23

## Decision

Appaloft-owned static-server artifacts must provide a built-in routing policy for static-site
deployments. Users must not be required to add application-specific reverse-proxy rules just to make
normal static documentation sites, directory-index pages, or client-side application routes work.

The generated static-server image must apply this order:

1. serve an exact file when it exists;
2. serve a directory index when the requested path maps to a directory containing `index.html`;
3. return `404` for missing extension-bearing asset paths, such as `.css`, `.js`, images, fonts, and
   source maps;
4. fall back to the root `index.html` for missing extensionless application routes.

This is an adapter-owned runtime behavior of the static Docker/OCI artifact. It is not a new public
command field, repository config field, deployment override, or edge-proxy rule. A future custom
static routing policy may be introduced only through a separate ADR and specs that define its input,
validation, compatibility, and tests.

## Context

Static site generators and frontend build tools emit links and assets relative to their deployment
mount point. The mount point must be resolved at build time by the docs/frontend framework, while
the static server must still provide standard file-server behavior at runtime.

Without an Appaloft-owned runtime policy:

- static documentation pages can fail when `/path/` is not resolved to `/path/index.html`;
- single-page applications can fail on refresh or direct navigation to a client route;
- missing asset paths can accidentally return HTML, causing confusing browser MIME errors;
- users are pushed into writing proxy-specific rules for a behavior Appaloft can safely own.

## Chosen Rule

The runtime adapter that packages a static publish directory into a Docker/OCI image must generate
the web-server configuration together with the image. For the current Nginx implementation, the
generated configuration must:

- use the packaged publish directory as the server root;
- keep directory indexes enabled for generated static documentation routes;
- reject missing extension-bearing asset paths with `404`;
- fall back only extensionless application routes to `/index.html`.

Path-prefix and canonical-url concerns remain build-time concerns of the source application or
repository deployment config. Appaloft's static-server routing policy does not rewrite a build that
was generated for the wrong public base path. The docs deployment profile is responsible for
building `apps/docs` with the base path that matches `docs.appaloft.com`.

## Consequences

- Static deployments work for both generated documentation sites and SPA-style client routes without
  user-authored reverse-proxy snippets.
- Asset failures remain observable as real `404` responses instead of HTML fallback responses.
- Static-server routing stays provider-neutral at the Appaloft resource/deployment contract
  boundary; concrete Nginx configuration remains adapter-owned.

## Governed Specs

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Static Site Deployment Plan](../implementation/static-site-deployment-plan.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)

## Current Implementation Notes And Migration Gaps

Current generated static-server Dockerfiles use Nginx and write an Appaloft-owned default server
configuration during image build.

Custom cache headers, custom static server images, per-resource rewrite rules, CDN/object-storage
publication, and non-container static hosting remain future behaviors.
