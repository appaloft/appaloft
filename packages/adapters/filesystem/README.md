# @appaloft/adapter-filesystem

Filesystem-facing adapter package.

Responsibilities:

- workspace and local folder source detection
- local config discovery
- packaging input enumeration
- local static artifact payload storage, neutral route URL generation, and project/resource scoped
  current alias pointer storage for direct static artifact publishing extension-point tests

Must not:

- make deployment decisions outside the application layer
- choose hosted object storage, CDN, default-domain, IPFS, billing, or abuse policy
