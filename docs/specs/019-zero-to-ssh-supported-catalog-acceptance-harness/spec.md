# Zero-to-SSH Supported Catalog Acceptance Harness

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented; hermetic supported catalog acceptance harness passing
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; adds acceptance coverage for existing supported catalog
  behavior without adding deployment commands or deployment admission fields

## Business Outcome

Phase 5 cannot call a framework or artifact path "supported" only because detection and planner
output exist. Every supported catalog entry must pass the same zero-to-SSH acceptance contract:

```text
supported fixture profile draft
  -> deployments.plan/v1 ready preview
  -> ids-only deployments.create admission path
  -> runtime target backend selection before acceptance
  -> Docker/OCI artifact intent parity
  -> fake/local/generic-SSH render/apply contract
  -> readiness, health, log, and access observation contract
```

The harness is the reusable admission standard for future planner families. Adding Go, Ruby, PHP,
.NET, Rust, Elixir, or another family later should mean adding fixture descriptors and planner
expectations to this contract, then proving the same stages, not inventing a family-specific deploy
command or Web-only branch.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Supported catalog acceptance harness | Table-driven fixture contract proving a supported catalog entry can move from resource profile draft through preview, ids-only create, runtime target, artifact, and observation stages. | Workload planning / runtime target acceptance | zero-to-SSH harness |
| Supported fixture descriptor | Reusable test descriptor for one supported fixture's resource source/runtime/network/health profile draft and expected planner/runtime/artifact/observation outcomes. | Test harness | fixture row |
| Fixture closure | Phase 5 exit state where every required supported catalog item is bound to matrix ids and the acceptance harness. | Roadmap / test matrix | catalog closure |
| Zero-to-SSH loop | The default single-server path from profile draft to a Docker/OCI-backed runtime target, using hermetic fake/local/generic-SSH target coverage by default and opt-in real Docker/SSH smoke above it. | Runtime target workflow | first deploy loop |
| Observation contract | Provider-neutral read visibility for readiness, health, logs, and access/proxy summary after the runtime target stage. | Resource/deployment observation | read model observation |

## Fixture Descriptor Contract

Every supported fixture descriptor must name:

| Field | Contract |
| --- | --- |
| `fixtureId` | Stable fixture id used in test names and diagnostics. |
| `runtimeFamily` / `framework` | Expected detected runtime family and framework, if any. |
| `profileDraft` | Resource source/runtime/network/health draft using resource profile vocabulary only. |
| `expectedPlannerKey` / `expectedSupportTier` | Selected planner and support tier exposed by preview and planning. |
| `expectedArtifactIntent` | Docker/OCI artifact intent: `build-image`, `prebuilt-image`, or `compose-project`. |
| `expectedCommandSpecs` | Sanitized install/build/package/start command specs or explicit command leaves. |
| `expectedInternalPort` | Static shapes default to static-server `80`; serverful/SSR shapes require explicit or deterministic persisted port before admission. |
| `expectedRuntimeTarget` | Required target kind/provider and capabilities, defaulting to single-server local-shell and generic-SSH contract coverage. |
| `expectedReadinessHealth` | Internal HTTP verification/readiness expectation and health policy source. |
| `expectedLogAccessObservation` | Runtime logs capability and access/proxy summary expectation. |

The descriptor must not contain deployment command fields such as framework, package name, base
image, buildpack, source/runtime/network overrides, Kubernetes namespace, Swarm stack, or Docker SDK
objects. Those facts are planner/runtime target output or adapter-owned render details.

## Acceptance Stages

| ID | Stage | Required proof |
| --- | --- | --- |
| ZSSH-STAGE-001 | Resource profile draft/build | Web, CLI, repository config, automation, and future tools can express the fixture using the shared resource profile vocabulary before deployment admission. |
| ZSSH-STAGE-002 | Preview ready | `deployments.plan/v1` returns `ready` with source evidence, planner/support tier, artifact, commands, network, health, warnings, and next action. |
| ZSSH-STAGE-003 | ids-only create | The create path uses only `projectId`, `environmentId`, `resourceId`, `serverId`, and optional `destinationId`; source/runtime/network/framework fields stay out of `deployments.create`. |
| ZSSH-STAGE-004 | Runtime target selected before acceptance | The runtime target backend registry can select the required single-server backend and reject unsupported providers/capabilities before safe acceptance. |
| ZSSH-STAGE-005 | Docker/OCI artifact parity | Preview and create planning agree on artifact intent, planner key, support tier, command specs, and internal port. |
| ZSSH-STAGE-006 | Fake/local/generic-SSH render/apply contract | Hermetic fake/default runtime backend coverage proves render/apply/verify/log capability without requiring a real SSH server. |
| ZSSH-STAGE-007 | Observation contract | Readiness, health, runtime logs, and access/proxy summaries are normalized read-model expectations, not Docker/SSH transport payloads. |

## Phase 5 Fixture Catalog

The acceptance harness must cover these supported entries:

