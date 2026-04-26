# default-access-domain-policies.list Query Spec

## Normative Contract

`default-access-domain-policies.list` reads all persisted generated default access policy records.
It is a read-only operator visibility query. It must not generate default access hostnames, resolve
effective fallback configuration, mutate route state, or validate provider availability.

## Input

```ts
type ListDefaultAccessDomainPoliciesInput = {};
```

## Output

```ts
type ListDefaultAccessDomainPoliciesResponse = {
  schemaVersion: "default-access-domain-policies.list/v1";
  items: DefaultAccessDomainPolicyRead[];
};
```

`DefaultAccessDomainPolicyRead` is defined by
[default-access-domain-policies.show](./default-access-domain-policies.show.md).

## Errors

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `policy-readback-validation` | No | Query input shape is invalid. |
| `infra_error` | `policy-persistence` | Conditional | Policy store read failed. |

## Entrypoints

| Entrypoint | Behavior |
| --- | --- |
| Web | May use list for overview/readback when multiple persisted scopes are displayed together. |
| CLI | `appaloft default-access list`. |
| HTTP/oRPC | `GET /api/default-access-domain-policies`. |
| Future MCP/tool | One read-only tool over the operation key and query schema. |

## Tests

- `DEF-ACCESS-POLICY-011`
- `DEF-ACCESS-ENTRY-007`
