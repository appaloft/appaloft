# ADR-093: AI Application Delivery Positioning And Claim Boundary

Status: Accepted

Date: 2026-07-20

## Context

Appaloft's public README and website describe an open source deployment control plane and an
AI-native one-file PaaS. Execution Sandbox, managed agent runtime and artifact-bound Promotion form
a broader developer journey, but public positioning must not market planned behavior as available
or imply that Appaloft owns model intelligence, end-user chat or application correctness.

## Decision

1. The durable public category is `AI Application Delivery Platform`.
2. The brand slogan is `Build with agents. Ship with proof.` Supporting copy may say
   `From secure agent sandboxes to verified production.` only when capability maturity is shown.
3. The primary persona is an application developer embedding coding-agent or chat-to-app behavior.
   General application deployment remains a first-class secondary journey.
4. Public information architecture follows four promises: `Run Agents`, `Work in Sandboxes`,
   `Preview & Promote`, and `Deploy & Verify`.
5. Public claims use one maturity vocabulary: `available`, `private-preview`, or `planned`. A claim
   advances only when operation contracts, docs, a runnable quickstart, acceptance evidence, known
   limits and recovery guidance agree.
6. `proof` means `Delivery Evidence Chain`: Source Artifact digest/provenance, Promotion plan and
   approval, Deployment identity/readback and machine-verifiable proof verdict. It does not mean
   formal verification, application correctness, security certification or compliance certification.
7. README, docs, website, SEO/structured data, social metadata, AI-readable text and in-product
   navigation must use the same maturity and proof boundaries.

## Consequences

- Agent and Sandbox capability receives top-level discoverability instead of remaining a hidden AI
  deploy use case.
- Existing deployment pages and quickstarts remain available but no longer dominate the home-page
  category and first CTA.
- Planned pages may explain architecture or collect preview interest, but their CTAs cannot behave
  as if an unavailable operation succeeds.

## Rejected Alternatives

- `all-in-one AI publishing platform`: overstates chat/model/orchestration ownership and makes
  publishing sound content-specific.
- `Agent Cloud` or `Sandbox Cloud`: crowded categories that omit the durable application delivery
  and proof boundary.
- Waiting for every slice before changing positioning: keeps the product direction hidden and
  prevents honest preview discovery.
