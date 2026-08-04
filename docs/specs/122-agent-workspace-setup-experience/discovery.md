# Discovery: Agent Workspace Setup Experience

## Business outcome

Organization members should understand the normal setup path as Agent, model access, and Workspace
Profile. Raw Adapter/Profile manifests remain available to integration authors without being the
primary first-run action.

## Existing evidence

- ADR-100 and Spec 117 own declarative Adapter/Profile distribution and tenant installations.
- The Organization settings page currently presents raw manifest installation as its primary CTA.
- Hosted products may contribute a credential setup route through the existing neutral Web extension
  contract; Community must not import or name a private provider.

## Owner-confirmed decisions

| Topic | Decision |
| --- | --- |
| Primary IA | Agents, Model connections, Workspace Profiles. |
| V1 labels | OpenCode and Pi are the built-in supported Agent choices; Codex is not advertised here. |
| Custom manifests | Adapter and Profile JSON actions move under Advanced / Custom integrations. |
| Hosted link | Discover a provider setup route through neutral extension metadata; absence is safe. |
| Runtime truth | Ready/not configured derives from installed Adapter/Profile query results. |

Owner confirmed the shared understanding on 2026-08-04 and authorized Spec, Ticket, and Code.
