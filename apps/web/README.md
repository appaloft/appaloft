# @appaloft/web

Static SvelteKit console for Appaloft.

## Role

- interface only
- calls the backend API
- does not own business logic
- builds to static assets via `@sveltejs/adapter-static`

## Commands

```bash
bun run dev
bun run build
bun run preview
bun run test:unit
bun run test:e2e
```

## Notes

- created with the official `sv` CLI
- styled with Tailwind CSS and `shadcn-svelte`
- bilingual structure is prepared with `zh-CN` as the default locale
