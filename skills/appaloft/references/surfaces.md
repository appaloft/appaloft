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

1. CLI: use when the agent has a trusted local shell and the user expects direct project, server,
   or hosted Appaloft Cloud work. For product/control-plane tasks, check `appaloft auth status` or
   `appaloft context show` first. If there is no active profile and the user did not select another
   endpoint, run `appaloft login`; the CLI defaults to `https://app.appaloft.com`, opens or prints
   the Cloud browser login URL, and writes a local `cloud` profile only after a trusted local
   credential verifies. Pure SSH GitHub Actions still enter through the CLI wrapper by default with
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
   ordinary default mental model. High-level prebuilt image source, `dependencies`,
   `dependencies.<key>.backup`, `storage`, `scheduledTasks`, `autoDeploy`,
   `preview.pullRequest.policy`, `access.generated`, `monitoring.thresholds`, and
   `retention.runtimePrune` declarations plus supported `env`/`secrets` references must reconcile
   through existing operations before ids-only deployment admission. Preview policy declarations
   apply only during ordinary trusted deploys and are skipped during PR preview deploy mutation.
   Supported secret resolvers are `ci-env:<NAME>` and same-key
   `resource-secret:<KEY>`.
5. MCP/tools: use when an MCP host has `appaloft mcp stdio` or an equivalent configured server
   available. MCP tools mirror existing operations and must not introduce MCP-only mutations. Use
   [mcp-tools.md](mcp-tools.md) for tool naming, resources, prompts, and setup.

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
- Do not ask the user to paste product-session cookies, bearer tokens, deploy tokens, or browser
  cookies into chat. Let the CLI read local env/profile state, or ask the user to run login in their
  trusted shell.
- Do not inspect Appaloft internals such as repositories, use cases, database state, Docker, SSH,
  provider SDKs, or proxy config directly when an Appaloft operation exists.
- Do not add source, runtime, network, health, or access fields to `deployments.create`; configure
  Resource profile, health, and access operations first.
- Do not add dependency, dependency backup policy, storage, scheduled task, auto-deploy, preview
  policy, named profile overlay, preview overlay, monitoring threshold, or runtime prune policy fields to
  `deployments.create`; reconcile repository config declarations through their existing operation
  families first.
- Do not create `quick-deploy.create`; Quick Deploy remains a workflow over explicit operations.
- Do not expose unmasked secrets in prompts, logs, diagnostics, docs, PRs, or final responses.

## Skill And MCP Roles

- The skill is the procedural layer: it classifies intent, chooses the active surface, sequences
  existing operations, and shapes the final answer.
- MCP is the callable tool layer: one tool maps to one operation catalog key, with input schemas
  generated from the same command/query schemas used by CLI and HTTP/API.
- MCP resources and prompts provide context and workflow starters only. They do not own write-side
  policy, background work, auth, tenant selection, or hidden state.
- When a user says something like `/appaloft help me deploy this repo`, treat `/appaloft` as the
  host's skill invocation phrase, load this skill, then use MCP only if the host exposes Appaloft
  MCP tools in the session.
