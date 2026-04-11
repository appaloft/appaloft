# @yundu/config

Layered configuration resolver for Yundu.

Responsibilities:

- defaults, env vars, config file overlays
- runtime settings for hosted and self-hosted modes
- config precedence helpers

Must not:

- leak configuration lookup into domain entities
