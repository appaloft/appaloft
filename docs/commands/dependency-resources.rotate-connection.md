# dependency-resources.rotate-connection Command Spec

## Intent

Replace Appaloft's stored connection material for one imported external dependency while preserving
its identity, bindings and safe secret reference.

## Input

- `dependencyResourceId`
- `connectionUrl` (secret transport input)

## Success

Returns `ok({ id })`, stores the new protected connection value, updates masked endpoint metadata,
and emits `dependency-resource-connection-rotated` after persistence. It does not redeploy or restart
bound resources.

## Failure

- `not_found` for an unknown dependency resource
- `validation_error`, phase `dependency-resource-connection-rotation`, for managed or deleted scope
- safe connection validation/storage failures without raw material in the error

## CLI

Use `appaloft dependency rotate-connection <dependencyResourceId> --connection-url-stdin` and pipe
the value from an owner-readable source. Standard input is captured before parser/runtime startup
and sent only in the typed request body. Do not place the URL in repository configuration, logs,
shell history or diagnostic output.
