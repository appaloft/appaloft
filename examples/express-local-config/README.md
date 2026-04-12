# express-local-config

Config-driven Express demo for local Yundu deployment.

The checked-in `yundu.json` includes a `$schema` reference to the generated deployment config
JSON Schema.

The app exposes:

- `GET /`
- `GET /health`

Deploy from the repository root:

```bash
bun run --cwd apps/shell src/index.ts deploy examples/express-local-config --config examples/express-local-config/yundu.json
```

Or from this example directory:

```bash
bun run --cwd ../../apps/shell src/index.ts deploy . --config yundu.json
```
