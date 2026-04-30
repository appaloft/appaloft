# domain-binding-verification-retried Event Spec

`domain-binding-verification-retried` means Appaloft created a new ownership verification attempt
for an existing binding after DNS or evidence changed.

The event is not a replay of `domain-binding-requested` or `domain-bound`. It does not retry
certificate issuance, route repair, deployment retry, redeploy, or rollback.

Payload includes binding id, owner scope, domain name, path prefix, new verification attempt id,
retry timestamp, and safe correlation/causation ids.
