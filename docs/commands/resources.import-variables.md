# resources.import-variables Command Spec

## Normative Contract

`resources.import-variables` is the source-of-truth command for importing pasted `.env` content into
one resource's resource-scoped variable override layer.

Command success means the parsed entries were durably stored on the `Resource` aggregate as
resource-scoped overrides. It does not mutate environment variables, historical deployment
snapshots, current runtime, domains, certificates, proxy routes, dependency bindings, or provider
secret stores.

```ts
type ImportResourceVariablesResult = Result<ImportResourceVariablesResponse, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success persists all imported entries atomically on the `Resource` aggregate;
- accepted success publishes or records `resource-variable-set` for each stored entry;
- returned entries mask secret values and never echo raw secret values;
- future `deployments.create` attempts materialize the effective deployment snapshot with imported
  resource overrides applied after environment precedence resolves.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [resources.set-variable Command Spec](./resources.set-variable.md)
- [resources.unset-variable Command Spec](./resources.unset-variable.md)
- [resources.effective-config Query Spec](../queries/resources.effective-config.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Persist multiple resource-scoped variables from pasted `.env` text. This is an operation-local
import command, not a generic resource update command and not a secret-store backend.

## Input Model

```ts
type ImportResourceVariablesCommandInput = {
  resourceId: string;
  content: string;
  exposure: "build-time" | "runtime";
  secretKeys?: string[];
  plainKeys?: string[];
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose override layer is changing. |
| `content` | Required | Pasted `.env` content. |
| `exposure` | Required | Exposure applied to every imported entry. |
| `secretKeys` | Optional | Keys that must be classified as `secret`. |
| `plainKeys` | Optional | Keys that must be classified as non-secret `plain-config`. |

The command always persists `scope = "resource"` and must not accept another scope from transport
callers.

## `.env` Parsing Rules

- Blank lines and lines beginning with `#` are ignored.
- `KEY=value` and `export KEY=value` are accepted.
- Keys must match `[A-Za-z_][A-Za-z0-9_]*`.
- Single-quoted and double-quoted values are unwrapped; unquoted values trim surrounding whitespace.
- Malformed lines, missing keys, missing `=`, unterminated quotes, and invalid keys reject the
  entire command with `validation_error`, `phase = resource-env-import-parse`.
- Duplicate `key + exposure` identities inside one import use last occurrence wins. The response
  reports duplicate line metadata.
- Existing resource-scoped entries with the same `key + exposure` are replaced. The response
  reports safe override metadata.

## Secret Classification Rules

- Keys listed in `secretKeys` are imported as `kind = "secret"` and `isSecret = true`.
- Keys listed in `plainKeys` are imported as `kind = "plain-config"` and `isSecret = false`.
- A key must not appear in both `secretKeys` and `plainKeys`.
- When neither list specifies a key, secret-like names such as `SECRET`, `PASSWORD`, `TOKEN`,
  `API_KEY`, `DATABASE_URL`, `CONNECTION_STRING`, `PRIVATE_KEY`, `SSH_KEY`, `CREDENTIAL`, or
  `CERT` are classified as secrets.
- Build-time variables must use `PUBLIC_` or `VITE_`.
- Build-time variables cannot be secrets, including explicitly classified secrets and secret-like
  inferred keys.

## Output Model

```ts
type ImportResourceVariablesResponse = {
  resourceId: string;
  importedEntries: Array<{
    key: string;
    value: string;
    exposure: "build-time" | "runtime";
    kind: "plain-config" | "secret";
    isSecret: boolean;
    action: "created" | "replaced";
    sourceLine: number;
  }>;
  duplicateOverrides: Array<{
    key: string;
    exposure: "build-time" | "runtime";
    firstLine: number;
    lastLine: number;
    rule: "last-wins";
  }>;
  existingOverrides: Array<{
    key: string;
    exposure: "build-time" | "runtime";
    previousScope: "resource";
    rule: "resource-entry-replaced";
  }>;
};
```

Secret `value` fields in `importedEntries` must be masked.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Parse `.env` content and reject unsafe or malformed input before mutation.
6. Classify secret/non-secret entries and enforce build/runtime exposure policy.
7. Apply all imported entries to the resource override layer.
8. Persist the updated `Resource` aggregate once.
9. Publish or record `resource-variable-set` events.
10. Return masked import summary.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Full paste/import UI deferred; existing resource detail can consume the oRPC command later. | Deferred gap |
| CLI | `appaloft resource import-variables <resourceId> --content <dotenv> --exposure <...>`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/variables/import` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Initial implementation uses existing resource aggregate variable storage and existing masked read
surfaces. It does not add a provider-native secret backend. Full Web paste/import UI is deferred,
but Web read surfaces continue to receive only masked values.

## Open Questions

- None for this baseline.
