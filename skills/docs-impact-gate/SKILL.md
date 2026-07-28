---
name: docs-impact-gate
description: Classify whether a public Appaloft or Cloud code change needs a docs outcome before merge, and record that outcome against the docs registry. Use before finishing any change that touches Web, CLI, HTTP/API, config-file, or MCP/tool user-visible behavior, and whenever a PR or ticket lacks a stated Docs Round outcome.
---

# Docs Impact Gate

This skill is the actionable, repository-specific version of the general
[Docs Round](../domain-driven-develop/references/docs-round.md) checklist. Use it as a merge gate,
not as optional follow-up work. A change with an undeclared docs outcome is not done, even if the
outcome turns out to be "not user-facing."

## When To Run This

Run this before you consider any of the following changes finished:

- a new or changed CLI command, flag, prompt, or output shape;
- a new or changed HTTP/oRPC route, request/response field, or status code;
- a new or changed Web input, display, or affordance;
- a new or changed repository config file field;
- a new or changed error code or recovery path;
- a new or changed MCP/tool parameter or description;
- any change to workflow sequencing a user can observe (ordering, retries, timeouts, defaults).

If none of the above apply, state `not user-facing` with a one-line reason and stop — you do not
need to write a docs page for internal refactors, test-only changes, or pure implementation detail.

## Steps

1. **Classify.** Decide whether this change is user-facing per the list above. If not, record
   `not user-facing: <reason>` in the PR/spec/ticket and stop.
2. **Locate the owning page.** Check [Public Documentation Structure](../../docs/documentation/public-docs-structure.md)
   for the IA group and existing pages. Prefer reusing an existing page/anchor. Only add a new page
   when no existing page's scope fits.
3. **Pick one outcome:**
   - new task, concept, reference, or troubleshooting page (state the path);
   - a new stable anchor on an existing page (state the anchor id, following
     `<surface-or-topic>-<short-purpose>`);
   - `not user-facing: <reason>` (already covered above, listed here for completeness);
   - `migration gap: <missing page/anchor/surface>` — only when the team has explicitly accepted
     shipping the behavior before its docs, and the gap is named, not silent.
4. **Update `@appaloft/docs-registry`.** Add or update the topic entry (topic id, docs path, locale
   docs paths, explicit anchor, owning surfaces, related operation key, search aliases) in the same
   change. If the topic is high-confusion (users are likely to reach it from more than one surface or
   struggle with an ambiguous default), also add a row to
   [Public Docs Traceability](../../docs/documentation/public-docs-traceability.md).
5. **Check every reachable surface.** If Web, CLI, HTTP/API, config file, or MCP/tool can all reach
   this behavior, confirm they all point at the same anchor and use the same vocabulary. Do not leave
   one surface pointing at a stale or missing anchor.
6. **Check locale completeness.** Both `zh-CN` and `en-US` must reach `complete` locale state before
   the page's Docs Round is closed. If you cannot translate both now, mark the page's locale state
   explicitly (`stub`/`needs-update`/`deferred`) rather than leaving it implicit.
7. **State the outcome where a reviewer can find it.** Put one line in the PR description or ticket:
   the page/anchor, `not user-facing: <reason>`, or `migration gap: <what's missing>`.

## Cloud Repository Note

`appaloft-cloud` agents should read
`.codex/skills/appaloft-docs-impact-gate/SKILL.md` in that repository, which points back to this file
and adds the Cloud-only docs-injection contract (`docs/cloud/public-docs/**`,
`scripts/inject-cloud-docs.mjs`). The classification steps above are identical in both repositories;
only the Cloud-only injection mechanics differ.

## Common Mistakes

- Treating "I'll add docs in a follow-up PR" as an outcome. It is not one of the four valid outcomes
  unless the gap is explicitly named as a `migration gap`.
- Documenting only the Web surface when CLI/API/MCP can reach the same behavior.
- Adding a docs page without a docs-registry entry, so Web `?` links or CLI help have nothing stable
  to point at.
- Leaving `en-US` at `stub` after a `zh-CN` page reaches `complete`, with no locale state recorded.
- Inventing new anchor text per translated heading instead of keeping one stable anchor id across
  locales.
