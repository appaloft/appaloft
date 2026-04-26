---
title: "Generated access routes"
description: "Understand how default access URLs are generated and what they depend on."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "access route"
  - "default url"
  - "generated domain"
relatedOperations:
  - default-access-domain-policies.configure
  - default-access-domain-policies.show
  - default-access-domain-policies.list
  - domain-bindings.create
sidebar:
  label: "Generated routes"
  order: 2
---

![Access readiness chain](/docs/diagrams/access-readiness.svg)

<h2 id="access-generated-route">Generated access URL</h2>

The generated access URL is the URL Appaloft provides before a custom domain is ready. Use it to confirm that a deployment is reachable from a browser and to separate app/proxy problems from DNS or TLS problems.

The generated URL is not deployment input. It is derived from the resource network profile, the target server public entrypoint, proxy readiness, and deployment state.

When one resource has multiple access routes, resource detail and deployment completion feedback
select the current URL in one order: ready durable custom domain, then SSH/CLI server-applied config
domain, then the latest generated URL, then a planned generated URL before first deployment.
Generated URLs are still labeled separately as default access and are not treated as custom domain
bindings.

<h2 id="default-access-policy">Default access policy</h2>

The default access policy decides how Appaloft will generate default access URLs in the future. It is not input for one deployment and it is not a custom domain binding.

The Web console shows this policy on server pages. The common fields mean:

- **Default access mode**: whether generated access is enabled. `provider` uses a registered default-access-domain provider; `disabled` skips generation; `custom-template` uses a configured template.
- **Provider key**: which default-access-domain provider to use. In local or self-hosted setups, `sslip` is the common provider key and generates hostnames from the server public address.
- **Server default access override**: one server can override the system default; servers without an override use the system default policy.

Web reads saved policy state when the system policy or server override form opens. CLI users can
run `appaloft default-access show --scope system`, `appaloft default-access show --scope deployment-target --server <serverId>`,
or `appaloft default-access list` to inspect persisted policies. When no saved record exists,
readback returns an empty policy; that does not mean default access is disabled, because runtime
route resolution may still use the installation's static fallback configuration.

Policy changes affect future generated access resolution. They do not rewrite URLs already persisted in deployment snapshots. If you want to use your own hostname, configure a custom domain binding instead of changing the default access policy.

Common uses:

- Confirm the first deployment is reachable.
- Validate a resource before configuring a custom domain.
- Troubleshoot whether a failure belongs to the app/proxy layer or the domain layer.

<h2 id="access-generated-route-inputs">Inputs it depends on</h2>

Generated access depends on user-visible inputs:

- Resource listener port and protocol from the network profile.
- Server public address or proxy entrypoint.
- Server proxy bootstrap and readiness.
- Deployment progress through execution and verification.

If the resource has no listener port, or the proxy is not ready, Appaloft may show resource and deployment state but should not mark the generated URL as ready.

<h2 id="access-generated-route-readiness">Readiness conditions</h2>

The generated URL is ready when:

- The latest deployment has completed or reached a verifiable state.
- The application process is running.
- The health check passes, or no required health check is configured.
- The proxy knows which resource port to route to.
- Browser traffic reaches the resource, not only the proxy.

These states should be shown separately. Runtime failure, health failure, proxy failure, and DNS/TLS failure are different recovery paths.

<h2 id="access-generated-route-surfaces">Where to inspect it</h2>

The Web console should show generated access in resource details, deployment results, and access sections with nearby status and troubleshooting links.

The CLI should print generated access in deployment results, resource details, or access-related commands. Users should not need to inspect database rows or raw logs to find the URL.

The HTTP API should return the URL, readiness state, last observation time, and failure reason so automation can decide whether to wait, retry, or ask for user action.

<h2 id="access-generated-route-troubleshooting">Troubleshooting order</h2>

If the generated URL does not open:

1. Check resource runtime state.
2. Check health summary and health profile.
3. Check server proxy readiness.
4. Check network profile listener port and protocol.
5. Only then inspect custom domain and certificate state.

Related pages: [Health and network profiles](/docs/en/resources/profiles/health-network/), [Proxy readiness and terminal sessions](/docs/en/servers/operations/proxy-and-terminal/), and [Logs and health](/docs/en/observe/logs-health/).

CLI inspection example:

```bash title="Show resource access summary"
appaloft resource show res_web
```

Health API example:

```http title="Read resource health"
GET /api/resources/res_web/health?checks=true&publicAccessProbe=true
```

```json title="Example response"
{
  "resourceId": "res_web",
  "runtime": "ready",
  "health": "passing",
  "proxy": "ready",
  "generatedAccess": {
    "url": "https://res-web.203-0-113-10.sslip.io",
    "readiness": "ready"
  }
}
```
