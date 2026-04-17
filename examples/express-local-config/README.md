# express-local-config

Config-driven Express demo for local Appaloft deployment.

The checked-in `appaloft.json` includes a `$schema` reference to the generated deployment config
JSON Schema.

The app exposes:

- `GET /`
- `GET /health`

Deploy from the repository root:

```bash
bun run --cwd apps/shell src/index.ts deploy examples/express-local-config --config examples/express-local-config/appaloft.json
```

Or from this example directory:

```bash
bun run --cwd ../../apps/shell src/index.ts deploy . --config appaloft.json
```
