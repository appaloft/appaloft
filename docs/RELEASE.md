# Release

## Versioning

- use Git tags such as `v0.1.0`
- backend and web artifacts share the same product version
- plugin compatibility is checked against the app version

## Build

```bash
bun run build
bun run package:binary-bundle
bun run package:artifacts
bun run checksums
```

## Artifacts

- `yundu-backend`
- `yundu-web-static`
- `yundu-binary-bundle` containing a single executable, launcher script, and `.env.example`
- `docker-compose.selfhost.yml`
- `Dockerfile`
- `release-manifest.json`
- `checksums.txt`
- release archives created in CI for GitHub Releases

## GitHub Release Flow

`release.yml`:

- builds the repo
- packages artifacts
- archives the self-contained Bun binary bundle
- creates archives
- generates checksums
- builds the all-in-one Docker image
- uploads release assets to GitHub Releases

## Checksums

`scripts/release/generate-checksums.ts` produces SHA-256 checksums for the release directory.

## Release Notes

GitHub-generated notes are used as the default base.
Future work can add structured sections for:

- highlights
- breaking changes
- migrations
- operational notes
