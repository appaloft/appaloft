# source-events.resolve-preview-pull-request-context Internal Query Spec

## Normative Contract

`ResolvePreviewPullRequestContextQuery` is an internal query used by GitHub pull request preview
ingestion when trusted preview context headers are not supplied.

It is not a public API or operation-catalog entry. It resolves the single enabled Resource policy
that matches the GitHub repository and pull request base ref.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `repositoryFullName` | Required | GitHub repository full name from the verified webhook payload. |
| `baseRef` | Required | Pull request base ref. |
| `providerRepositoryId` | Optional | Provider repository id used to disambiguate source identity. |
| `installationId` | Optional | GitHub App installation id for error details. |

## Query Flow

1. Build the GitHub source identity from `repositoryFullName` and optional provider repository id.
2. Read source-event policy candidates from the application policy reader.
3. Keep only enabled candidates with server id, destination id, source-binding fingerprint, and a ref
   matching `baseRef` or `refs/heads/<baseRef>`.
4. Return the single matching preview context.
5. Reject no matches with `validation_error` at phase `preview-event-ingestion`.
6. Reject multiple matches with conflict at phase `preview-event-ingestion`.

## Boundary Rules

- Header parsing and webhook signature verification stay in the transport route.
- Candidate filtering and ambiguity rules stay in the application query.
- The route must not call `SourceEventPolicyReader` directly.

## References

- [GitHub Action PR Preview Deploy](../workflows/github-action-pr-preview-deploy.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
