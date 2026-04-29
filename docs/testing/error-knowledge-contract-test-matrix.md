# Error Knowledge Contract Test Matrix

## Scope

This matrix covers the cross-surface Error Knowledge Contract from
[ADR-033](../decisions/ADR-033-error-knowledge-contract.md) and the shared
[Error Model](../errors/model.md).

## Matrix

| Test ID | Preferred automation | Case | Given | Expected result |
| --- | --- | --- | --- | --- |
| ERROR-KNOWLEDGE-001 | contract | Core contract types | A structured error can carry optional knowledge | `DomainError` supports responsibility, actionability, links, and remedies without requiring docs dependencies in aggregates. |
| ERROR-KNOWLEDGE-002 | contract | Registry guide lookup | A known public `(code, phase)` such as `infra_error` + `remote-state-lock` is registered | The docs registry resolves human docs, an agent-readable JSON guide, responsibility, actionability, remedies, and spec references. |
| ERROR-KNOWLEDGE-003 | contract | Public docs anchors | A guide references a public topic | Both `zh-CN` and `en-US` docs pages contain the stable anchor. |
| ERROR-KNOWLEDGE-004 | contract | Agent-readable guide file | A guide exposes `llm-guide` | The JSON guide exists in public docs assets and includes safe details, diagnostics, remedies, human docs, and governing specs. |
| ERROR-KNOWLEDGE-005 | integration-preferred | CLI/GitHub Actions presentation | A public error reaches a shell or CLI boundary | The rendered output includes stable code/category/phase/retryable plus docs or guide links, not only `message`. |
| ERROR-KNOWLEDGE-006 | integration | Recovery affordance command | A public infrastructure error is actionable by an operator but blocks the normal mutation path | The guide and CLI expose an out-of-band diagnostic or stale-only recovery command that can run without acquiring the blocked mutation lock. |

## Current Coverage

- `ERROR-KNOWLEDGE-001` is covered by TypeScript typechecking in `@appaloft/core`.
- `ERROR-KNOWLEDGE-002`, `ERROR-KNOWLEDGE-003`, and `ERROR-KNOWLEDGE-004` are covered by
  `packages/docs-registry/test/help-topics.test.ts`.
- `ERROR-KNOWLEDGE-005` is covered by shell/CLI formatting paths that render `DomainError.knowledge`
  links and first safe remedies when available.
- `ERROR-KNOWLEDGE-006` is covered by `packages/adapters/cli/test/remote-state-command.test.ts`
  for SSH remote-state lock diagnostics and stale recovery, and by
  `packages/docs-registry/test/help-topics.test.ts` for registered command remedies.
