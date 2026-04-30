# domain-binding-deleted Event Spec

`domain-binding-deleted` means managed custom-domain route intent is inactive/deleted after delete
safety checks and exact id confirmation.

The event does not revoke certificates, erase certificate history, delete generated access, rewrite
deployment snapshots, or remove server-applied route audit. It is emitted only after the binding
state is persisted.

Payload includes binding id, owner scope, domain name, path prefix, deleted timestamp, and safe
correlation/causation ids.
