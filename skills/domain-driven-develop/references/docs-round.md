# Docs Round

Use this reference when a behavior changes user-visible input, output, status, recovery, workflow sequencing, entrypoint affordances, help text, or public terminology.

## Purpose

Docs Round turns internal behavior into user-facing language without leaking implementation jargon. It also keeps public terms aligned with the bounded context's ubiquitous language.

## Outcomes

Choose one outcome:

- new task page;
- new concept page;
- new reference page;
- new troubleshooting page;
- stable anchor on an existing page;
- not user-facing, with reason;
- explicit docs migration gap.

## Help Surfaces

Check relevant surfaces:

- Web/UI help;
- CLI help and examples;
- API descriptions and schema docs;
- config file comments or reference docs;
- error messages and recovery guidance;
- messages/events surfaced to users;
- future tool or MCP descriptions;
- stable help anchors;
- search aliases;
- locale state when the project has localization;
- agent-readable docs or tool descriptions when the project exposes them.

## Language Rule

Public docs should use user-task language, but they must not invent a separate domain model.

If public wording differs from canonical domain language:

- keep the canonical term in internal docs and code;
- document the public term as an alias or user-facing label;
- translate at the boundary;
- avoid letting marketing or transport labels replace aggregate, command, event, or error names.

## Do Not

- Do not mirror internal DDD folders one-to-one into public docs.
- Do not expose DDD, CQRS, aggregate, repository, port, adapter, or handler terminology in primary user docs unless the page is explicitly advanced or contributor-facing.
- Do not call a user-visible behavior complete without a docs/help outcome or documented exception.

## Docs-Impact Checklist

Run this checklist on every change before it is considered ready to merge, not only changes that
already look documentation-shaped. It is the gate, not an optional extra step.

1. **Classify.** Does this change add, remove, or alter user-controlled input, observable output,
   status, recovery, workflow sequencing, or an entrypoint affordance (Web, CLI, HTTP/API, config
   file, MCP/tool)? If no, record `not user-facing` with a one-line reason in the PR/spec and stop.
2. **Locate.** If yes, find the owning public docs page under the project's canonical IA. Prefer an
   existing page/anchor over a new one; prefer a new page over stretching an unrelated page's scope.
3. **Decide the outcome.** Pick exactly one: new task/concept/reference/troubleshooting page, stable
   anchor on an existing page, or an explicit migration gap naming the missing page/anchor/surface.
   "I'll document it later" with no named gap is not a valid outcome.
4. **Register.** If the project has a machine-readable docs/help registry (for example
   `@appaloft/docs-registry`), add or update the topic row in the same change. A behavior change with
   no registry diff and no recorded exception is incomplete, not merely under-documented.
5. **Cross-surface check.** If the same behavior is reachable from more than one surface (Web and
   CLI, CLI and API, etc.), confirm every reachable surface uses the same public vocabulary and
   targets the same anchor; do not let one surface silently lag.
6. **Locale check.** If the project has more than one required-complete locale, confirm the change
   does not leave a previously `complete` locale in `needs-update` without recording that state
   explicitly.
7. **State it in the round report.** Whoever closes the round (Code Round report, PR description, or
   ticket) must state the chosen outcome in one line: page/anchor, "not user-facing: <reason>", or
   "migration gap: <what's missing>". A reviewer should be able to find this without re-deriving it
   from the diff.
