# @appaloft/adapter-runtime

Execution backend adapters.

Responsibilities:

- stateful fake execution backend for tests and Milestone 1
- future real deployment runtime adapters
- rollback and log streaming execution hooks
- Docker Execution Sandbox lifecycle, including provider-local hibernation and optional
  provider-family recovery through a shared-filesystem store

## Docker portable recovery

`DockerSandboxProvider` accepts an optional `portableRecovery` configuration:

```ts
{
  kind: "shared-filesystem",
  rootPath: "/mnt/appaloft-recovery",
  storeId: "workspace-recovery-a",
}
```

Every compatible worker must mount the same durable root and use the same explicit store id. The
provider stores digest-checked, one-shot recovery packages below the configured root; public
Sandbox state receives only an opaque handle. Appaloft does not create, mount or credential the
shared filesystem.

Must not:

- bypass application command handlers
