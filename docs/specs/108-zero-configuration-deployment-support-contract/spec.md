# Zero-Configuration Deployment Support Contract

## Status

- Round: Post-Implementation Sync / Docs
- Artifact state: Implemented; bounded workspace discovery, explicit application-root selection,
  stable plan identity, command provenance, and the current real-Docker-supported framework set are
  active. Automatic framework detection from remote Git is Unsupported.
- Behavior id: `108-zero-configuration-deployment-support-contract`
- Governing workflows: [Workload Framework Detection And Planning](../../workflows/workload-framework-detection-and-planning.md)
  and [Quick Deploy](../../workflows/quick-deploy.md)
- Governing acceptance evidence: [Workload Framework Detection And Planning Test Matrix](../../testing/workload-framework-detection-and-planning-test-matrix.md)

## Business Outcome

Users can determine whether Appaloft can deploy a source without runtime configuration before they
start a deployment. Public support claims must distinguish implemented detection from a complete
real-smoke-proven deployment path and must not imply that Unsupported remote-Git automatic
detection, Preview explicit-profile remote Git, or Unsupported workload archives are complete.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Zero-configuration deployment | Appaloft can inspect the selected application root, select a planner, derive safe build/start/artifact/network defaults, and pass the real Appaloft Docker path without runtime-profile overrides. The generic-SSH gate is tracked separately. Server, project, environment, credentials, secrets, and domain policy are still explicit context. |
| Supported | The current implementation has detector/planner coverage and a matching passed real Appaloft Docker fixture or substrate smoke. A wired secret-gated generic-SSH descriptor is recorded separately and is not represented as a passed SSH run unless that evidence exists. |
| Preview | A bounded implementation path exists, but the complete source-materialization-to-runtime path lacks matching real-smoke evidence or still requires explicit profile input. Preview is not a zero-configuration support claim. |
| Unsupported | Appaloft cannot safely derive a complete current plan for that input. Planning must stop rather than guess. |
| Selected application root | The directory Appaloft inspects as one deployable application. It may be the supplied local directory, the single root found by bounded workspace discovery, or an explicitly selected `source.baseDirectory`. Multiple candidate roots block until one is selected. |

## Support Classification Rule

A row is `Supported` only when all of the following evidence exists:

1. Safe file-only source detection under the selected application root.
2. Deterministic planner output for install/build/start or static artifact packaging.
3. Resource-owned network and health input sufficient before ids-only deployment admission.
4. An active descriptor in
   `apps/shell/test/e2e/support/framework-docker-smoke-fixtures.ts` or an active container-native
   substrate smoke.
5. A passed real Appaloft Docker build/run/HTTP verification. Generic-SSH coverage is reported as a
   separate wired or passed confidence gate and must not be inferred from Docker success.

Unit fixtures, headless planning, type vocabulary, or an implemented detector alone are not enough
to mark a row `Supported`.

## Current Support Matrix

