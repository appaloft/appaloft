# Operate And Recover Error Contract

Operate reuses errors from every owning query and command. The presentation may translate only the
following adapter failures:

| Code | Category | Phase | Retryable | Meaning |
| --- | --- | --- | --- | --- |
| `operate_target_not_found` | validation | `operate-selection` | no | Explicit Resource or Deployment does not exist in the caller scope. |
| `operate_target_selection_required` | validation | `operate-selection` | no | More than one bounded target exists and headless input did not select one. |
| `operate_snapshot_unavailable` | infra | `operate-observation` | conditional | Required target evidence could not be read; optional section failures remain section-local. |
| `operate_action_not_ready` | conflict | `operate-admission` | conditional | Fresh owning readiness blocks or changed the requested action. |
| `operate_action_confirmation_required` | validation | `operate-confirmation` | no | A write action has not received its exact second confirmation. |
| `operate_presentation_failed` | infra | `operate-presentation` | yes | Renderer, protocol or teardown failed; no business mutation is inferred. |

Safe output may contain target ids, operation keys, bounded status, timestamps, stable blocker codes
and public docs links. It must not contain secret values, complete environments, raw provider
payloads, credential references with usable material, unbounded logs or renderer tokens.
