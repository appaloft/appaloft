# Appaloft Agent Deploy Skill

## Status

- Round: Spec Round
- Artifact state: accepted candidate for v1 entry experience
- Roadmap target: pre-`1.0.0` / GA readiness
- Compatibility impact: `pre-1.0-policy`, additive public documentation and agent workflow package

## Business Outcome

Coding agents can use Appaloft safely with or without MCP configured. The top-level skill is an
AI-facing Appaloft entrypoint over the complete operation catalog, and deploy is the first
high-frequency subprotocol.

The skill gives agents a short, installable or copyable protocol for the first-deploy loop:

```text
inspect source -> exclude secrets -> choose/create context -> plan -> deploy -> observe -> return URL + diagnostics
```

The skill improves the normal user path immediately. MCP is the formal callable tool transport
when an agent host is configured for it; the skill remains the workflow protocol that decides which
tools, CLI commands, HTTP/API calls, or Web actions to use.

## Ubiquitous Language

| Term | Meaning | Boundary |
| --- | --- | --- |
| Appaloft Skill | Complete AI-facing Appaloft entrypoint over the same operation catalog exposed through CLI, HTTP/API, Web, and MCP surfaces. | Public docs / standard `skills/appaloft` source |
| Agent Deploy Protocol | Ordered deploy workflow an agent follows before calling CLI/API operations. | Quick Deploy / first deploy |
| Safe Source Inspection | Read-only project inspection that avoids uploading secrets, dependency caches, local state, and credentials. | Agent workflow |
| Outcome Packet | Final response shape containing URL/access state, resource/deployment ids, logs, diagnostics, and recovery hints. | CLI/Web/docs/tool guidance |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-SKILL-001 | Skill is available before v1 | A user or coding agent wants to deploy with Appaloft | They open docs or install/copy the skill | The skill explains the shortest safe path to deploy through existing Appaloft entrypoints and links to stable public docs anchors. |
| AGENT-SKILL-002 | Agent chooses the right entrypoint | The agent sees Web, CLI, HTTP/API, and MCP options | It follows the skill | The skill directs first-deploy automation to the active Appaloft surface over existing operations; it does not require MCP to remain useful. |
| AGENT-SKILL-003 | Safe source inspection | The source directory contains `.env`, private keys, dependency caches, build cache, or local Appaloft state | The agent prepares deployment input | The skill requires excluding or rejecting unsafe files before local static output/materialization or upload-like BYOS entry. |
| AGENT-SKILL-004 | Operation sequence stays explicit | The agent deploys a new project | It needs missing project/server/environment/resource context | It sequences explicit operations or CLI commands that map to `projects.*`, `servers.*`, `environments.*`, `resources.create`, and `deployments.create`; no hidden agent-only command exists. |
| AGENT-SKILL-005 | URL-first outcome packet | Deployment is accepted and access state is available or unavailable | The agent responds to the user | The response leads with URL or structured access-unavailable reason, then Resource, Deployment, logs, diagnostics, and recovery commands. |
| AGENT-SKILL-006 | Failure recovery is agent-readable | Deployment planning, execution, access, or verification fails | The agent follows structured errors and docs links | It reports stable error code/phase, next action, log/diagnostic command, and whether retry/redeploy/rollback is available. |
| AGENT-SKILL-007 | MCP remains optional | MCP descriptors exist but the current host may or may not configure them | The agent uses Appaloft | The skill remains useful through CLI/API/Web and can use MCP tools without changing business semantics when available. |
| AGENT-SKILL-008 | Full Appaloft skill is the AI entrypoint | A user asks an agent to configure, observe, recover, administer, or maintain Appaloft beyond deployment | The agent follows the installed Appaloft skill | The skill maps the request to existing operation-catalog entries and includes every CLI transport command as an AI-readable reference. |

## Required Skill Content

The v1 full Appaloft skill must include:

- install or copy instructions for the supported agent environments;
- every CLI transport entry from `packages/application/src/operation-catalog.ts`, with operation
  keys beside CLI forms;
- entrypoint surface guidance for CLI, HTTP/API, Web, repository config, and MCP/tool use;
- guidance that the skill is a first-class AI entrypoint, peer to CLI/HTTP/API/Web/MCP but
  not an agent-only business surface;
- coverage for deploy, observe, recover, configure, administer, and maintenance workflows;
- safety and redaction rules for logs, diagnostics, env vars, keys, tokens, SSH material, local
  paths, cookies, and credentials.

The deploy subprotocol must include:

- prerequisites and authentication assumptions;
- safe source inspection checklist;
- local static output rules for `dist`, `build`, and equivalent directories;
- context selection/creation flow;
- plan/deploy/observe command sequence;
- expected URL-first outcome packet;
- failure and recovery decision tree;
- links to first deployment, source, errors/statuses, logs/health, and recovery docs;
- explicit statement that MCP is optional for host setup and uses the same operation boundaries
  when available.

## Domain Ownership

- The skill is not a domain aggregate, command, query, or adapter.
- The skill is an AI-facing content entrypoint over the operation catalog, not a separate business
  surface with its own semantics.
- The skill must not introduce a `quick-deploy.create` operation or agent-only business endpoint.
- The skill may call CLI commands or HTTP/API operations, but those calls must map to existing
  operation catalog entries.
- The skill must not call repositories, use cases, database state, runtime adapters, or shell
  internals directly.
- If the skill eventually invokes MCP tools, those tools must be generated from the same operation
  catalog and command/query schemas.

## Public Surfaces

- Public docs: stable "Appaloft skill" and "Agent deploy skill" anchors before v1.
- Repository artifact: standard source `skills/appaloft` with references for entrypoint surfaces,
  CLI operation mapping, and deploy protocol.
- standard install path: `npx skills add appaloft/appaloft`.
- no Appaloft-owned npm skill installer; this keeps skill installation distinct from the Appaloft
  CLI.
- CLI help: short pointer from first-deploy or deploy help to the skill docs when agent deployment
  is documented.
- MCP/tools: active optional transport when configured; release packaging and hosted gateway policy
  remain follow-up work.
- Web/www: if a marketing or www surface exists, it should present the skill as the first
  AI-native workflow integration and MCP as the callable tool layer.

## Non-Goals

- No hosted artifact storage or hosted routing.
- No hosted MCP gateway requirement for v1.
- No curated MCP server template catalog.
- No Appaloft-as-MCP mutation tool outside the operation catalog.
- No autonomous background agent runtime.
- No bypass around BYOS target selection, Resource profile ownership, deployment verification,
  logs, diagnostics, or recovery readiness.

## Current Implementation Notes And Migration Gaps

Appaloft now has an operation-catalog-backed MCP package in progress alongside the full skill. The
remaining gap is release/distribution-facing: package publication, hosted gateway policy, and
external install instructions should be completed in a later release round.