| Input or application shape | Status | Current evidence and limitation |
| --- | --- | --- |
| Local single-app root: Next.js runtime/standalone/static export | Supported | Active detector/planner fixtures and real Docker/generic-SSH descriptors cover these exact modes. Conflicting output modes still block. |
| Local single-app root: Vite, React, Vue, Svelte, Solid, Angular static SPA | Supported | Active static planner fixtures build and run through the Appaloft static server. |
| Local single-app root: Astro static, Nuxt generate, SvelteKit adapter-static | Supported | Active real-smoke descriptors cover only these static modes. |
| Local single-app root: Remix, Express, Fastify, NestJS, Hono, Koa, generic Node with a production start script | Supported | Active real-smoke descriptors prove generated workspace images and HTTP verification. |
| Local single-app root: FastAPI, Django, Flask, deterministic generic ASGI/WSGI, supported Poetry web project | Supported | Active real-smoke descriptors prove the current Python tool and app-target rules. |
| Local single-app root: Spring Boot Maven/Gradle, Quarkus Maven JVM mode, deterministic generic runnable jar | Supported | Active real-smoke descriptors prove the named build-tool and runnable-artifact paths. |
| Local single-app root: Sinatra/Rack | Supported | Detector/planner coverage is active and the real Appaloft Docker smoke passed build, run, and HTTP verification. Rails remains Preview. |
| Local single-app root: Go Gin | Supported | Detector/planner coverage is active and the real Appaloft Docker smoke passed build, run, and HTTP verification. Other Go framework paths are not promoted by this evidence. |
| Local single-app root: ASP.NET Core | Supported | Detector/planner coverage is active and the real Appaloft Docker smoke passed build, run, and HTTP verification. |
| Local single-app root: Rust Axum | Supported | Detector/planner coverage is active and the real Appaloft Docker smoke passed build, run, and HTTP verification. Other Rust framework paths are not promoted by this evidence. |
| Explicit Dockerfile, Compose, or prebuilt image profile | Supported | Active substrate smoke proves these explicit fallback paths, but the user must select the container-native profile and required file, service, image, and network values; they are not zero-configuration detection. |
| Explicit install/build/start command profile | Supported | Active explicit-command smoke proves the fallback path; Appaloft does not infer the missing intent, so this is not zero-configuration detection. |
| Rails, Laravel, Symfony, or Phoenix local root | Preview | Detectors/planners exist, but these exact paths do not have passed real Appaloft Docker smoke. Sinatra/Rack evidence does not promote Rails, and no PHP or Phoenix path is promoted. |
| Public remote Git URL relying on automatic framework/runtime detection | Unsupported | Appaloft does not clone a remote repository for framework inspection during create or plan. Clone it locally for automatic detection. |
| Public remote Git URL with an explicit Dockerfile, Compose, prebuilt-image, or install/build/start command profile | Preview | The explicit profile avoids automatic framework inspection, but dedicated remote source-to-runtime smoke is incomplete and authenticated remote-Git parity is not claimed. |
| General workload `.zip` or source archive relying on automatic detection | Unsupported | General archive extraction-to-framework-inspection-to-runtime planning is not a completed path. `static-artifacts publish` is a separate already-built static artifact workflow, not workload archive auto-detection. |
| Bounded local monorepo discovery with one deployable root | Preview | Discovery is implemented, but no dedicated real Appaloft Docker monorepo smoke has promoted the source shape. |
| Local monorepo using explicit `source.baseDirectory` | Preview | Create and plan inspect the selected root and preserve it in source evidence; dedicated source-to-runtime real smoke remains incomplete. Remote Git still requires an explicit container-native or command profile. |
| Monorepo root with multiple candidate applications and no explicit selection | Unsupported | Bounded discovery returns the candidate roots and blocks with ambiguity until `source.baseDirectory` selects one; Appaloft never picks the first root. |
| SvelteKit server adapter, Astro SSR, Nuxt SSR, worker inference, or ambiguous hybrid mode | Unsupported | No complete current first-class deterministic planner plus real-smoke support exists for these inferred modes. |
| Buildpack execution | Unsupported | Buildpack evidence is preview diagnostics only; real `pack`/lifecycle execution is not wired. |

## Detection And Evidence Contract

Detection is file-only and runs under the selected application root. It may inspect manifests,
lockfiles, framework configuration, production scripts, runtime version files, well-known project
files, and deterministic artifact paths. It must not install dependencies or execute project code.

Every result exposed to a user must include enough safe evidence to explain the decision:

- selected source kind and application root;
- detected runtime family, framework, package manager or build tool, and relevant files/scripts;
- selected planner and support tier, or blocked phase and reason code;
- inferred build, start, publish directory, artifact, and port facts that affect the plan;
- the explicit field that can repair or override a blocked inference.

`deployments.plan` also returns `planVersion = "1"` and a stable `sha256:` fingerprint over the
effective plan excluding generation time. Repeating an unchanged source/profile/target plan keeps
the fingerprint; selecting another application root or changing an accepted override changes it.
Each install/build/start command records provenance as `planner` or
`resource-runtime-profile`, so users can distinguish inference from an explicit override.

Missing evidence is a reason to block, not evidence for a generic production command.

## Override Precedence

The effective precedence is:

1. Explicit Dockerfile, Compose, prebuilt-image, or static strategy and its profile fields.
2. Explicit install/build/start commands and explicit artifact/publish fields.
3. Explicit `source.baseDirectory` selecting one application root.
4. Explicit resource network port and health policy.
5. Framework-specific evidence under the selected root.
6. Generic language planner evidence.
7. Buildpack diagnostic candidate.
8. Unsupported or ambiguous blocked result.

