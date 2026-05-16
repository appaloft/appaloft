# Appaloft Agent Deploy Skill

## Status

- Round: Spec Round
- Artifact state: accepted candidate for v1 entry experience
- Roadmap target: pre-`1.0.0` / GA readiness
- Compatibility impact: `pre-1.0-policy`, additive public documentation and agent workflow package

## Business Outcome

Coding agents can deploy an Appaloft project safely without first needing a full MCP integration.

The skill gives agents a short, installable or copyable protocol for the first-deploy loop:

```text
inspect source -> exclude secrets -> choose/create context -> plan -> deploy -> observe -> return URL + diagnostics
```

This is more urgent for v1 than MCP because it improves the normal user path immediately. MCP
remains the formal tool transport; the skill is the first agent-facing product affordance.

## Ubiquitous Language

| Term | Meaning | Boundary |
| --- | --- | --- |
| Agent Deploy Skill | Agent-readable instructions, examples, checks, and recovery rules for deploying with Appaloft. | Public docs / `@appaloft/agent-skill` package |
| Agent Deploy Protocol | Ordered deploy workflow an agent follows before calling CLI/API operations. | Quick Deploy / first deploy |
| Safe Source Inspection | Read-only project inspection that avoids uploading secrets, dependency caches, local state, and credentials. | Agent workflow |
| Outcome Packet | Final response shape containing URL/access state, resource/deployment ids, logs, diagnostics, and recovery hints. | CLI/Web/docs/tool guidance |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-SKILL-001 | Skill is available before v1 | A user or coding agent wants to deploy with Appaloft | They open docs or install/copy the skill | The skill explains the shortest safe path to deploy through existing Appaloft entrypoints and links to stable public docs anchors. |
| AGENT-SKILL-002 | Agent chooses the right entrypoint | The agent sees Web, CLI, HTTP/API, and future MCP options | It follows the skill | The skill directs first-deploy automation to CLI or HTTP/API over existing operations; it does not require MCP for v1. |
| AGENT-SKILL-003 | Safe source inspection | The source directory contains `.env`, private keys, dependency caches, build cache, or local Appaloft state | The agent prepares deployment input | The skill requires excluding or rejecting unsafe files before local static output/materialization or upload-like BYOS entry. |
| AGENT-SKILL-004 | Operation sequence stays explicit | The agent deploys a new project | It needs missing project/server/environment/resource context | It sequences explicit operations or CLI commands that map to `projects.*`, `servers.*`, `environments.*`, `resources.create`, and `deployments.create`; no hidden agent-only command exists. |
| AGENT-SKILL-005 | URL-first outcome packet | Deployment is accepted and access state is available or unavailable | The agent responds to the user | The response leads with URL or structured access-unavailable reason, then Resource, Deployment, logs, diagnostics, and recovery commands. |
| AGENT-SKILL-006 | Failure recovery is agent-readable | Deployment planning, execution, access, or verification fails | The agent follows structured errors and docs links | It reports stable error code/phase, next action, log/diagnostic command, and whether retry/redeploy/rollback is available. |
| AGENT-SKILL-007 | MCP remains optional | MCP descriptors exist or later become available | The agent uses Appaloft before MCP setup | The skill remains useful through CLI/API and can later point to MCP tools without changing business semantics. |

## Required Skill Content

The v1 skill must include:

- install or copy instructions for the supported agent environments;
- prerequisites and authentication assumptions;
- safe source inspection checklist;
- local static output rules for `dist`, `build`, and equivalent directories;
- context selection/creation flow;
- plan/deploy/observe command sequence;
- expected URL-first outcome packet;
- failure and recovery decision tree;
- redaction rules for logs, diagnostics, env vars, keys, tokens, SSH material, and local paths;
- links to first deployment, source, errors/statuses, logs/health, and recovery docs;
- explicit statement that MCP is optional and not required for the v1 skill path.

## Domain Ownership

- The skill is not a domain aggregate, command, query, or adapter.
- The skill must not introduce a `quick-deploy.create` operation or agent-only business endpoint.
- The skill may call CLI commands or HTTP/API operations, but those calls must map to existing
  operation catalog entries.
- The skill must not call repositories, use cases, database state, runtime adapters, or shell
  internals directly.
- If the skill eventually invokes MCP tools, those tools must be generated from the same operation
  catalog and command/query schemas.

## Public Surfaces

- Public docs: a stable "Agent deploy skill" anchor before v1.
- Repository artifact: `packages/agent-skill/skills/appaloft-deploy`.
- npm install path: `npx @appaloft/agent-skill install deploy`.
- CLI help: short pointer from first-deploy or deploy help to the skill docs when agent deployment
  is documented.
- MCP/tools: optional follow-up; not required for v1.
- Web/www: if a marketing or www surface exists, it should present the skill as the first
  AI-native integration before MCP.

## Non-Goals

- No hosted artifact storage or hosted routing.
- No MCP server requirement for v1.
- No curated MCP server template catalog.
- No new Appaloft-as-MCP mutation tool requirement.
- No autonomous background agent runtime.
- No bypass around BYOS target selection, Resource profile ownership, deployment verification,
  logs, diagnostics, or recovery readiness.

## Current Implementation Notes And Migration Gaps

Appaloft currently has operation-catalog metadata and generated MCP/tool descriptors, plus partial
runtime monitoring and runtime usage tool handlers. That is a useful foundation, but it does not
replace a v1 agent deploy skill.

The current gap is product-facing and documentation-facing: agents need a concise safe protocol and
result shape before users can rely on Appaloft as an AI-friendly deployment tool.
