# Entrypoint Surfaces

Use this reference when choosing how an AI agent should enter Appaloft. Every surface maps back to
the same operation catalog and public docs anchors. Do not invent agent-only operations.

## Install

Install the full Appaloft skill through the standard skill manager:

```bash
npx skills add appaloft/appaloft
```

Appaloft does not provide a separate npm skill installer. Do not suggest an Appaloft-owned npm
installer; that would blur the boundary between installing an agent skill and running the
`appaloft` CLI.

## Surface Selection

1. CLI: use when the agent has a trusted local shell and the user expects direct project or server
   work. Pure SSH GitHub Actions also enter through the CLI wrapper by default with
   `control-plane-mode: none` and SSH-server `ssh-pglite` state. Use
   `references/cli-entrypoints.md` for exact commands and operation keys.
2. HTTP/API: use when the agent is integrated beside an Appaloft control plane or when shell access
   is not the right boundary. Self-hosted Server Action uses this surface: `control-plane-url`
   selects the instance explicitly, `appaloft-token` authenticates mutation endpoints, and the
   Action must not SSH or run the CLI.
3. Web: use when guiding a human through the console. Describe the next UI action and keep business
   behavior aligned with the same operation catalog.
4. Repository config: use Appaloft config files as deployment intent, not as a replacement for
   Resource profile ownership. `controlPlane.mode` and safe `controlPlane.url` may select
   connection policy; project/resource/server ids are bootstrap/advanced override context, not the
   ordinary default mental model. High-level `dependencies`, `dependencies.<key>.backup`,
   `storage`, `scheduledTasks`, and `autoDeploy` declarations must reconcile through existing
   operations before ids-only deployment admission.
5. MCP/tools: use only when available. MCP descriptors must mirror existing operations and must not
   introduce MCP-only mutations.

## GitHub Action Boundary

- Pure SSH Action is the default for BYOS SSH deployments and does not require an Appaloft console,
  project id, resource id, server id, or deploy token.
- Self-hosted Server Action is selected only by an explicit self-hosted control-plane URL and
  deploy-token credential. Prefer `server-config-deploy: true` so the server reads config and
  dispatches ids-only deployment admission.
- Product-grade preview belongs to Appaloft Cloud or a self-hosted control plane with preview
  policy, GitHub App webhook intake, cleanup retry, scheduler, audit, and quota. Do not collapse it
  into Action-only PR preview guidance.

## Boundary Rules

- The skill is an AI-facing content entrypoint, not a runtime adapter, provider, plugin, or new
  business surface.
- Do not inspect Appaloft internals such as repositories, use cases, database state, Docker, SSH,
  provider SDKs, or proxy config directly when an Appaloft operation exists.
- Do not add source, runtime, network, or access fields to `deployments.create`; configure Resource
  profile and access operations first.
- Do not add dependency, dependency backup policy, storage, scheduled task, or auto-deploy fields to
  `deployments.create`; reconcile repository config declarations through their existing operation
  families first.
- Do not create `quick-deploy.create`; Quick Deploy remains a workflow over explicit operations.
- Do not expose unmasked secrets in prompts, logs, diagnostics, docs, PRs, or final responses.
