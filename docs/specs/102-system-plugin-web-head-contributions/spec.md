# System Plugin Web Head Contributions

## Status
- Round: Code + Post-Implementation Sync
- Artifact state: active

## Business Outcome

Operators and bundled system plugins can add neutral control-plane HTML head markup, such as
configuration bootstrap JSON or browser-side module scripts, without importing Web application
internals or changing Svelte routes. The HTTP adapter owns insertion into Web Console HTML
responses, while plugins own the markup they contribute.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Web head contribution | A system-plugin-provided HTML fragment inserted before the closing `</head>` of Web Console HTML responses. | extensibility | head contribution |
| System plugin | Operator-installed or built-in plugin that can extend control-plane runtime surfaces. | extensibility | system extension |
| Web Console HTML response | A `text/html` response served by the Web Console static asset/fallback path. | http-adapter | console shell response |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| WEB-HEAD-CONTRIB-001 | Plugin contract accepts head contributions | A compatible system plugin declares `webHeadContributions` and `web-head` capability | The plugin SDK and host parse the definition | The contribution is typed, validated, and listed only for compatible system plugins. |
| WEB-HEAD-CONTRIB-002 | Elysia injects head contributions into console HTML | The Web Console serves `index.html` or the SPA fallback with `</head>` | A compatible head contribution is registered | The adapter inserts the fragment before `</head>` and preserves status and response headers. |
| WEB-HEAD-CONTRIB-003 | Non-console responses are unchanged | API, docs, static asset, plugin route, or HTML without `</head>` responses are served | Head contributions exist | The adapter does not inject into non-Web Console responses or malformed HTML shells. |

## Domain Ownership

- Bounded context: `extensibility`.
- Aggregate/resource owner: none; this is a runtime plugin contract and HTTP adapter extension point.
- Upstream contexts: plugin SDK, plugin host, HTTP adapter.
- Downstream contexts: operator-installed system plugins and distribution composition roots.

## Public Surfaces

- API: no business API or operation key; this is HTTP adapter response shaping.
- CLI: not applicable.
- Web/UI: Web Console HTML responses may receive system-plugin head fragments.
- Config: not applicable in public core.
- Events: none.
- Public docs/help: `docs/PLUGINS.md` documents the capability.

## Non-Goals

- Do not define a vendor analytics, billing, telemetry, or hosted-distribution policy.
- Do not inject into user-deployed applications, static artifacts, docs, API responses, or plugin
  route responses.
- Do not expose a Svelte component API or require plugins to import Web application internals.
- Do not sanitize arbitrary plugin HTML in this slice; system plugins are trusted code registered by
  the operator.

## Open Questions

- Should a later plugin isolation round restrict remote/untrusted plugin HTML contributions through
  a sanitizer or CSP nonce contract?
