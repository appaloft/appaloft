# Plugins

## Model

Plugins are explicit extension units with:

- manifest
- capabilities
- compatibility range
- entrypoint

There are now two distinct classes:

- user plugins
  - extend deployment/runtime behavior
  - examples: source detectors, deployment hooks, build strategies
- system plugins
  - installed by the operator who runs the control plane
  - can extend backend routes, backend middleware, and control-plane pages
  - used for hosted-only control-plane extensions, tenant admin surfaces, and operator-specific workflows

Current manifest fields:

- `name`
- `displayName`
- `description`
- `version`
- `kind`
- `compatibilityRange`
- `capabilities`
- `entrypoint`

## Capability Model

Current capability flags:

- `deployment-hook`
- `source-detector`
- `build-strategy`
- `provider-extension`
- `integration-extension`
- `ai-tool`
- `http-route`
- `http-middleware`
- `web-page`
- `tenant-isolation`

## Lifecycle

Milestone 1 includes:

- manifest parsing
- semver compatibility validation
- local plugin host registry
- built-in plugin registration
- system plugin runtime for backend route/middleware registration
- system plugin web-extension discovery endpoint

Future lifecycle hooks:

- before detect
- after plan
- before execute
- after execute
- rollback hooks

## Compatibility

- plugin compatibility is checked with semver against the app version
- incompatible plugins stay visible but should not be activated

## Isolation

Current posture:

- local plugins are registered by manifest
- system plugins are registered by code, not by end users
- execution isolation is planned at the plugin-host boundary
- remote plugins are reserved for future work

Planned isolation rules:

- separate plugin directories under `runtime/plugins/`
- explicit capability negotiation
- no unrestricted access to core internals

## Why Plugins Are Separate From Integrations

- integrations connect Yundu to external systems like GitHub
- plugins extend Yundu behavior itself
- a future GitHub-related plugin is still not the same thing as the GitHub integration adapter

## Better Auth And Hosted Tenancy

- default self-hosted Yundu does not require login
- when `YUNDU_RUNTIME_MODE=hosted-control-plane`, Yundu activates a first-party Better Auth runtime and can also activate operator-installed system plugins
- GitHub sign-in is intentionally deferred until the user chooses a GitHub workflow
- the Better Auth runtime reserves the `organization()` plugin path for future tenant isolation
- auth remains an adapter/runtime concern; core/application should not hard-code Better Auth types
