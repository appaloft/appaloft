# environments.diff-profile

## Purpose

Compare two Environment Profiles as a read-only query. The query explains profile drift across
variables, resources, dependency bindings, custom routes, storage mounts, and unresolved target
profile decisions without mutating either environment.

## Input

- `environmentId`: source environment id.
- `targetEnvironmentId`: target environment id.
- `includeUnchanged`: optional boolean. Defaults to omitting unchanged entries.

## Output

- `sourceEnvironment` and `targetEnvironment`: environment summaries with secret variable values
  forced to masked values.
- `entries`: diff entries grouped by section:
  - `variable`
  - `resource`
  - `dependency-binding`
  - `route`
  - `storage`
  - `pending-decision`
- `counts`: added, removed, changed, and unchanged entry counts.
- `generatedAt`: query timestamp.

## Boundary

This is a query. It does not apply profile changes, create resources, bind dependencies, copy
storage data, regenerate domains, or resolve pending decisions. `environments.sync-profile` owns
selected write-side application and records follow-up decisions for target-specific values.

Secret values must not appear in the response. Implementations must mask secret environment values
even if an underlying read model accidentally returns raw values.
