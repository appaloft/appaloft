# @yundu/plugin-sdk

Plugin authoring contract for Yundu.

Responsibilities:

- manifests, lifecycle hook names, capability schemas
- user-plugin and system-plugin distinction
- system-plugin web-extension / route / middleware contracts
- semver compatibility checks

Must not:

- load plugins by itself
