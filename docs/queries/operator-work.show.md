# operator-work.show Query Spec

## Metadata

- Operation key: `operator-work.show`
- Query class: `ShowOperatorWorkQuery`
- Input schema: `ShowOperatorWorkQueryInput`
- Handler: `ShowOperatorWorkQueryHandler`
- Query service: `OperatorWorkQueryService`
- Status: active query

## Normative Contract

`operator-work.show` reads one visible operator work ledger item by id. It is read-only and must not
retry, cancel, mark recovered, prune, or dead-letter the item.

The query returns:

```ts
type ShowOperatorWorkResult = Result<OperatorWorkDetail, DomainError>;
```

Missing work returns `not_found`.

## Input

```ts
type ShowOperatorWorkQueryInput = {
  workId: string;
};
```

## Output

The output is one `OperatorWorkItem` wrapped in `operator-work.show/v1`.

For deployment items the work id is the deployment id. For certificate items the work id is the
latest visible attempt id. For proxy bootstrap items, the first slice uses
`proxy-bootstrap:<serverId>` until durable proxy attempt history is introduced.
