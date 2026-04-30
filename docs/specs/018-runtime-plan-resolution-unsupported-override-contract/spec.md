# Runtime Plan Resolution Unsupported/Override Contract

## Status

- Round: Spec Round
- Artifact state: ready for Test-First Round
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; hardens public preview output and pre-execution failure
  semantics without adding deployment admission fields

## Business Outcome

Operators must see why a web service can or cannot be planned before Appaloft starts execution.
Unsupported frameworks, ambiguous evidence, and missing configuration must fail in
`runtime-plan-resolution` or the matching resource profile resolution phase before deployment
attempt acceptance, instead of becoming later build, runtime, or health failures.

The stable path is:

```text
Resource profile
  -> source inspection evidence
  -> planner precedence decision
  -> support tier
  -> ready plan or blocked preview
  -> explicit fix or override path
  -> deployments.create only when the same current profile can resolve a Docker/OCI plan
```

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Runtime plan resolution failure | A deterministic pre-execution decision that the current resource profile cannot produce a Docker/OCI runtime plan. | Workload planning / deployment preview | planner failure, plan blocked |
| Blocked preview | `deployments.plan/v1` response that returns `ok(...)` with readiness `blocked` and structured remediation rather than a transport error. | Deployment plan preview | blocked plan |
| Support tier | User-visible classification of the selected planner or blocked evidence. | Workload planning | planner support |
| Fix path | Stable remediation that changes resource profile, source selection, network profile, health policy, or config before deployment. | Preview/remediation | next action |
| Override path | Stable remediation where explicit user-owned profile fields intentionally win over inference, such as custom commands, Dockerfile, Compose, prebuilt image, internal port, or source base directory. | Preview/remediation | explicit fallback |
| Affected profile field | The resource profile field that should be edited to resolve a blocked preview. | Resource profile | profile field |

## Planner Precedence

Runtime plan resolution uses this precedence:

1. Explicit first-class Appaloft planner selection or accepted future runtime-profile hint, when a
   governing spec exists for that hint.
2. Explicit custom or container-native profile: Dockerfile, Docker Compose, prebuilt image, static
   strategy, or explicit install/build/start commands that make a Docker/OCI plan possible.
3. Buildpack accelerator candidate, only as adapter-owned fallback evidence.
4. Unsupported failure.

Explicit Dockerfile, Compose, prebuilt image, static strategy, source base directory, custom
commands, internal port, and explicit resource health policy override inferred framework/buildpack
evidence. If two explicit fields conflict, Appaloft must block with `requires-override` or
`incompatible-source-strategy`; it must not silently pick one.

## Support Tiers

The canonical support tiers are:

| Tier | Meaning |
| --- | --- |
| `first-class` | A named Appaloft planner owns the runtime family/framework contract and tests. |
| `explicit-custom` | Explicit install/build/start or equivalent custom runtime profile fields own the plan. |
| `container-native` | Explicit Dockerfile, Docker Compose, or prebuilt image profile owns the artifact path. |
| `buildpack-accelerated` | Adapter-owned buildpack evidence can describe an OCI image candidate, without replacing first-class planners. |
| `unsupported` | Evidence identifies a framework/runtime/target Appaloft cannot plan without explicit user profile input. |
| `ambiguous` | Evidence contains multiple plausible planners, build tools, source roots, app targets, or artifact outputs. |
| `requires-override` | Evidence may be deployable only after the user supplies an explicit source/runtime/network/profile override. |

## Blocked Preview Shape

Every blocked runtime plan preview must expose the same provider-neutral shape:

```ts
type DeploymentPlanBlockedReason = {
  phase:
    | "source-detection"
    | "runtime-plan-resolution"
    | "runtime-artifact-resolution"
    | "resource-network-resolution"
    | "runtime-target-resolution";
  reasonCode: RuntimePlanResolutionReasonCode;
  message: string;
  evidence: DeploymentPlanEvidenceSummary[];
  fixPath: DeploymentPlanFixPath[];
  overridePath: DeploymentPlanOverridePath[];
  affectedProfileField?: string;
};
```

Rules:

- `message` is human text only; callers must branch on `phase` and `reasonCode`.
- `evidence` is safe, typed planner evidence and must not include secrets, raw environment values,
  provider SDK responses, Docker daemon responses, or unbounded command output.
- `fixPath` points to the normal resource/profile/config edit that resolves the issue.
- `overridePath` is present only when explicit user-owned profile input can intentionally bypass or
  disambiguate inference.
- `affectedProfileField` uses resource profile vocabulary such as
  `source.baseDirectory`, `runtime.installCommand`, `runtime.buildCommand`,
  `runtime.startCommand`, `runtime.publishDirectory`, `runtime.dockerfilePath`,
  `runtime.dockerComposeFilePath`, `network.internalPort`, `network.targetServiceName`, or
  `health.policy`.

## Stable Reason Codes

The shared runtime plan resolution reason codes are:

- `unsupported-framework`
- `unsupported-runtime-family`
- `ambiguous-framework-evidence`
- `ambiguous-build-tool`
- `missing-build-tool`
- `missing-start-intent`
- `missing-build-intent`
- `missing-internal-port`
- `missing-source-root`
- `missing-artifact-output`
- `unsupported-runtime-target`
- `unsupported-container-native-profile`

