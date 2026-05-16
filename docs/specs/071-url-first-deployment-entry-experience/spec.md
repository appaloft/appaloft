# URL-First Deployment Entry Experience

## Status

- Round: Spec Round
- Artifact state: accepted candidate for future user-layer entrypoint work
- Roadmap target: v1 entry-experience hardening for agent deploy skill and outcome-first output;
  upload-like local static output implementation may remain a later additive slice
- Compatibility impact: `pre-1.0-policy`, additive entry workflow and copy/output changes only

## Business Outcome

Operators and AI agents can get from a source, local folder, or already-built static output to a
verified URL without first learning the full Appaloft domain model.

The product should feel URL-first at the entrypoint while remaining control-plane-first underneath:
Project, Environment, DeploymentTarget, Resource, Deployment, access routes, logs, diagnostics, and
recovery stay explicit and observable after the first successful path.

## Categorized Product Lessons

| Category | Appaloft lesson | Boundary |
| --- | --- | --- |
| Entry speed | A first deployment entry should ask for the minimum context needed to produce a URL and defer advanced profile editing until after deployment. | Quick Deploy / CLI / Web input collection |
| Upload-like static path | A local static output directory should be accepted as an entry source, so users can deploy `dist`, `build`, or similar output without describing it as a Git repository first. | Entry workflow over `resources.create -> deployments.create` |
| BYOS preservation | Upload-like entry does not imply Appaloft-hosted artifact serving. The default target remains the user's selected local, SSH, or cluster runtime target. | Runtime target boundary |
| AI agent protocol | Agent-facing instructions should define a short, safe sequence: inspect source, avoid secret files, select/create context, deploy, observe events, return URL plus diagnostics. The v1 form is an Agent Deploy Skill before MCP. | Public docs / agent skill / generated MCP-tool guidance |
| Outcome-first output | Completion output should emphasize URL, Resource, Deployment, logs, diagnostics, and recovery commands before exposing model details. | CLI/Web/API/MCP presentation |
| Progressive disclosure | Project, Environment, Resource, target, route, and recovery controls should remain discoverable after success, not required vocabulary before success. | Web/CLI UX |
| Hosted cloud distinction | Official hosted artifact storage/routing is a separate product line. It requires a new ADR/spec before Appaloft stores user artifacts or serves routes from Appaloft-owned cloud infrastructure. | Future control-plane/cloud boundary |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| URL-FIRST-001 | Minimal URL-first deploy | A user has a source folder and at least one usable deployment target can be selected or created | They run the guided entry workflow | Appaloft collects only missing context, dispatches explicit operations, observes deployment progress, and returns the first reachable URL when access is available. |
| URL-FIRST-002 | Local static output as source | A user has an existing local `dist` or equivalent static output directory | They choose the upload-like static entry | The workflow maps the directory to a static Resource profile with `RuntimePlanStrategy = static`, validates safe publish-directory semantics, copies/materializes the local source only to the selected runtime target or selected control plane, and deploys through `deployments.create`. |
| URL-FIRST-003 | No implicit hosted cloud | A user deploys a local artifact through the default Appaloft path | The deployment succeeds | The artifact is not served from Appaloft-owned hosted storage or routing unless a separately selected hosted mode exists and is governed by a future ADR/spec. |
| URL-FIRST-004 | AI agent safe deploy protocol | An agent is asked to deploy a project | The agent follows Appaloft public/tool guidance | It inspects source safely, excludes secrets and dependency caches, chooses or creates context through explicit operations, streams or polls progress, and reports URL, IDs, logs, diagnostics, and recovery hints. |
| URL-FIRST-005 | Outcome-first completion | A deployment reaches accepted or terminal success state | CLI, Web, API, SDK, or MCP presents the result | The primary result is URL/access state, deployment status, resource id/name, log command/link, diagnostic command/link, and recovery readiness; domain-model details stay secondary. |
| URL-FIRST-006 | Advanced model remains available | The user opens the deployed resource after first success | They inspect details or settings | Project, Environment, Resource, DeploymentTarget, Resource profiles, routes, logs, health, diagnostics, and recovery actions remain explicit and editable through governed operations. |

## Domain Ownership

- Quick Deploy remains an entry workflow governed by ADR-010, not a domain aggregate and not a new
  operation-catalog command.
- `resources.create` owns first-class Resource creation and may receive source/runtime/network
  profile input for first deploy.
- `deployments.create` remains ids-only and resolves immutable snapshots from the Resource profile
  under ADR-014.
- Runtime target adapters own source materialization, artifact packaging, upload/copy to a BYOS
  target, and Docker/OCI execution.
- A future Appaloft Cloud hosted artifact path would be a separate product boundary, not a silent
  variation of the default BYOS workflow.

## Public Surfaces

- CLI: a future `appaloft deploy` experience may accept a local source or static output directory
  and present URL-first completion output.
- Web: Quick Deploy should default to an outcome-first path and make Project/Environment/Resource
  details progressive after success.
- HTTP/oRPC: no hidden Quick Deploy operation is introduced by this slice; automation sequences
  explicit operations unless a future durable workflow command is accepted.
- MCP/tools: generated tool guidance should describe the same safe operation sequence rather than
  adding agent-only behavior.
- Public docs/help: reuse task-oriented anchors under the first-deployment and source pages for
  "URL-first deploy", "local static output", and "agent-safe deploy protocol".
- Agent deploy skill: the v1 skill is governed by
  [Appaloft Agent Deploy Skill](../072-appaloft-agent-deploy-skill/spec.md) and should be the first
  AI-native entrypoint before MCP is required.

## Non-Goals

- No new `quick-deploy.create` command.
- No changes to `deployments.create` input.
- No Appaloft-hosted artifact CDN, gateway, object storage, or managed route service in this slice.
- No domain/TLS shortcut hidden inside deployment admission.
- No bypass around Resource profile drift checks, secret redaction, runtime verification, logs, or
  diagnostics.
- No replacement of Web/CLI/API/MCP operation-catalog parity.

## Current Implementation Notes And Migration Gaps

Current Appaloft already supports first-class static-site deployment through
`resources.create(kind = static-site, runtimeProfile.strategy = static, publishDirectory,
networkProfile.internalPort = 80) -> deployments.create(resourceId)`, with Docker/OCI
static-server packaging for local and generic-SSH targets.

The remaining gap is entry experience, not the static runtime substrate: users should be able to
start from "deploy this folder/output and give me the URL" while Appaloft internally maps that
intent to the existing Resource and Deployment operations.

There is no `www` application in this repository at the time of this Spec Round. Website/marketing
copy changes should be implemented directly in the website code when that surface exists.
