# default-access-domain-policies.show Query Spec

## Normative Contract

`default-access-domain-policies.show` reads persisted generated default access policy state for one
scope. It does not resolve generated hostnames, create policy state, expose provider internals, or
rewrite deployment route snapshots.

The query returns `policy = null` when the requested scope has no durable policy record. Static
installation configuration may still be used by route resolution as fallback, but readback must not
fabricate that fallback as persisted policy state.

## Input

```ts
type ShowDefaultAccessDomainPolicyInput = {
  scopeKind?: "system" | "deployment-target";
  serverId?: string;
};
```

Rules:

1. `scopeKind` defaults to `system`.
2. `serverId` is required when `scopeKind = "deployment-target"`.
3. `serverId` is not allowed for `system`.
4. Deployment-target scope validates that the server/deployment target exists before reading the override.

## Output

```ts
type DefaultAccessDomainPolicyRead = {
  schemaVersion: "default-access-domain-policies.policy/v1";
  id: string;
  scope: { kind: "system" } | { kind: "deployment-target"; serverId: string };
  mode: "disabled" | "provider" | "custom-template";
  providerKey?: string;
  templateRef?: string;
  updatedAt: string;
};

type ShowDefaultAccessDomainPolicyResponse = {
  schemaVersion: "default-access-domain-policies.show/v1";
  scope: { kind: "system" } | { kind: "deployment-target"; serverId: string };
  policy: DefaultAccessDomainPolicyRead | null;
};
```

## Errors

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `policy-readback-validation` | No | Query input shape is invalid. |
| `not_found` | `policy-scope-resolution` | No | Deployment-target scope references a missing or invisible server. |
| `infra_error` | `policy-persistence` | Conditional | Policy store read failed. |

## Entrypoints

| Entrypoint | Behavior |
| --- | --- |
| Web | System and server policy forms prefill from this query when a durable policy exists. |
| CLI | `appaloft default-access show --scope system\|deployment-target [--server <serverId>]`. |
| HTTP/oRPC | `GET /api/default-access-domain-policies/show` using this query schema. |
| Future MCP/tool | One read-only tool over the operation key and query schema. |

## Tests

- `DEF-ACCESS-POLICY-008`
- `DEF-ACCESS-POLICY-009`
- `DEF-ACCESS-POLICY-010`
- `DEF-ACCESS-ENTRY-007`
