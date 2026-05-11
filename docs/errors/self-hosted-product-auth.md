# Self-Hosted Product Auth Error Spec

## Scope

Errors for first-admin bootstrap, local product sessions, organization-role authorization, and
optional OAuth setup in self-hosted Appaloft.

## Error Catalog

| Code | Category | HTTP status | Phase | Retryable | Meaning |
| --- | --- | --- | --- | --- | --- |
| `first_admin_bootstrap_required` | `user` | `401` | `product-authentication` | No | A protected product operation requires a local first-admin/session, but bootstrap or login is not complete. |
| `first_admin_bootstrap_disabled` | `conflict` | `409` | `first-admin-bootstrap` | No | First-admin bootstrap was requested after an admin/organization owner already exists. |
| `first_admin_bootstrap_failed` | `infra` | `500` or `503` | `first-admin-bootstrap` | Conditional | The auth adapter or persistence layer could not create or verify the first admin and initial organization. |
| `product_auth_missing` | `user` | `401` | `product-authentication` | No | A protected product operation had no valid product session. |
| `product_auth_invalid` | `user` | `401` | `product-authentication` | No | A product session was malformed, expired, revoked, or unverifiable. |
| `product_auth_forbidden` | `user` | `403` | `product-authorization` | No | The authenticated user is not a member of the target organization or lacks the required role. |
| `oauth_provider_unavailable` | `validation` | `400` | `oauth-configuration` | No | A requested OAuth provider is disabled because required client id, client secret, callback URL, or trusted origin config is missing. |

## Redaction

- Passwords, generated one-time secrets, session tokens, OAuth client secrets, refresh tokens, and
  bearer credentials must not appear in error messages, details, logs, public docs metadata, or read
  models.
- Safe details may include `phase`, `providerKey`, `loginMethod`, `organizationId`, `requiredRole`,
  and `bootstrapRequired`.

## Related Specs

- [ADR-044: Self-Hosted First Admin Bootstrap](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
