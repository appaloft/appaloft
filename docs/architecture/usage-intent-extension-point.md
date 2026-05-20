# Usage Intent Extension Point

Appaloft exposes a neutral usage intent extension point for integrations that need to observe a stable intent to record usage. The default Community implementation accepts the intent without side effects and returns `usage-intent-default-noop`.

The extension point is intentionally not a billing, pricing, quota, payment, invoice, subscription, or license interface. It records only a generic intent shape:

- idempotency key;
- capability key;
- optional tenant/account/organization and actor references;
- optional resource references;
- optional quantity and unit;
- source and attributes.

Implementations may use the idempotency key to deduplicate repeated inputs. Readback is a verification surface for records owned by the implementation. It must not mutate state.

Domain events are not billing events. A deployment, runtime, or resource domain event can become an input to a separate implementation only after an explicit adapter translates and validates it.
