# domain-binding-route-configured Event Spec

`domain-binding-route-configured` means a managed domain binding's route behavior changed between
serving traffic and redirecting to a canonical binding.

The event is emitted only after the binding state is persisted. It does not mean deployment route
realization, proxy reload, DNS ownership, or certificate readiness changed.

Payload includes binding id, owner scope, domain name, path prefix, redirect target/status when
present, configured timestamp, and safe correlation/causation ids.