An explicit container-native profile owns artifact construction. Framework and buildpack evidence
may remain diagnostic but cannot silently replace it. Explicit commands replace inferred commands;
an explicit port and health policy replace hints.

## Fail-Closed Troubleshooting Contract

Before mutation when possible, or before deployment acceptance otherwise, Appaloft must stop on an
unreadable source, missing application root, ambiguous framework/build tool/app target, missing
production start/build intent, missing artifact output, missing serverful port, or unsupported
runtime target. The result must identify a stable phase/reason and one or more safe recovery paths:

- point the source at the exact local application directory;
- set `source.baseDirectory` when using a repository root;
- select Dockerfile, Compose, prebuilt image, or static strategy explicitly;
- provide explicit install/build/start or publish-directory values;
- provide the Resource internal port and health policy;
- for remote Git automatic detection, clone locally; otherwise provide an explicit
  container-native or command profile and treat that remote path as Preview;
- extract a workload archive locally before relying on auto-detection;
- use `deployments.plan` to confirm the selected planner and evidence before creating a deployment.

Appaloft must not fall back to a development server, pick the first monorepo application, infer an
archive layout, or turn a planning error into a later image-build or health failure.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ZERO-CONFIG-SUPPORT-001 | Supported claim requires real smoke | A framework has detector and planner tests | Its public status is evaluated | It is Supported only when a matching real Appaloft Docker fixture/substrate smoke passed; wired generic-SSH status is reported separately. |
| ZERO-CONFIG-SUPPORT-002 | Remote Git is not overclaimed | A public Git URL has no explicit runtime/container profile | Create or plan evaluates the source | Automatic framework/runtime detection is Unsupported because remote repositories are not cloned for inspection; explicit container-native or command profiles remain Preview without authenticated-parity or complete real-smoke claims. |
| ZERO-CONFIG-SUPPORT-003 | Archive is not overclaimed | A workload archive is supplied | No completed extraction/inspection/runtime path exists | Public docs distinguish it from static artifact publishing and mark workload archive auto-detection Unsupported. |
| ZERO-CONFIG-SUPPORT-004 | Bounded monorepo discovery and explicit selection | A workspace contains zero, one, or multiple deployable roots | Detection runs in create or plan | One bounded root may be selected, explicit `source.baseDirectory` wins, and zero/multiple valid roots block with safe candidate evidence instead of guessing. |
| ZERO-CONFIG-SUPPORT-005 | Override precedence is explainable | Explicit profile values conflict with inferred evidence | Planning resolves the effective profile | Explicit strategy/commands/root/network/health fields win in the documented order and inference remains diagnostic. |
| ZERO-CONFIG-SUPPORT-006 | Blocked result is actionable | Required evidence is missing or ambiguous | Plan or entry preflight blocks | The result includes phase/reason, safe evidence, and the exact profile or source correction; no deployment is presented as successful. |
| ZERO-CONFIG-SUPPORT-007 | Plan identity is stable | The effective source/profile/target plan is unchanged or an override/root changes | `deployments.plan` runs repeatedly | `planVersion` remains `1`; the fingerprint is stable for equivalent plans and changes for a changed effective plan. |
| ZERO-CONFIG-SUPPORT-008 | Command provenance is visible | Planner inference or explicit runtime-profile commands produce a ready plan | Command specs are returned | Every install/build/start command identifies `planner` or `resource-runtime-profile` provenance. |

## Public Surfaces

- Public support table and troubleshooting:
  `apps/docs/src/content/docs/{en/,}deploy/sources.md#zero-configuration-support`.
- First-deployment guidance links to that stable anchor.
- Internal workflow and test matrix use the same Supported/Preview/Unsupported meanings.
- This artifact synchronizes already-implemented behavior; this documentation pass introduces no
  additional TypeScript edits.

## Non-Goals

- Completing public remote-Git source-to-runtime real smoke, authenticated remote-Git inspection,
  or workload archive materialization.
- Promoting Rails, Laravel, Symfony, Phoenix, or any framework not backed by its own passed real
  Appaloft Docker smoke.
- Adding planner selection fields to `deployments.create`.
- Treating server, credentials, secrets, domain policy, or project/environment selection as
  zero-configuration concerns.