Existing family-specific reason codes may remain as more specific aliases only when the preview
also maps them to one of the shared codes for cross-family tooling and future MCP/tool metadata.

## Explicit Override Behavior

The override contract is stable across all current and future planner families:

- Explicit start/build/install commands win over inferred commands.
- Explicit Dockerfile, Compose, and prebuilt image profiles win over framework detection and
  buildpack evidence.
- Explicit `network.internalPort` wins over detected or default port hints.
- Explicit `source.baseDirectory` wins over root-level ambiguous evidence.
- Explicit resource health policy wins over planner or buildpack health hints.
- Static shape defaults to `network.internalPort = 80`; serverful HTTP and SSR shapes require a
  supplied or deterministically persisted `network.internalPort`.

## Health And Environment Boundaries

Planner and buildpack evidence must not claim app-level health. They may suggest a probe target,
but only explicit resource health policy or a first-class planner contract can mark the health
source as explicit. Buildpack acceleration must not infer app-level health from buildpack metadata.

Environment/build/runtime variables stay under the existing environment/resource configuration
contract:

- secret values are masked in preview evidence, errors, logs, and read models;
- build-time variables must use `PUBLIC_` or `VITE_`;
- build-time variables cannot be marked secret;
- preview output must not create deployment-owned environment overrides.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RPR-FAIL-SPEC-001 | Unsupported framework blocked before execution | Source evidence identifies an unsupported framework and no explicit fallback commands exist | `deployments.plan` or planning for `deployments.create` runs | Preview/readiness is blocked with `unsupported-framework`, safe evidence, fix path, and override path. |
| RPR-FAIL-SPEC-002 | Ambiguous framework evidence requires override | Multiple plausible frameworks or runnable apps exist under the selected source root | Planning runs | Appaloft returns `ambiguous-framework-evidence` with source evidence and asks for `source.baseDirectory`, explicit strategy, or explicit commands. |
| RPR-FAIL-SPEC-003 | Ambiguous build tool requires selection | More than one build tool can own the selected runtime family | Planning runs | Appaloft returns `ambiguous-build-tool` and names the profile field that chooses the tool or source root. |
| RPR-FAIL-SPEC-004 | Missing serverful port is blocked | A serverful HTTP or SSR app lacks a persisted internal port | Planning runs | Appaloft blocks with `missing-internal-port` before execution. |
| RPR-FAIL-SPEC-005 | Static default port remains safe | A static shape has deterministic publish output | Planning runs | Appaloft defaults static-server `internalPort` to 80 and does not require user port input. |
| RPR-FAIL-SPEC-006 | Explicit start command fixes missing start | Source evidence lacks production start intent | User supplies `runtime.startCommand` | Explicit custom planning wins with support tier `explicit-custom`. |
| RPR-FAIL-SPEC-007 | Container-native profile cannot be stolen by detection | Source has framework/buildpack evidence and an explicit Dockerfile, Compose, or prebuilt image profile | Planning runs | Support tier is `container-native`; detection remains diagnostic only. |
| RPR-FAIL-SPEC-008 | Buildpack cannot steal explicit planner/profile | Source has buildpack evidence plus first-class or explicit profile evidence | Planning runs | First-class or explicit profile wins and buildpack is non-winning evidence. |
| RPR-FAIL-SPEC-009 | Plan preview parity | API/oRPC, CLI, Web, and future MCP/tool metadata consume a blocked plan | Each surface calls the same query/contract | The same phase, reason code, evidence, fix path, override path, and affected profile field are available. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source, runtime, network, health, access, and variable profile fields.
- Deployment owns only admitted attempts and immutable deployment snapshots.
- Runtime adapters own concrete Docker/buildpack/provider execution and target-specific rendering.
- Core may define only provider-neutral value objects or contract values for stable reason codes,
  support tiers, artifact kinds, and evidence summaries.

## Public Surfaces

- API/oRPC: `deployments.plan` returns `deployments.plan/v1` with the shared blocked/fix/override
  shape.
- CLI: `appaloft deployments plan ...` renders the same reason codes and next actions; JSON output
  preserves all fields.
- Web/UI: Resource deployment preview displays the typed plan contract and must not reimplement
  planner business logic in Svelte components.
- Repository config/headless: config maps to resource profile fields before ids-only deployment
  admission; unsupported fields fail before mutation.
- Future MCP/tools: metadata maps to `deployments.plan` and preserves support tier, blocked reason,
  evidence, fix path, override path, and affected profile field.
- Public docs/help: use existing deployment plan preview and resource profile help anchors unless
  Code Round adds new user-facing copy that needs a Docs Round update.

## Non-Goals

- Do not add Go, Ruby, PHP, .NET, Rust, or Elixir planners in this behavior, except tiny hermetic
  fake fixtures needed to prove the shared contract.
- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`,
  `deployments.cancel`, or a new deployment admission command.
- Do not change `deployments.create` ids-only input.
- Do not add source/runtime/network/buildpack/framework fields to `deployments.create`.
- Do not run real Docker, buildpack lifecycle, package installation, SSH mutation, or framework CLI
  execution unless a later governed adapter/runtime spec requires it.
- Do not store planner business logic in Web components or CLI renderers.

## Open Questions

- Should family-specific reason codes continue to be returned alongside shared reason codes, or
  should they move to evidence details once Web/CLI copy is fully migrated to the shared codes?
