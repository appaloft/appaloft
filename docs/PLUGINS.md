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
  - can extend backend routes, backend middleware, Web Console HTML head markup, and
    control-plane pages
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
- `web-head`
- `web-page`
- `tenant-isolation`

## Lifecycle

Milestone 1 includes:

- manifest parsing
- semver compatibility validation
- local plugin host registry
- built-in plugin registration
- system plugin runtime for backend route/middleware registration
- system plugin Web Console head contribution registration
- system plugin web-extension discovery endpoint

## Web Head Contributions

System plugins may declare `webHeadContributions` when they need to add neutral operator-owned
markup before the closing `</head>` of Web Console HTML responses. This extension point is owned by
the HTTP adapter, so plugin authors do not import Svelte routes or Web application internals.

Head contributions are trusted system-plugin code registered by the operator. They are not injected
into user-deployed applications, static artifacts, public docs, API responses, or plugin route
responses.

Future lifecycle hooks:

- before detect
- after plan
- before execute
- after execute
- rollback hooks

## Compatibility

- plugin compatibility is checked with semver against the app version
- incompatible plugins stay visible but should not be activated

## Plugin Diagnostics

`system.plugins.list` returns safe plugin discovery diagnostics:

- `capabilities`: stable manifest capability flags
- `capabilityDetails`: user-facing capability labels, enabled state, and safe descriptions
- `configuration`: compatible/incompatible configuration status plus stable diagnostic codes

Incompatible plugins remain visible with inactive capability details so operators can understand why
an extension is unavailable. Plugin diagnostics must not expose plugin implementation internals,
provider SDK types, raw runtime payloads, access tokens, private keys, secret references, or
unredacted command output.

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

- integrations connect Appaloft to external systems like GitHub
- plugins extend Appaloft behavior itself
- a future GitHub-related plugin is still not the same thing as the GitHub integration adapter

## Better Auth And Hosted Tenancy

- default self-hosted Appaloft does not require login
- when `APPALOFT_RUNTIME_MODE=hosted-control-plane`, Appaloft activates a first-party Better Auth runtime and can also activate operator-installed system plugins
- GitHub sign-in is intentionally deferred until the user chooses a GitHub workflow
- the Better Auth runtime reserves the `organization()` plugin path for future tenant isolation
- auth remains an adapter/runtime concern; core/application should not hard-code Better Auth types
