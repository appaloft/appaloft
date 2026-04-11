# ADR 0005: Keep The Web Interface Static-Only

## Context

The product must remain CLI/API first and cannot hide core logic inside the web app.

## Decision

Use SvelteKit only for a static frontend build.

## Consequences

- deployable to CDN, Nginx, or object storage
- backend remains the single source of truth
- avoids accidental business logic drift into the UI
