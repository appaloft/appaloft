# @yundu/plugin-builtins

Responsibility:

- ship built-in plugin definitions that are bundled with the product
- keep built-in plugin registration separate from `apps/shell`
- provide a clean starting point for user plugins and operator-installed system plugins

Allowed dependencies:

- `@yundu/plugin-sdk`
- lightweight helpers needed by bundled plugin definitions

Forbidden:

- direct database access
- direct HTTP adapter ownership
- provider-specific implementation logic
