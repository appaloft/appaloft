# @appaloft/deployment-config

Owns the Zod source schema for local Appaloft deployment config files and the generated JSON Schema.

Build the JSON Schema:

```bash
bun run build:schema
```

The HTTP adapter serves the same schema at:

```text
/api/schemas/appaloft-config.json
```
