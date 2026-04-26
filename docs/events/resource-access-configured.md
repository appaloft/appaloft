# resource-access-configured Event Spec

## Normative Contract

`resource-access-configured` records that `resources.configure-access` durably replaced a resource's
access profile.

The event is a durable fact, not proof that a generated access route, custom domain, certificate, or
proxy route is ready.

## Payload

```ts
type ResourceAccessConfiguredEventPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  generatedAccessMode: "inherit" | "disabled";
  pathPrefix: string;
  configuredAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include provider-native proxy configs, certificates, route credentials, tokens,
or deployment runtime logs.

## Consumers

Consumers may update resource read models, audit trails, access-readiness diagnostics, and future
deployment admission projections. They must not apply proxy routes, bind domains, issue
certificates, restart runtime, or change default access policy records.

## Error Handling

Producer failures before command success use `phase = event-publication` in
[Resource Lifecycle Error Spec](../errors/resources.lifecycle.md).

Consumer failures use `phase = event-consumption` and must not reinterpret the original command
result.
