# Appaloft plugin

Packages the Appaloft skill with the hosted MCP server for Cursor and Grok Bot.

- **Deploy:** turn a folder into a live URL (Git optional).
- **Agent:** set up coding agents and write or operate Appaloft apps.

The skill is copied from [`skills/appaloft`](../../skills/appaloft). That directory stays the product source of truth. Refresh the packaged copy with:

```bash
bun run scripts/sync-appaloft-marketplace-plugin-skill.ts
```

## MCP

Plugin MCP config is HTTP only. It points at `https://app.appaloft.com/mcp` and does not store a token, launch stdio, or run `npx`. Authenticate in the host when prompted.

`appaloft setup agent` remains the local-only, token-free Agent door. This plugin does not change that command.

## Marketplace submit

Listing this plugin on the Cursor marketplace is a later human step at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). Do not invent a publish API.