| Catalog entry | Fixture descriptor | Expected support tier |
| --- | --- | --- |
| Next.js | `next-ssr` or equivalent Next runtime fixture | `first-class` |
| Vite static SPA | `vite-spa` | `first-class` |
| Astro static | `astro-static` | `first-class` |
| Nuxt generate | `nuxt-generate` | `first-class` |
| SvelteKit static | `sveltekit-static` | `first-class` |
| Remix | `remix-ssr` | `first-class` |
| FastAPI | `fastapi-uv` | `first-class` |
| Django | `django-pip` | `first-class` |
| Flask | `flask-pip` | `first-class` |
| Generic Node | `generic-node-server` | `first-class` or generic supported planner tier in current preview vocabulary |
| Generic Python | `python-explicit-start`, `generic-asgi-uv`, or `generic-wsgi-pip` | `explicit-custom` or first-class generic planner, depending on descriptor |
| Generic Java | `generic-java-jar` | `first-class` or generic supported planner tier in current preview vocabulary |
| Dockerfile | Explicit Dockerfile profile fixture | `container-native` |
| Docker Compose | Explicit Compose profile fixture | `container-native` |
| Prebuilt image | Explicit image profile fixture | `container-native` |
| Explicit custom commands | Explicit install/build/start profile fixture | `explicit-custom` |

Unsupported, missing, or ambiguous fixtures are negative controls. They must reuse the 018 blocked
preview contract with `phase`, shared `reasonCode`, safe `evidence`, `fixPath`, `overridePath`, and
`affectedProfileField` when applicable. They must not become deploy-time build/run/health failures
when the problem is knowable during planning.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ZSSH-SPEC-001 | Supported fixture preview and create parity | A descriptor for any Phase 5 supported fixture exists | The harness resolves preview and create planning | Planner key, support tier, artifact intent, command specs, internal port, and health/access summary agree. |
| ZSSH-SPEC-002 | Static defaults are safe | A static fixture descriptor lacks user port input | The harness builds the resource profile draft | The network profile defaults to static-server `internalPort = 80` and preview/create do not ask for a deployment-owned port. |
| ZSSH-SPEC-003 | Serverful port is explicit or deterministic | A serverful/SSR fixture is selected | The harness builds the resource profile draft | The descriptor supplies or proves a deterministic persisted `network.internalPort` before create admission. |
| ZSSH-SPEC-004 | Runtime target backend is selected before acceptance | A fixture has a valid Docker/OCI artifact intent | The harness asks the backend registry for required capabilities | local-shell and generic-SSH contract coverage select `single-server`; unsupported providers/capabilities return structured rejection. |
| ZSSH-SPEC-005 | Readiness/log/access observation is provider-neutral | A fixture passes hermetic runtime target contract coverage | The harness records observation expectations | Health, logs, and access/proxy summaries are expressed as normalized read-model expectations, not Docker/SSH payloads. |
| ZSSH-SPEC-006 | Unsupported/ambiguous controls stay blocked | A fixture lacks supported evidence or required profile fields | `deployments.plan/v1` preview runs | The result is blocked using the 018 shared contract and `deployments.create` is not treated as the fix surface. |
| ZSSH-SPEC-007 | Buildpack remains non-winning | A supported fixture has buildpack-detectable files plus explicit planner/custom/container-native evidence | Planning runs | The first-class, explicit custom, or container-native profile wins; buildpack evidence remains diagnostic. |

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input and runtime topology
  target selection.
- Resource owns reusable source, runtime, network, health, access, and variable profile fields.
- Deployment owns only accepted attempts and immutable deployment snapshots.
- Runtime target backends own concrete Docker/local-shell/generic-SSH render/apply/verify/log
  behavior in adapter packages.
- Core may own only provider-neutral contract/value objects for stable artifact, planner, target,
  and observation facts. Docker, SSH, provider SDK, and shell details remain outside core.

## Public Surfaces

- API/oRPC: no new operation; `deployments.plan` and `deployments.create` keep existing schemas.
- CLI: no new command; CLI config/headless/interactive flows must build resource profile drafts
  before ids-only create.
- Web/UI: no hidden Svelte business logic; Web consumes `deployments.plan` and shared resource
  profile draft vocabulary.
- Repository config: profile fields map to resource profile commands before create.
- Future MCP/tools: use the same plan/create/profile contracts.
- Public docs/help: existing deployment plan preview and resource profile anchors apply unless this
  harness changes user-visible copy in a later Docs Round.

## Non-Goals

- Do not add Go, Ruby, PHP, .NET, Rust, or Elixir planners.
- Do not add `deployments.retry`, `deployments.redeploy`, `deployments.rollback`, or another
  deployment admission command.
- Do not change `deployments.create` ids-only input.
- Do not add source/runtime/network/framework/buildpack fields to `deployments.create`.
- Do not require a real external SSH server or Docker daemon in default tests.
- Do not move Docker/SSH/provider-specific render/apply details into core.
- Do not claim buildpack execution or make buildpack the winning path for supported explicit
  planner/custom/container-native profiles.

## Open Questions

- Should the current generic Node/Python/Java preview support tier stay `first-class`, or should a
  future contract distinguish named framework support from generic language support in the user
  facing tier text?
