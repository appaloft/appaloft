# Buildpack Accelerator Contract And Preview Guardrails

## Status

- Round: Spec Round -> Test-First Round -> Code Round -> Post-Implementation Sync
- Artifact state: buildpack accelerator preview contract implemented at schema/contract-test layer;
  real buildpack execution deferred
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; hardens public preview output and planner diagnostics
  without adding deployment admission fields

## Business Outcome

Operators deploying a web service that Appaloft cannot yet plan as a first-class framework should
still get a stable, explainable `detect -> plan` preview before execution. Buildpack-style
detection may provide evidence and an OCI image intent, but it is an adapter-owned accelerator, not
the Appaloft source of truth for common framework support.

The deployment boundary remains:

```text
Resource profile -> explicit framework planner -> deployments.plan preview
Resource profile -> explicit framework planner -> deployments.create execution

Resource profile -> buildpack accelerator candidate -> deployments.plan preview
Resource profile -> buildpack accelerator candidate -> deployments.create execution only when
governed by later adapter/runtime specs
```

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Buildpack accelerator | Adapter-owned detector/planner helper that can identify buildpack evidence and propose an OCI image plan when no explicit Appaloft planner or explicit container/custom profile owns the source. | Workload planning | buildpack-style detection, auto-detect candidate |
| Buildpack evidence | Safe detected facts such as platform files, language-family hints, framework hints, builder evidence, and detected buildpacks. | Source inspection / plan preview | buildpack detection output |
| Planner precedence | The ordering rule that prevents buildpack candidates from replacing explicit Appaloft planner support. | Workload planning | planner priority |
| Buildpack-accelerated support tier | Preview support classification for plans that are not first-class Appaloft framework planners but have adapter-owned buildpack evidence and a Docker/OCI image intent. | Deployment plan preview | accelerated fallback |
| Requires override | Support tier for evidence that may be deployable only after the user supplies explicit resource runtime, network, builder, or custom command configuration. | Deployment plan preview | needs configuration |
| Builder policy | Guardrail for default builder selection, allowed builder override, and blocked unsupported builders. | Runtime adapter boundary | buildpack builder policy |
| Fix path | Stable next action telling users which resource profile command, draft edit, or explicit fallback resolves a blocked preview. | Deployment plan preview | remediation path |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FPC-BP-SPEC-001 | Explicit planner precedence | A source has first-class planner evidence and also buildpack-detectable files | Planning runs | Appaloft selects the explicit planner, exposes buildpack evidence only as non-winning evidence when available, and does not change planner output. |
| FPC-BP-SPEC-002 | Explicit custom or container-native profile precedence | A resource selects Dockerfile, Compose, prebuilt image, static, or explicit custom commands | Planning runs | Strategy-specific or custom planning wins; buildpack evidence cannot override the explicit profile. |
| FPC-BP-SPEC-003 | Unknown but buildpack-detectable app | A source has no first-class planner but has safe buildpack platform/language/buildpack evidence | `deployments.plan` runs | Preview reports `buildpack-accelerated`, Docker/OCI image intent, evidence, limitations, and fix paths without generating deployment input overrides. |
| FPC-BP-SPEC-004 | Disabled or unavailable buildpack target | Buildpack acceleration is disabled or the selected target/backend cannot support the image-build/lifecycle capability | Preview runs | Preview is `blocked` with a stable reason and next action; deployment admission does not pretend the plan is first-class. |
| FPC-BP-SPEC-005 | Unsupported builder or lifecycle feature | Evidence requires a builder, run image, or lifecycle feature outside Appaloft policy | Preview runs | Preview is `blocked` with unsupported builder/lifecycle reason codes, safe evidence, and an allowed override/fallback path. |
| FPC-BP-SPEC-006 | Ambiguous or missing evidence | Multiple buildpacks, language families, or start intents conflict, or required evidence is absent | Preview runs | Preview is `blocked` or `requires-override`, never guessed, and points to resource runtime/profile fixes. |
| FPC-BP-SPEC-007 | Network and health guardrails | Buildpack evidence suggests ports or health endpoints | Planning runs | Persisted `ResourceNetworkProfile.internalPort` remains source of truth; buildpack does not infer app-level health unless explicit resource health policy exists. |
| FPC-BP-SPEC-008 | Environment boundary | Buildpack planning sees environment/build/runtime variables | Preview runs | Secret values are masked, build-time public variable rules are preserved, and buildpack output does not create deployment-owned env overrides. |
| FPC-BP-SPEC-009 | Preview parity | CLI, API/oRPC, Web, and future tool surfaces request a plan | They call `deployments.plan` | They receive the same `deployments.plan/v1` buildpack evidence, tier, artifact intent, limitations, blocked reasons, and next actions. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source, runtime, network, health, access, and variable profile fields.
- Deployment owns only admitted attempts and immutable snapshots after `deployments.create`.
- Runtime adapters/providers own buildpack detection execution, builder policy, lifecycle feature
  checks, generated buildpack plan details, and any future real `pack`/lifecycle execution.
- Core may define provider-neutral contract/value objects only when the evidence becomes stable
  platform vocabulary. Core must not import buildpack SDK, lifecycle, Docker SDK, provider SDK, or
  filesystem execution types.

## Precedence Contract

Planner selection order is:

1. Explicit container-native strategies: Dockerfile, Docker Compose, and prebuilt image.
2. Explicit static strategy or explicit custom/resource runtime commands.
3. First-class explicit Appaloft framework planners.
4. Generic language planners with deterministic evidence or explicit commands.
5. Buildpack accelerator candidate.

Buildpack acceleration must never be the only support path for Appaloft-owned mainstream
frameworks. It may surface evidence that helps later Quarkus, Micronaut, Go, Ruby, PHP, .NET, Rust,
and Elixir planners, but those families become first-class only through explicit planner rows,
tests, and preview parity.

## Public Surfaces

- API/oRPC: `deployments.plan` returns the stable preview shape with buildpack accelerator evidence
  when present.
- CLI: `appaloft deployments plan ...` renders the same evidence, limitations, blocked reasons,
  and next actions.
- Web/UI: Resource deployment preview uses the typed client result and does not hide buildpack
  planner rules in Svelte.
- Config/headless: repository config and CLI draft fields map to resource profile fields before
  ids-only deployment admission. Buildpack builder/runtime fields are not `deployments.create`
  fields.
- Events: not applicable; this behavior adds no deployment lifecycle events.
- Public docs/help: existing deployment plan preview and resource source/runtime anchors cover the
  fix path. If Code Round adds user-visible copy beyond existing preview fields, update the public
  docs/help registry in the same round.
- Future MCP/tools: tool metadata must map to `deployments.plan` and preserve the same evidence,
  reason-code, limitation, and next-action contract.

## Non-Goals

- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`,
  `deployments.cancel`, or manual health-check commands.
- Do not change `deployments.create` from ids-only admission.
- Do not add source, runtime, network, framework, package name, base image, buildpack, builder,
  run-image, lifecycle, or provider SDK fields to `deployments.create`.
- Do not let buildpack replace first-class Appaloft framework planners for common frameworks.
- Do not hide planner business logic in Web components or CLI renderers.
- Do not execute real `pack`, buildpack lifecycle, Docker, SSH, install, build, or app code in this
  round unless a later Code Round adds governed adapter/runtime tests.
- Do not claim full buildpack execution support; hermetic fake adapter output is sufficient for
  this contract/preview round.

## Open Questions

- Which concrete buildpack implementation should become the first real adapter after the contract:
  Cloud Native Buildpacks, Nixpacks, Railpack, or generated Dockerfile fallback? This round keeps
  the contract neutral.
